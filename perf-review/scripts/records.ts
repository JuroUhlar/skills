// Schemas for the raw files collectors write and build-report reads. Types are inferred from them.
import {
  array, boolean, fail, literal, nullable, number, object, record, refine, strictObject, string, withDefault,
  type Infer, type Schema,
} from "./schema.ts";

// Dates and times

/** A calendar date, YYYY-MM-DD. */
export type Day = string & { readonly __brand: "Day" };
/** An ISO 8601 timestamp with a time zone, e.g. 2026-03-01T10:00:00Z or Jira's 2026-03-01T10:00:00.000+0000. */
export type Timestamp = string & { readonly __brand: "Timestamp" };

export function isDay(s: string): s is Day {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  // Date.parse rolls 2026-02-30 over to March and returns NaN for month 13; both fail the round trip.
  return !Number.isNaN(t) && new Date(t).toISOString().startsWith(s);
}

/** Milliseconds since the epoch. Normalizes Jira's +0000 offset, which Date.parse rejects. */
export function epochMs(t: Timestamp): number {
  return Date.parse(t.replace(/([+-]\d\d)(\d\d)$/, "$1:$2"));
}

export function isTimestamp(s: string): s is Timestamp {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(s) && !Number.isNaN(Date.parse(s.replace(/([+-]\d\d)(\d\d)$/, "$1:$2")));
}

export function toTimestamp(d: Date): Timestamp {
  const s = d.toISOString();
  if (!isTimestamp(s)) throw new Error(`invalid date ${String(d)}`);
  return s;
}

export const day = refine(string, isDay, "a YYYY-MM-DD date");
export const timestamp = refine(string, isTimestamp, "an ISO timestamp with a time zone");

export type Period = { from: Day; to: Day };
export const period: Schema<Period> = (v, p) => {
  const x = object({ from: day, to: day })(v, p);
  return x.from <= x.to ? x : fail(p, "from on or before to", v);
};

// GitHub

const actorFields = { login: nullable(string), type: nullable(string) };
export const actor = object(actorFields);
export type Actor = Infer<typeof actor>;

export const comment = object({ ...actorFields, at: timestamp, kind: literal("comment", "inline") });
export type Comment = Infer<typeof comment>;

export const reviewState = literal("APPROVED", "CHANGES_REQUESTED", "COMMENTED", "DISMISSED", "PENDING");
type ReviewFields = Actor & { body_chars: number; inline_comments: number };
/** A draft review the author hasn't submitted. It has no timestamp and is visible only to its author. */
export type PendingReview = ReviewFields & { state: "PENDING"; at: null };
export type SubmittedReview = ReviewFields & { state: Exclude<Infer<typeof reviewState>, "PENDING">; at: Timestamp };
export type Review = PendingReview | SubmittedReview;

const rawReview = object({ ...actorFields, state: reviewState, at: nullable(timestamp), body_chars: number, inline_comments: number });
export const review: Schema<Review> = (v, p) => {
  const r = rawReview(v, p);
  const base = { login: r.login, type: r.type, body_chars: r.body_chars, inline_comments: r.inline_comments };
  if (r.state === "PENDING") return { ...base, state: r.state, at: null };
  return r.at === null ? fail(`${p}.at`, "a timestamp on a submitted review", r.at) : { ...base, state: r.state, at: r.at };
};

export const truncation = literal("comments", "reviews", "review_threads", "thread_comments", "timeline");

const prFields = {
  repo: string,
  number: number,
  url: string,
  title: string,
  author: actor,
  state: literal("OPEN", "CLOSED", "MERGED"),
  created_at: timestamp,
  merged_at: nullable(timestamp),
  closed_at: nullable(timestamp),
  additions: number,
  deletions: number,
  changed_files: number,
  head_ref: string,
  labels: array(string),
  ready_for_review_at: array(timestamp),
  review_requests: array(object({ reviewer: nullable(string), type: nullable(string), at: timestamp })),
  reviews: array(review),
  comments: array(comment),
  truncated: array(truncation),
};
export const pr = object(prFields);
export type Pr = Infer<typeof pr>;
export const mergedPr = object({ ...prFields, state: literal("MERGED"), merged_at: timestamp });
export type MergedPr = Infer<typeof mergedPr>;

export function asMerged(p: Pr): MergedPr | null {
  return p.state === "MERGED" && p.merged_at !== null ? { ...p, state: p.state, merged_at: p.merged_at } : null;
}

export const githubFile = object({
  source: literal("github"),
  user: string,
  org: string,
  period,
  collected_at: timestamp,
  authored: array(mergedPr),
  reviewed: array(pr),
});
export type GithubFile = Infer<typeof githubFile>;

// Slack

