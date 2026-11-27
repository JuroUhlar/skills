// Collect one person's Slack messages in public channels for a period.
//
//   SLACK_USER_TOKEN=... node collect-slack.ts --from YYYY-MM-DD --to YYYY-MM-DD --out FILE
//
// Needs a user token with search:read and channels:read. Searches `from:<@me>` month by month, keeps public-channel
// messages only (including archived channels), and counts the DM and private-channel messages it skipped.
// Messages are kept by UTC date, matching the other sources.
import { parseArgs } from "node:util";
import { addDays, env, fetchJson, inPeriod, isMain, log, monthChunks, now, periodArgs, sleep, writeJson } from "./common.ts";
import { isSlackTs, slackTs, toTimestamp, type ChannelKind, type Period, type SlackFile, type SlackMessage, type SlackTs } from "./records.ts";
import { array, boolean, nullable, number, object, parse, string, withDefault, type Infer, type Schema } from "./schema.ts";

const USAGE = "usage: SLACK_USER_TOKEN=... collect-slack.ts --from YYYY-MM-DD --to YYYY-MM-DD --out FILE";
const MAX_PAGES = 100; // search.messages returns at most 100 pages of 100 results
const MAX_RATE_LIMIT_WAITS = 10;
const ARCHIVED_PER_QUERY = 20; // several in:#channel filters in one query are ORed

const status = object({ ok: boolean, error: nullable(string) });
const ok = <T>(s: Schema<T>): Schema<T> => (v, p) => {
  const st = status(v, p);
  if (!st.ok) throw new Error(`Slack ${p} failed: ${st.error ?? "unknown error"}`);
  return s(v, p);
};

const channel = object({
  id: nullable(string),
  name: nullable(string),
  is_im: withDefault(boolean, () => false),
  is_mpim: withDefault(boolean, () => false),
  is_private: nullable(boolean),
  is_channel: withDefault(boolean, () => false),
  is_group: withDefault(boolean, () => false),
  is_archived: withDefault(boolean, () => false),
  is_ext_shared: withDefault(boolean, () => false),
});
type Channel = Infer<typeof channel>;

const searchResponse = ok(object({
  messages: object({
    total: number,
    paging: object({ pages: number }),
    matches: array(object({ ts: slackTs, text: withDefault(string, () => ""), permalink: withDefault(string, () => ""), channel })),
  }),
}));
const authResponse = ok(object({ user_id: string, user: string, team: string, url: string }));
const channelsResponse = ok(object({
  channels: array(object({ name: string, is_archived: withDefault(boolean, () => false), updated: withDefault(number, () => 0) })),
  response_metadata: withDefault(object({ next_cursor: withDefault(string, () => "") }), () => ({ next_cursor: "" })),
}));

/** The thread parent's ts from a permalink's thread_ts parameter, or null outside threads or for an unparseable link. */
export function threadOf(permalink: string): SlackTs | null {
  if (!URL.canParse(permalink)) return null;
  const t = new URL(permalink).searchParams.get("thread_ts");
  return t !== null && isSlackTs(t) ? t : null;
}

/** Fails closed: anything not positively a public channel is excluded. */
export function channelKind(ch: Channel): ChannelKind {
  if (ch.is_im) return "dm";
  if (ch.is_mpim) return "group_dm";
  if (ch.is_private === false && ch.is_channel && !ch.is_group) return "public";
  return ch.is_private || ch.is_group ? "private_channel" : "unknown";
}

