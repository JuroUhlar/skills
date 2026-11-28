// Collect one person's Notion pages and comments in a period, through Notion's hosted MCP server.
//
//   node collect-notion.ts [--token TOKEN_FILE] --from YYYY-MM-DD --to YYYY-MM-DD --out FILE
//
// TOKEN_FILE comes from notion-login.ts; it defaults to NOTION_TOKEN_FILE from the environment or .env.local. The public Notion API sees only pages shared with an integration;
// the MCP server acts as the signed-in user, so it sees what they see. Read-only: calls only search, self, and comments.
// - pages_created / pages_edited: workspace search filtered to the user, one month at a time.
// - comments: the user's comments in the period, on those pages. Comments on other pages are missed.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { addDays, fatal, fetchJson, inPeriod, isMain, log, monthChunks, now, periodArgs, writeJson } from "./common.ts";
import { NOTION_MCP, requestToken, saveToken } from "./notion-login.ts";
import { notionToken, timestamp, type Day, type NotionFile, type NotionToken, type Period, type Timestamp } from "./records.ts";
import { array, boolean, isObject, nullable, object, parse, string, withDefault, type Infer } from "./schema.ts";

const USAGE = "usage: collect-notion.ts [--token TOKEN_FILE] --from YYYY-MM-DD --to YYYY-MM-DD --out FILE";
const PAGE_SIZE = 50;

// MCP over HTTP: JSON-RPC requests; replies come as JSON or as server-sent events.

const rpcReply = object({ id: withDefault(nullable(string), () => null), result: withDefault(nullable(object({
  content: withDefault(array(object({ type: string, text: withDefault(string, () => "") })), () => []),
  isError: withDefault(boolean, () => false),
})), () => null), error: withDefault(nullable(object({ message: string })), () => null) });

class Mcp {
  private session: string | null = null;
  private id = 0;
  private token: NotionToken;
  private readonly tokenPath: string;
  constructor(token: NotionToken, tokenPath: string) {
    this.token = token;
    this.tokenPath = tokenPath;
  }