/** Slack's message id: seconds since the epoch with a microsecond suffix, e.g. 1767348484.123456. */
export type SlackTs = string & { readonly __brand: "SlackTs" };
export const isSlackTs = (s: string): s is SlackTs => /^\d+\.\d+$/.test(s);
export const slackTs = refine(string, isSlackTs, "a Slack ts like 1767348484.123456");

export const slackMessage = object({
  ts: slackTs,
  at: timestamp,
  channel_id: string,
  channel: string,
  archived: boolean,
  shared: boolean,
  /** The thread's parent ts; equal to `ts` for a thread's first message, null outside threads. */
  thread_ts: nullable(slackTs),
  permalink: string,
  text: string,
});
export type SlackMessage = Infer<typeof slackMessage>;
export const isReply = (m: SlackMessage) => m.thread_ts !== null && m.thread_ts !== m.ts;

export const channelKind = literal("public", "dm", "group_dm", "private_channel", "unknown");
export type ChannelKind = Infer<typeof channelKind>;

export const slackFile = object({
  source: literal("slack"),
  user_id: string,
  user: string,
  team: string,
  team_url: string,
  period,
  collected_at: timestamp,
  skipped_non_public: record(number),
  messages: array(slackMessage),
});
export type SlackFile = Infer<typeof slackFile>;

/** Every thread the user posted in, and each top-level message as a one-message thread, written by collect-slack-threads.ts.
 * Gives replies their context and every message its reactions, without refetching. */
export const threadMessage = object({
  ts: slackTs,
  user_id: nullable(string),
  name: string,
  text: string,
  /** Emoji name to how many people reacted with it. */
  reactions: withDefault<Record<string, number>>(record(number), () => ({})),
});
export type ThreadMessage = Infer<typeof threadMessage>;
export const slackThreadsFile = object({
  source: literal("slack-threads"),
  user_id: string,
  collected_at: timestamp,
  /** Keyed by threadKey(channel_id, thread_ts). */
  threads: record(array(threadMessage)),
  /** Threads Slack wouldn't return, with its error, e.g. a deleted thread. */
  missing: withDefault<Record<string, string>>(record(string), () => ({})),
});
export type SlackThreadsFile = Infer<typeof slackThreadsFile>;
export const threadKey = (channelId: string, threadTs: string) => `${channelId}/${threadTs}`;

/** User id to display name, from everyone who posted in the collected threads. */
export function slackNames(threads: SlackThreadsFile | null): Map<string, string> {
  const names = new Map<string, string>();
  for (const thread of Object.values(threads?.threads ?? {})) for (const m of thread) if (m.user_id) names.set(m.user_id, m.name);
  return names;
}

/** A file attached to a Slack message, as conversations.replies and search.messages return it. */
export const slackAttachedFile = object({ name: withDefault(string, () => ""), title: withDefault(string, () => ""), pretty_type: withDefault(string, () => "") });
export type SlackAttachedFile = Infer<typeof slackAttachedFile>;

/** A rich attachment's plain-text summary, such as "shared a GIF" for a GIF from the picker. */
export const slackAttachment = object({ fallback: withDefault(string, () => "") });
export type SlackAttachment = Infer<typeof slackAttachment>;

/** The message text with a label per attached file, e.g. `(PNG: image.png)`, so a file-only message isn't blank.
 * A message still blank gets its attachments' summaries, e.g. `(shared a GIF)`; link previews on a message with text are left out. */
export function withFiles(text: string, files: readonly SlackAttachedFile[], attachments: readonly SlackAttachment[] = []): string {
  const labels = files.map((f) => {
    const names = [...new Set([f.title, f.name].filter(Boolean))].join(", ");
    return `(${[f.pretty_type || "file", names].filter(Boolean).join(": ")})`;
  });
  const withLabels = [text.trim(), ...labels].filter(Boolean).join(" ");
  return withLabels || attachments.map((a) => a.fallback.trim()).filter(Boolean).map((f) => `(${f})`).join(" ");
}

/** Slack's markup as plain text: `<https://x|label>` is `label (https://x)`, `<@U1>` is `@name`, a group's `<@S1>` is `@team`, `<#C1|eng>` is `#eng`,
 * `<!here>` is `@here`, a `<!date^…|fallback>` is its fallback text, and `&amp;` `&lt;` `&gt;` are unescaped. */
