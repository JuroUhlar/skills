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

// Highlights (written by the main agent from sub-agent candidates, so strict: a typo is an error, not a dropped field)

export const highlightTag = literal("initiative", "technical depth", "unblocking", "decision", "delivery", "coordination");
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