  private async send(body: object): Promise<Response> {
    if (this.token.expires_at < Date.now() + 5 * 60_000) {
      this.token = await requestToken({ grant_type: "refresh_token", refresh_token: this.token.refresh_token, client_id: this.token.client_id });
      saveToken(this.tokenPath, this.token);
    }
    const res = await fetch(`${NOTION_MCP}/mcp`, {
      method: "POST",
      signal: AbortSignal.timeout(120_000),
      headers: {
        Authorization: `Bearer ${this.token.access_token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream",
        ...(this.session ? { "mcp-session-id": this.session } : {}),
      },
      body: JSON.stringify(body),
    });
    if (res.status === 401) fatal("Notion rejected the token. Run notion-login.ts again.");
    this.session ??= res.headers.get("mcp-session-id");
    return res;
  }

  private async request(method: string, params: object): Promise<Infer<typeof rpcReply>> {
    const id = String(++this.id);
    for (let attempt = 1; ; attempt++) {
      const res = await this.send({ jsonrpc: "2.0", id, method, params });
      const text = await res.text();
      if ((res.status === 429 || res.status >= 500) && attempt < 6) {
        log(`  notion ${method}: HTTP ${res.status}, retrying in ${10 * attempt}s`);
        await new Promise((r) => setTimeout(r, 10_000 * attempt));
        continue;
      }
      if (!res.ok) throw new Error(`notion ${method}: HTTP ${res.status} ${text.slice(0, 300)}`);
      const messages = res.headers.get("content-type")?.includes("event-stream")
        ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => JSON.parse(l.slice(5)) as unknown)
        : [JSON.parse(text) as unknown];
      const reply = messages.find((m) => isObject(m) && String(m.id) === id);
      if (reply === undefined) throw new Error(`notion ${method}: no reply in response`);
      const r = parse(rpcReply, reply, `notion ${method}`);
      if (r.error) throw new Error(`notion ${method}: ${r.error.message}`);
      return r;
    }
  }

  async connect(): Promise<void> {
    await this.request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "perf-review", version: "1" } });
    await (await this.send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })).text();
  }

  /** Call a tool and return its text output. */
  async call(name: string, args: object): Promise<string> {
    const r = await this.request("tools/call", { name, arguments: args });
    const text = (r.result?.content ?? []).map((c) => c.text).join("\n");
    if (r.result?.isError) throw new Error(`notion ${name}: ${text.slice(0, 300)}`);
    return text;
  }
}

// Search

const searchHit = object({
  id: string, title: withDefault(string, () => ""), url: withDefault(string, () => ""), type: withDefault(string, () => "page"),
  timestamp: withDefault(nullable(timestamp), () => null), path: withDefault(string, () => ""),
});
const searchResult = object({ results: withDefault(array(searchHit), () => []) });
type Page = NotionFile["pages_created"][number];

const toPage = (h: Infer<typeof searchHit>): Page => ({ id: h.id, title: h.title, url: h.url, type: h.type, last_edited: h.timestamp, path: h.path });

/** All pages matching one filter kind in a period; a full page of results is split in half, since search caps results. */
async function searchRange(mcp: Mcp, kind: "created" | "edited", p: Period): Promise<Page[]> {
  const filters = kind === "created"
    ? { created_by_user_ids: ["me"], created_date_range: { start_date: p.from, end_date: p.to } }
    : { edited_by_user_ids: ["me"], last_edited_date_range: { start_date: p.from, end_date: p.to } };
  const text = await mcp.call("notion-search", { query: "", filters, sort: kind === "created" ? "created" : "last_edited", page_size: PAGE_SIZE, max_highlight_length: 0 });
  const hits = parse(searchResult, JSON.parse(text), `notion search ${kind} ${p.from}`).results;
  if (hits.length < PAGE_SIZE || p.from === p.to) {
    if (hits.length >= PAGE_SIZE) log(`  ${kind} ${p.from}: ${hits.length} results in one day, may be truncated`);
    return hits.map(toPage);
  }
  const days = (Date.parse(`${p.to}T00:00:00Z`) - Date.parse(`${p.from}T00:00:00Z`)) / 86_400_000;
  const mid: Day = addDays(p.from, Math.floor(days / 2));
  return [...await searchRange(mcp, kind, { from: p.from, to: mid }), ...await searchRange(mcp, kind, { from: addDays(mid, 1), to: p.to })];
}

async function searchAll(mcp: Mcp, kind: "created" | "edited", period: Period): Promise<Page[]> {
  const byId = new Map<string, Page>();
  for (const month of monthChunks(period)) for (const page of await searchRange(mcp, kind, month)) byId.set(page.id, page);
  return [...byId.values()];
}

// Comments: the tool returns <discussion> and <comment> tags; the user's own comments carry by-you="true".

const attr = (tag: string, name: string): string | null => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ENTITIES[e] ?? "");
export const htmlToText = (html: string) => decode(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).trim();

type Comment = NotionFile["comments"][number];
type Discussion = { id: string; resolved: boolean; nextCursor: string | null; comments: { at: Timestamp; byYou: boolean; text: string }[] };

export function parseDiscussions(text: string): { discussions: Discussion[]; omitted: number } {
  const body = (() => {
    try {
      const j: unknown = JSON.parse(text);
      return isObject(j) && typeof j.text === "string" ? j.text : text;
    } catch {
      return text;
    }
  })();
  const discussions: Discussion[] = [];
  for (const [, open = "", inner = ""] of body.matchAll(/(<discussion\s[^>]*>)([\s\S]*?)<\/discussion>/g)) {
    const comments = [...inner.matchAll(/(<comment\s[^>]*>)([\s\S]*?)<\/comment>/g)].flatMap(([, tag = "", html = ""]) => {
      const at = attr(tag, "datetime");
      return at === null ? [] : [{ at: parse(timestamp, at, "comment datetime"), byYou: attr(tag, "by-you") === "true", text: htmlToText(html) }];
    });
    discussions.push({ id: decode(attr(open, "id") ?? ""), resolved: attr(open, "resolved") === "true", nextCursor: attr(open, "next-cursor"), comments });
  }
  const head = /<discussions\s[^>]*>/.exec(body)?.[0] ?? "";
  const omitted = Number(attr(head, "total-count") ?? 0) - Number(attr(head, "shown-count") ?? 0);
  return { discussions, omitted: Math.max(0, omitted) };
}

async function commentsOn(mcp: Mcp, page: Page, period: Period, warnings: string[]): Promise<Comment[]> {
  const first = parseDiscussions(await mcp.call("notion-get-comments", { page_id: page.id, include_resolved: true }));
  if (first.omitted) warnings.push(`${first.omitted} discussions on "${page.title}" were not shown`);
  const out: Comment[] = [];
  for (const d of first.discussions) {
    const all = [...d.comments];
    for (let cursor = d.nextCursor; cursor; ) {
      const more = parseDiscussions(await mcp.call("notion-get-comments", { page_id: page.id, discussion_id: d.id, cursor, include_resolved: true })).discussions[0];
      all.push(...(more?.comments ?? []));
      cursor = more?.nextCursor ?? null;
    }
    for (const c of all) {
      if (c.byYou && inPeriod(c.at, period)) out.push({ page_id: page.id, page_title: page.title, page_url: page.url, discussion: d.id, at: c.at, resolved: d.resolved, text: c.text });
    }
  }
  return out;
}

async function main() {
  const { values } = parseArgs({ options: { token: { type: "string" }, from: { type: "string" }, to: { type: "string" }, out: { type: "string" } } });
  const { out, ...period } = periodArgs(values, USAGE);
  const tokenPath = values.token ?? process.env.NOTION_TOKEN_FILE;
  if (!tokenPath) fatal(`${USAGE}\nOr set NOTION_TOKEN_FILE. Get a token with notion-login.ts.`);
  const token = parse(notionToken, JSON.parse(readFileSync(tokenPath, "utf8")), "token file");
  const mcp = new Mcp(token, tokenPath);
  await mcp.connect();

  const self = parse(object({ user: object({ name: string }) }), JSON.parse(await mcp.call("notion-get-self", {})), "notion self");
  const user = self.user.name;
  log(`signed in to Notion as ${user}`);
  const pagesCreated = await searchAll(mcp, "created", period);
  const pagesEdited = await searchAll(mcp, "edited", period);
  log(`pages: ${pagesCreated.length} created, ${pagesEdited.length} edited`);

  const warnings: string[] = [];
  const pages = new Map([...pagesCreated, ...pagesEdited].map((p) => [p.id, p]));
  const comments: Comment[] = [];
  for (const page of pages.values()) comments.push(...await commentsOn(mcp, page, period, warnings));
  comments.sort((a, b) => a.at.localeCompare(b.at));

  const file: NotionFile = {
    source: "notion", user, period, collected_at: now(),
    method: [
      "Script through Notion's hosted MCP server, acting as the user.",
      "Page timestamps are last-edited times; the search filter guarantees the created or edited range.",
      "Comments are only those on pages the user created or edited in the period.",
      ...warnings,
    ].join(" "),
    pages_created: pagesCreated, pages_edited: pagesEdited, comments,
  };
  writeJson(out, file);
  log(`wrote ${out}: ${pagesCreated.length} pages created, ${pagesEdited.length} edited, ${comments.length} comments`);
}

if (isMain(import.meta.url)) await main();