export function plainSlack(text: string, names: ReadonlyMap<string, string>): string {
  return text
    .replace(/<@S[A-Z0-9]+>/g, "@team")
    .replace(/<@([UW][A-Z0-9]+)(?:\|([^>]*))?>/g, (_, id: string, label?: string) => `@${names.get(id) ?? (label || "someone")}`)
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1")
    .replace(/<#[A-Z0-9]+\|?>/g, "#channel")
    .replace(/<!subteam\^[A-Z0-9]+(?:\|([^>]*))?>/g, (_, label?: string) => label || "@team")
    .replace(/<!date\^[^|>]*\|([^>]*)>/g, "$1")
    .replace(/<!([a-z]+)(?:\|[^>]*)?>/g, "@$1")
    .replace(/<((?:https?|mailto):[^|>]+)\|([^>]+)>/g, (_, url: string, label: string) => (label === url.replace(/^mailto:/, "") ? label : `${label} (${url})`))
    .replace(/<((?:https?|mailto):[^>]+)>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/** Reactions others left on one of the user's messages, or null when its thread wasn't collected.
 * Skin-tone variants count as the base emoji: `+1::skin-tone-2` is `+1`. */
export function reactionsOn(m: SlackMessage, threads: SlackThreadsFile | null): Record<string, number> | null {
  const thread = threads?.threads[threadKey(m.channel_id, m.thread_ts ?? m.ts)];
  if (thread === undefined) return null;
  const merged: Record<string, number> = {};
  for (const [name, n] of Object.entries(thread.find((t) => t.ts === m.ts)?.reactions ?? {})) {
    const base = name.replace(/::skin-tone-\d/g, "");
    merged[base] = (merged[base] ?? 0) + n;
  }
  return merged;
}

// Notion sign-in, written by notion-login.ts. Secret: never print or commit it.

export const notionToken = object({ client_id: string, access_token: string, refresh_token: string, expires_at: number });
export type NotionToken = Infer<typeof notionToken>;

// Jira

export const ticket = object({
  key: string,
  summary: string,
  type: nullable(string),
  status: nullable(string),
  project: nullable(string),
  priority: nullable(string),
  parent: nullable(string),
  created: timestamp,
  /** When the ticket first entered an In Progress status; null if it never did, or for files collected before this field. */
  started: withDefault(nullable(timestamp), () => null),
  resolved: nullable(timestamp),
  resolution: nullable(string),
  url: string,
});
export type Ticket = Infer<typeof ticket>;

export const jiraFile = object({
  source: literal("jira"),
  site: string,
  period,
  collected_at: timestamp,
  implemented: array(ticket),
  reported: array(ticket),
});
export type JiraFile = Infer<typeof jiraFile>;

// Notion (written by a sub-agent from MCP output, so optional fields are tolerated)

const notionPage = object({
  id: string,
  title: withDefault(string, () => ""),
  url: withDefault(string, () => ""),
  type: withDefault(string, () => "page"),
  /** Search returns only a last-edited time, even for pages found by creation date. */
  last_edited: withDefault(nullable(timestamp), () => null),
  path: withDefault(string, () => ""),
});
const notionComment = object({
  page_id: withDefault(string, () => ""),
  page_title: withDefault(string, () => ""),
  page_url: string,
  discussion: withDefault(string, () => ""),
  at: timestamp,
  resolved: withDefault(boolean, () => false),
  text: string,
});

export const notionFile = object({
  source: literal("notion"),
  user: string,
  period,
  collected_at: withDefault(nullable(timestamp), () => null),
  method: nullable(string),
  pages_created: withDefault(array(notionPage), () => []),
  pages_edited: withDefault(array(notionPage), () => []),
  comments: withDefault(array(notionComment), () => []),
});
export type NotionFile = Infer<typeof notionFile>;

// Jev scoring: criteria from references/jev-criteria.json, results in DIR/scores.jsonl (score-jev.ts).

/** `summary` is for people reading the report; Jev sees `instructions` and the `criteria` levels. */
export const jevCriteria = record(object({ summary: withDefault(string, () => ""), instructions: string, criteria: array(string) }));
export type JevCriteria = Infer<typeof jevCriteria>;
export const scoreLine = object({
  id: string,
  source: literal("slack", "notion"),
  at: timestamp,
  where: string,
  url: string,
  text: string,
  model: string,
  /** Per criterion: Jev's probability-weighted level, 0 to the number of levels minus 1. */
  scores: record(number),
  confidence: record(number),
});
export type ScoreLine = Infer<typeof scoreLine>;

// Highlights (written by the main agent from sub-agent candidates, so strict: a typo is an error, not a dropped field)

export const highlightTag = literal("initiative", "insight", "design", "ownership", "unblocking", "delivery", "coordination");
export const highlight = strictObject({
  title: string,
  why: string,
  tags: array(highlightTag),
  at: day,
  source: literal("slack", "notion", "github", "jira"),
  links: array(strictObject({ label: string, url: refine(string, (u): u is string => /^https:\/\//.test(u), "an https URL") })),
});
export const highlights = array(highlight);
export type Highlight = Infer<typeof highlight>;
