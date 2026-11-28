// Fetch every thread the user posted in, so a reply can be read with the messages it answers, and every
// message's emoji reactions. A top-level message without replies is stored as a one-message thread.
//
//   SLACK_USER_TOKEN=... node collect-slack-threads.ts --in DIR/current/slack.json --out DIR/current/slack-threads.json
//
// Needs channels:history and users:read on top of collect-slack.ts's scopes. One call per thread, so a
// year takes about 20 minutes. Resumable: rerunning skips threads already in --out.
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { env, fatal, isMain, log, now, readJson, writeJson } from "./common.ts";
import { call, ok } from "./collect-slack.ts";
import { slackFile, slackThreadsFile, slackTs, threadKey, type SlackThreadsFile, type ThreadMessage } from "./records.ts";
import { array, boolean, nullable, number, object, string, withDefault } from "./schema.ts";

const USAGE = "usage: SLACK_USER_TOKEN=... collect-slack-threads.ts --in SLACK_JSON --out THREADS_JSON";
const SAVE_EVERY = 25;

const nextCursor = withDefault(nullable(object({ next_cursor: withDefault(string, () => "") })), () => null);
const usersPage = ok(object({
  members: array(object({ id: string, name: withDefault(string, () => ""), real_name: withDefault(string, () => ""), profile: withDefault(nullable(object({ display_name: withDefault(string, () => "") })), () => null) })),
  response_metadata: nextCursor,
}));
// Not wrapped in ok(): a deleted thread or a channel the user left is recorded, not fatal.
const repliesPage = object({
  ok: boolean,
  error: withDefault(nullable(string), () => null),
  messages: withDefault(array(object({ ts: slackTs, user: withDefault(nullable(string), () => null), username: withDefault(nullable(string), () => null), text: withDefault(string, () => ""),
    reactions: withDefault(array(object({ name: string, count: number, users: withDefault(array(string), () => []) })), () => []) })), () => []),
  has_more: withDefault(boolean, () => false),
  response_metadata: nextCursor,
});

async function userNames(token: string): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  let cursor = "";
  do {
    const page = await call(token, "users.list", { limit: "200", ...(cursor ? { cursor } : {}) }, usersPage);
    for (const u of page.members) names.set(u.id, u.profile?.display_name || u.real_name || u.name || u.id);
    cursor = page.response_metadata?.next_cursor ?? "";
  } while (cursor);
  return names;
}

/** `me`: the user's id, whose own reactions don't count. */
async function thread(token: string, channel: string, ts: string, names: Map<string, string>, me: string): Promise<ThreadMessage[] | string> {
  const out: ThreadMessage[] = [];
  let cursor = "";
  do {
    const page = await call(token, "conversations.replies", { channel, ts, limit: "200", ...(cursor ? { cursor } : {}) }, repliesPage);
    if (!page.ok) return page.error ?? "unknown error";
    for (const m of page.messages) {
      const reactions = Object.fromEntries(m.reactions.map((r) => [r.name, r.count - (r.users.includes(me) ? 1 : 0)] as const).filter(([, n]) => n > 0));
      out.push({ ts: m.ts, user_id: m.user, name: (m.user && names.get(m.user)) || m.username || "unknown", text: m.text, reactions });
    }
    cursor = page.has_more ? (page.response_metadata?.next_cursor ?? "") : "";
  } while (cursor);
  return out;
}

async function main() {
  const { values } = parseArgs({ options: { in: { type: "string" }, out: { type: "string" } } });
  if (!values.in || !values.out) fatal(USAGE);
  const out = values.out;
  const slack = readJson(values.in, slackFile) ?? fatal(`${values.in} not found`);
  const token = env("SLACK_USER_TOKEN", "a Slack user token with channels:history and users:read");

  const file: SlackThreadsFile = (existsSync(out) ? readJson(out, slackThreadsFile) : null) ?? { source: "slack-threads", user_id: slack.user_id, collected_at: now(), threads: {}, missing: {} };
  const wanted = new Map<string, { channel: string; ts: string }>();
  for (const m of slack.messages) {
    const ts = m.thread_ts ?? m.ts;
    wanted.set(threadKey(m.channel_id, ts), { channel: m.channel_id, ts });
  }
  const todo = [...wanted].filter(([key]) => !(key in file.threads) && !(key in file.missing));
  log(`${wanted.size} threads, ${todo.length} to fetch`);
  if (!todo.length) return;

  const names = await userNames(token);
  let done = 0;
  for (const [key, { channel, ts }] of todo) {
    const result = await thread(token, channel, ts, names, slack.user_id);
    if (typeof result === "string") file.missing[key] = result;
    else file.threads[key] = result;
    if (++done % SAVE_EVERY === 0 || done === todo.length) {
      writeJson(out, { ...file, collected_at: now() });
      log(`  ${done}/${todo.length}`);
    }
  }
  log(`wrote ${out}: ${Object.keys(file.threads).length} threads, ${Object.keys(file.missing).length} missing`);
}

if (isMain(import.meta.url)) await main();
