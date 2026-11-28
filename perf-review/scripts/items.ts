// The current period's Slack messages and Notion comments as uniform items, each with the conversation
// it belongs to, for scoring (score-jev.ts) and highlight picking (prepare-batches.ts).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "./common.ts";
import { isReply, jevCriteria, notionFile, plainSlack, reactionsOn, scoreLine, slackFile, slackNames, slackThreadsFile, threadKey, type JevCriteria, type ScoreLine, type Timestamp } from "./records.ts";
import { parse } from "./schema.ts";

/** `key`: the message's identity, so a thread's message is printed once across its items. */
export type ContextLine = { key: string; name: string; text: string; role: "thread start" | "earlier reply" | "page" };
export type Item = {
  id: string;
  source: "slack" | "notion";
  at: Timestamp;
  /** Where it was written, e.g. "#eng (thread reply)" or a Notion page title. */
  where: string;
  url: string;
  /** The conversation it belongs to: a Slack thread or a Notion discussion. Items sharing it are one effort. */
  thread: string;
  /** This message's identity, matching the `key` of its copy in a later item's context. */
  key: string;
  text: string;
  context: ContextLine[];
  /** Emoji reactions from others, e.g. {"joy": 3}. */
  reactions: Record<string, number>;
};

export const DEFAULT_CRITERIA = fileURLToPath(new URL("../references/jev-criteria.json", import.meta.url));
export const readCriteria = (path = DEFAULT_CRITERIA): JevCriteria => parse(jevCriteria, JSON.parse(readFileSync(path, "utf8")), path);

/** DIR/scores.jsonl from score-jev.ts, one line per item; if an item was scored twice, the later line wins. Empty without the file. */
export function readScores(dir: string): ScoreLine[] {
  const path = join(dir, "scores.jsonl");
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean).map((l, i) => parse(scoreLine, JSON.parse(l), `${path}:${i + 1}`));
  return [...new Map(lines.map((l) => [l.id, l])).values()];
}

const CONTEXT_CHARS = 1500;
const clip = (s: string) => (s.length > CONTEXT_CHARS ? `${s.slice(0, CONTEXT_CHARS)}…` : s);

/** `before`: how many messages just above a thread reply to include, besides the thread's first message. */
export function loadItems(dir: string, before = 3): { items: Item[]; person: string; missingThreads: number } {
  const slack = readJson(join(dir, "current", "slack.json"), slackFile);
  const threads = readJson(join(dir, "current", "slack-threads.json"), slackThreadsFile);
  const notion = readJson(join(dir, "current", "notion.json"), notionFile);
  const items: Item[] = [];
  let missingThreads = 0;
  const names = slackNames(threads);
  // The thread's display name, so the person reads the same in every message; the Slack handle only as a fallback.
  if (slack && !names.has(slack.user_id)) names.set(slack.user_id, slack.user);
  const plain = (text: string) => clip(plainSlack(text, names));

  for (const m of slack?.messages ?? []) {
    const context: ContextLine[] = [];
    if (isReply(m) && m.thread_ts) {
      const thread = threads?.threads[threadKey(m.channel_id, m.thread_ts)];
      if (thread === undefined) missingThreads++;
      else {
        const [root, ...rest] = thread;
        if (root) context.push({ key: threadKey(m.channel_id, root.ts), name: root.name, text: plain(root.text), role: "thread start" });
        for (const r of rest.filter((r) => r.ts < m.ts).slice(-before)) context.push({ key: threadKey(m.channel_id, r.ts), name: r.name, text: plain(r.text), role: "earlier reply" });
      }
    }
    const reactions = reactionsOn(m, threads) ?? {};
    items.push({ id: m.permalink, source: "slack", at: m.at, where: `#${m.channel}${isReply(m) ? " (thread reply)" : ""}`, url: m.permalink, thread: threadKey(m.channel_id, m.thread_ts ?? m.ts), key: threadKey(m.channel_id, m.ts), text: plainSlack(m.text, names), context, reactions });
  }
  for (const c of notion?.comments ?? []) {
    const id = `${c.discussion || c.page_url}@${c.at}`;
    items.push({
      id, source: "notion", at: c.at, where: `Notion comment on "${c.page_title}"`, url: c.page_url, thread: c.discussion || id, key: id, text: c.text,
      context: [{ key: `page:${c.page_url}`, name: "page", text: c.page_title, role: "page" }], reactions: {},
    });
  }
  items.sort((a, b) => a.at.localeCompare(b.at));
  return { items, person: (slack && names.get(slack.user_id)) ?? notion?.user ?? "the reviewed person", missingThreads };
}

/** The item as one block of text: the conversation first, then the person's message, marked as the one to judge.
 * `shown`: keys of messages already printed above, for later items of one thread; they are skipped, and this item's are added. */
export function renderItem(item: Item, person: string, shown?: Set<string>): string {
  const lines = [`${item.where}, ${item.at.slice(0, 10)}. The reviewed person is ${person}.`, ""];
  for (const c of item.context) {
    if (shown?.has(c.key)) continue;
    shown?.add(c.key);
    lines.push(c.role === "page" ? `Page: ${c.text}` : `${c.role === "thread start" ? "Thread start" : "Earlier reply"}, by ${c.name}:\n${c.text}`, "");
  }
  shown?.add(item.key);
  lines.push(`Final message, by ${person} (the one to rate):`, item.text);
  const reactions = Object.entries(item.reactions);
  if (reactions.length) lines.push("", `Colleagues reacted with: ${reactions.map(([k, n]) => `:${k}: ×${n}`).join(", ")}`);
  return lines.join("\n");
}

/** Defaults for standouts(): the top 5% of each criterion, if scoring at least 1 of 3. */
export const STANDOUT_PERCENT = 5, STANDOUT_FLOOR = 1;

/** Item id to the criteria it stands out on: in the criterion's top `percent` and scoring at least `floor` (of 3).
 * A fixed score cut-off would pick many items for criteria Jev scores generously and none for strict ones. */
export function standouts(lines: readonly ScoreLine[], percent: number, floor: number): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const k of new Set(lines.flatMap((l) => Object.keys(l.scores)))) {
    const sorted = lines.map((l) => l.scores[k] ?? 0).sort((a, b) => b - a);
    const cut = Math.max(floor, sorted[Math.max(1, Math.ceil((sorted.length * percent) / 100)) - 1] ?? Infinity);
    for (const l of lines) if ((l.scores[k] ?? 0) >= cut) out.set(l.id, [...(out.get(l.id) ?? []), k]);
  }
  return out;
}