async function call<T>(token: string, method: string, params: Record<string, string>, schema: Schema<T>): Promise<T> {
  for (let waits = 0; ; waits++) {
    const raw = await fetchJson(`https://slack.com/api/${method}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (parse(status, raw, method).error === "ratelimited" && waits < MAX_RATE_LIMIT_WAITS) {
      log("  rate limited, waiting 30s");
      await sleep(30_000);
      continue;
    }
    return parse(schema, raw, method);
  }
}

/** Public channels archived since `since`. Archiving removes members, so list every channel. */
async function archivedPublicChannels(token: string, since: Period["from"]): Promise<string[]> {
  const cutoffMs = Date.parse(`${since}T00:00:00Z`);
  const names: string[] = [];
  let cursor = "";
  do {
    const r = await call(token, "conversations.list", { types: "public_channel", exclude_archived: "false", limit: "1000", cursor }, channelsResponse);
    names.push(...r.channels.filter((c) => c.is_archived && c.updated >= cutoffMs).map((c) => c.name));
    cursor = r.response_metadata.next_cursor;
  } while (cursor);
  return names;
}

async function main() {
  const { values } = parseArgs({ options: { from: { type: "string" }, to: { type: "string" }, out: { type: "string" } } });
  const { out, ...period } = periodArgs(values, USAGE);
  const token = env("SLACK_USER_TOKEN", "a Slack user token with search:read and channels:read");
  const me = await call(token, "auth.test", {}, authResponse);
  // Fail now, not after the searches, if channels:read is missing.
  await call(token, "conversations.list", { types: "public_channel", limit: "1" }, channelsResponse);

  const messages = new Map<string, SlackMessage>();
  const skipped = new Map<string, ChannelKind>();

  async function run(query: string, label: string) {
    let total = 0;
    for (let page = 1, pages = 1; page <= pages; page++) {
      const { messages: m } = await call(token, "search.messages", { query, sort: "timestamp", sort_dir: "asc", count: "100", page: String(page) }, searchResponse);
      ({ total } = m);
      pages = Math.min(m.paging.pages, MAX_PAGES);
      for (const x of m.matches) {
        const at = toTimestamp(new Date(Number(x.ts) * 1000));
        if (!inPeriod(at, period)) continue;
        const key = `${x.channel.id ?? "?"}/${x.ts}`;
        const kind = channelKind(x.channel);
        if (kind !== "public" || x.channel.id === null || x.channel.name === null) {
          skipped.set(key, kind === "public" ? "unknown" : kind);
          continue;
        }
        const threadTs = threadOf(x.permalink);
        messages.set(key, {
          ts: x.ts,
          at,
          channel_id: x.channel.id,
          channel: x.channel.name,
          archived: x.channel.is_archived,
          shared: x.channel.is_ext_shared,
          thread_ts: threadTs,
          permalink: x.permalink,
          text: x.text,
        });
      }
      await sleep(1500); // search.messages allows about 20 calls a minute
    }
    if (total > MAX_PAGES * 100) log(`  WARNING ${label}: ${total} matches, over the ${MAX_PAGES * 100} Slack search returns`);
    log(`slack ${label}: ${total} matches`);
  }

  // after: and before: are exclusive and use the token owner's Slack time zone, so search two days wider on each side
  // and keep messages by UTC date above.
  const window = (w: Period) => `after:${addDays(w.from, -2)} before:${addDays(w.to, 2)}`;
  for (const m of monthChunks(period)) await run(`from:<@${me.user_id}> ${window(m)}`, `${m.from}..${m.to}`);
  // A plain search skips archived channels; explicit in:#channel filters include them.
  const archived = await archivedPublicChannels(token, period.from);
  for (let i = 0; i < archived.length; i += ARCHIVED_PER_QUERY) {
    const chunk = archived.slice(i, i + ARCHIVED_PER_QUERY);
    await run(`from:<@${me.user_id}> ${chunk.map((n) => `in:#${n}`).join(" ")} ${window(period)}`, `${chunk.length} archived channels`);
  }

  const skippedCounts: Record<string, number> = {};
  for (const kind of skipped.values()) skippedCounts[kind] = (skippedCounts[kind] ?? 0) + 1;
  const file: SlackFile = {
    source: "slack",
    user_id: me.user_id,
    user: me.user,
    team: me.team,
    team_url: me.url,
    period,
    collected_at: now(),
    skipped_non_public: skippedCounts,
    messages: [...messages.values()].sort((a, b) => Number(a.ts) - Number(b.ts)),
  };
  writeJson(out, file);
  log(`wrote ${out}: ${messages.size} public messages, skipped ${JSON.stringify(skippedCounts)}`);
}

if (isMain(import.meta.url)) await main();
