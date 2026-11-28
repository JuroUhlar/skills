// Derive metrics from collected raw files and render an interactive HTML report.
//
//   node build-report.ts DIR [--bots login,login] [--same-repo old=new ...]
//
// --same-repo counts a renamed or replacement repo as one, e.g. --same-repo documentation=docs.
//
// DIR holds current/ and previous/, each with any of github.json, slack.json, jira.json, notion.json.
// DIR/highlights.json (optional) adds qualitative highlights for the current period.
// Writes DIR/metrics.json and DIR/report.html. Missing sources are listed in the report.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { parse } from "./schema.ts";
import { STANDOUT_FLOOR, STANDOUT_PERCENT, standouts } from "./items.ts";
import {
  AUTOMATED_BRANCH_PREFIXES, AUTOMATED_TITLE_RULE, BOT_LOGINS, automatedReason, earliest, fatal, hoursBetween, inPeriod, isBot, isMain, isNonEmpty, log, median, readJson, utcDay, writeJson,
} from "./common.ts";
import {
  epochMs, githubFile, highlights as highlightsSchema, reactionsOn, plainSlack, slackNames, scoreLine, slackThreadsFile, type ScoreLine, type SlackThreadsFile, isReply, jiraFile, notionFile, slackFile,
  type Actor, type Day, type GithubFile, type Highlight, type JiraFile, type MergedPr, type NotionFile, type Period, type Pr,
  type Review, type SlackFile, type SubmittedReview, type Ticket, type Timestamp,
} from "./records.ts";

type Count = [name: string, count: number];
type Histogram = { buckets: string[]; counts: number[] };
type DetailRow = { url: string; title: string; at: Timestamp } & Record<string, string | number>;

export type SourceMetrics = {
  /** Keys come from METRIC_KEYS, so a misspelled metric fails to compile. */
  metrics: Partial<Record<MetricKey, number | null>>;
  monthly?: Partial<Record<MetricKey, number[]>>;
  /** Full counts per category, largest first; the report compares each year's shares. */
  lists?: Record<string, Count[]>;
  histograms?: Record<string, Histogram>;
  details?: Record<string, DetailRow[]>;
  caveats: string[];
};

// Dates

function monthIndex(d: Day, start: Day): number {
  return (Number(d.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(d.slice(5, 7)) - Number(start.slice(5, 7));
}

/** Counts per calendar month of the period, so two periods line up on one axis. */
export function monthly<T>(items: T[], p: Period, at: (x: T) => Timestamp): number[] {
  const counts = new Array<number>(monthIndex(p.to, p.from) + 1).fill(0);
  for (const x of items) {
    const i = monthIndex(utcDay(at(x)), p.from);
    if (i >= 0 && i < counts.length) counts[i] = (counts[i] ?? 0) + 1;
  }
  return counts;
}

const roundTo = (v: number | null, digits: number) => (v === null ? null : Math.round(v * 10 ** digits) / 10 ** digits);

const countBy = (values: string[]): Count[] => {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
};

/** `edges` are bucket lower bounds, ascending; the last bucket is open-ended. */
export function histogram(values: number[], edges: number[], unit: string): Histogram {
  const buckets = edges.map((lo, i) => {
    const hi = edges[i + 1];
    return hi === undefined ? `${lo.toLocaleString("en")}+ ${unit}` : `${lo.toLocaleString("en")}–${(hi - 1).toLocaleString("en")}`;
  });
  const counts = edges.map(() => 0);
  for (const v of values) {
    const i = edges.findLastIndex((lo) => v >= lo);
    if (i >= 0) counts[i] = (counts[i] ?? 0) + 1;
  }
  return { buckets, counts };
}

const PR_SIZE_EDGES = [0, 10, 50, 100, 250, 500, 1000];

// GitHub

const isSubmitted = (r: Review): r is SubmittedReview => r.state !== "PENDING";


/** When the PR started waiting on `user`: when it became reviewable, or a later direct request to them. */
export function reviewStart(p: Pr, user: string, firstReviewAt: Timestamp): Timestamp {
  const first = epochMs(firstReviewAt);
  const ready = p.ready_for_review_at.filter((at) => epochMs(at) <= first);
  const reviewable = ready.length ? ready.reduce((a, b) => (epochMs(b) > epochMs(a) ? b : a)) : p.created_at;
  const asked = p.review_requests.filter((r) => r.reviewer === user && epochMs(reviewable) <= epochMs(r.at) && epochMs(r.at) <= first).map((r) => r.at);
  return isNonEmpty(asked) ? earliest(asked) : reviewable;
}

export function githubMetrics(g: GithubFile, bots: ReadonlySet<string> = new Set()): SourceMetrics {
  const { user, period } = g;
  const mine = (a: Actor) => a.login === user;
  const human = (a: Actor) => !isBot(a, bots);
  // A merged PR GitHub attributes to the user but a bot opened, e.g. Copilot assigned from an issue.
  const byAgent = (p: MergedPr) => p.author.login !== user;
  // Separate maps: a coding-agent PR can appear in both lists, automated only in the reviewed one.
  const authoredReason = new Map(g.authored.map((p) => [p.url, automatedReason(p, { bots, codingAgent: byAgent(p) })]));
  const authored = g.authored.filter((p) => !authoredReason.get(p.url));
  const authoredUrls = new Set(authored.map((p) => p.url));
  const reviewedReason = new Map(g.reviewed.map((p) => [p.url, automatedReason(p, { bots })]));
  const reviewed = g.reviewed.filter((p) => !reviewedReason.get(p.url));
  const excluded = new Map<string, DetailRow>();
  for (const p of [...g.authored, ...g.reviewed]) {
    const reason = authoredReason.get(p.url) ?? reviewedReason.get(p.url);
    if (reason && !authoredUrls.has(p.url)) excluded.set(p.url, { url: p.url, title: p.title, at: p.merged_at ?? p.created_at, reason });
  }

  /** Comments, inline comments, and review bodies by authors matching `who`. */
  const commentsBy = (p: Pr, who: (a: Actor) => boolean) => [
    ...p.comments.filter(who),
    ...p.reviews.filter((r): r is SubmittedReview => isSubmitted(r) && r.body_chars > 0 && who(r)),
  ];
  const received = (p: Pr) => commentsBy(p, (a) => human(a) && !mine(a));
  const mySubmitted = (p: Pr) => p.reviews.filter((r): r is SubmittedReview => mine(r) && isSubmitted(r));
  const myReviews = reviewed.flatMap((p) => {
    const rs = mySubmitted(p).filter((r) => inPeriod(r.at, period));
    const ats = rs.map((r) => r.at);
    return isNonEmpty(ats) ? [{ p, rs, first: earliest(ats) }] : [];
  });
  const reviewHours = reviewed.flatMap((p) => {
    const all = mySubmitted(p).map((r) => r.at);
    if (!isNonEmpty(all)) return [];
    const first = earliest(all);
    return inPeriod(first, period) ? [hoursBetween(reviewStart(p, user, first), first)] : [];
  });
  const myCommentsIn = (p: Pr) => commentsBy(p, mine).filter((c) => inPeriod(c.at, period)).length;
  const truncated = [...authored, ...reviewed].filter((p) => p.truncated.length).length;
  const agentPrs = authored.filter(byAgent).length;

  const perPr = (total: number, prs: number) => (prs ? Math.round((10 * total) / prs) / 10 : null);
  const per100 = (total: number, prs: number) => (prs ? Math.round((1000 * total) / prs) / 10 : null);
  const changeRequests = (rs: Review[], who: (a: Actor) => boolean) => rs.filter((r) => r.state === "CHANGES_REQUESTED" && who(r)).length;

  return {
    metrics: {
      merged_prs: authored.length,
      comments_per_pr: perPr(authored.reduce((n, p) => n + received(p).length, 0), authored.length),
      changes_requested_per_100_prs: per100(authored.reduce((n, p) => n + changeRequests(p.reviews, (a) => human(a) && !mine(a)), 0), authored.length),
      median_pr_diff_lines: median(authored.map((p) => p.additions + p.deletions)),
      median_hours_to_merge: median(authored.map((p) => hoursBetween(p.ready_for_review_at[0] ?? p.created_at, p.merged_at))),
      repos_contributed: new Set(authored.map((p) => p.repo)).size,
      reviewed_prs: myReviews.length,
      review_comments_per_pr: perPr(myReviews.reduce((n, { p }) => n + myCommentsIn(p), 0), myReviews.length),
      changes_requested_by_you_per_100_prs: per100(myReviews.reduce((n, { rs }) => n + changeRequests(rs, mine), 0), myReviews.length),
      median_hours_to_first_review: median(reviewHours),
      people_reviewed: new Set(myReviews.map(({ p }) => p.author.login)).size,
    },
    monthly: {
      merged_prs: monthly(authored, period, (p) => p.merged_at),
      reviewed_prs: monthly(myReviews, period, (r) => r.first),
    },
    lists: {
      "Repos (your merged PRs)": countBy(authored.map((p) => p.repo)),
      "Repos (PRs you reviewed)": countBy(myReviews.map(({ p }) => p.repo)),
      "Authors you reviewed": countBy(myReviews.map(({ p }) => p.author.login ?? "(deleted)")),
    },
    histograms: { "PR size (lines added plus deleted)": histogram(authored.map((p) => p.additions + p.deletions), PR_SIZE_EDGES, "lines") },
    details: {
      "merged PRs": authored.map((p) => ({ url: p.url, title: p.title, at: p.merged_at, repo: p.repo.split("/")[1] ?? p.repo, lines: p.additions + p.deletions, comments: received(p).length })),
      "PRs reviewed": myReviews.map(({ p, first }) => ({ url: p.url, title: p.title, at: first, author: p.author.login ?? "(deleted)", lines: p.additions + p.deletions, "your comments": myCommentsIn(p) })),
      "automated PRs left out of the numbers": [...excluded.values()],
    },
    caveats: [
      ...(agentPrs ? [`${agentPrs} merged PRs were opened by a coding agent on your behalf and are counted as yours.`] : []),
      ...(truncated ? [`${truncated} PRs hit a GraphQL page limit, so their comment counts are lower bounds.`] : []),
    ],
  };
}

// Slack

/** Which reactions count as a laugh or as appreciation. Checked in this order; anything else (👀 ✅ ➕, votes,
 * acknowledgements) counts toward neither. Patterns, so a workspace's custom emoji like `:thankyou:` match too. */
export const REACTION_GROUPS = [
  { group: "laugh", pattern: /joy|laugh|rofl|rolling_on_the_floor|lol|lmao|haha|kek|sweat_smile|grin|smile/ },
  { group: "other", pattern: /^(eyes|white_check_mark|heavy_check_mark|ballot_box_with_check|heavy_plus_sign|heavy_minus_sign|one|two|three|four|five|a|b|ack.*|ok|np|no_problem|lgtm|thinking_face|.*sad.*|cry.*|sob|disappointed|confused|ticket)$/ },
  { group: "appreciation", pattern: /thank|grat|pray|raised_hands|clap|tada|party|fire|heart|100|rocket|star|muscle|nice|kudos|bow|yes|teamwork|\+1|thumbsup|agree|bulb|brain|mind_blown|awesome|amazing|hero|trophy|medal|wow|exploding_head|chef|goat|love|great|perfect|hug/ },
] as const;
export const reactionGroup = (name: string): "laugh" | "appreciation" | "other" => REACTION_GROUPS.find((g) => g.pattern.test(name))?.group ?? "other";

/** `threads`: from collect-slack-threads.ts; without it there are no reaction numbers. */
export function slackMetrics(s: SlackFile, threads: SlackThreadsFile | null = null): SourceMetrics {
  const msgs = s.messages.filter((m) => inPeriod(m.at, s.period));
  const reacted = threads ? msgs.map((m) => ({ m, r: reactionsOn(m, threads) ?? {} })) : [];
  const names = slackNames(threads);
  const title = (text: string) => {
    const plain = plainSlack(text, names);
    return plain.length > 120 ? `${plain.slice(0, 120)}…` : plain;
  };
  const count = (r: Record<string, number>, group: string) => Object.entries(r).reduce((n, [k, v]) => n + (reactionGroup(k) === group ? v : 0), 0);
  const per100 = (group: string) => threads && msgs.length ? Math.round((1000 * reacted.reduce((n, { r }) => n + count(r, group), 0)) / msgs.length) / 10 : null;
  const top = (group: string) => reacted.filter(({ r }) => count(r, group) > 0).sort((a, b) => count(b.r, group) - count(a.r, group)).slice(0, 30)
    .map(({ m, r }) => ({ url: m.permalink, title: title(m.text), at: m.at, channel: `#${m.channel}`, reactions: count(r, group),
      emoji: Object.entries(r).filter(([k]) => reactionGroup(k) === group).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `:${k}: ${n}`).join(" ") }));
  const skipped = Object.entries(s.skipped_non_public);
  const skippedTotal = skipped.reduce((n, [, v]) => n + v, 0);
  return {
    metrics: {
      messages: msgs.length,
      threads_started_per_100_messages: msgs.length ? Math.round((1000 * msgs.filter((m) => !isReply(m)).length) / msgs.length) / 10 : null,
      active_channels: new Set(msgs.map((m) => m.channel_id)).size,
      appreciation_per_100_messages: per100("appreciation"),
      laughs_per_100_messages: per100("laugh"),
    },
    monthly: { messages: monthly(msgs, s.period, (m) => m.at) },
    lists: {
      "Slack channels": countBy(msgs.map((m) => m.channel)),
      ...(threads ? { "Reactions you received": countBy(reacted.flatMap(({ r }) => Object.entries(r).flatMap(([name, n]) => Array<string>(n).fill(`:${name}:`)))) } : {}),
    },
    ...(threads ? { details: { "most-appreciated Slack messages": top("appreciation"), "Slack messages with the most laughs": top("laugh") } } : {}),
    caveats: skippedTotal ? [`Slack excluded ${skippedTotal} messages in DMs and private channels (${skipped.map(([k, v]) => `${v} ${k}`).join(", ")}).`] : [],
  };
}

// Jira

/** Resolutions that close a ticket without implementing it. */
const NOT_DONE = /won.?t|duplicate|cancel|invalid|obsolete|not a bug|cannot reproduce|declined/i;
/** Hours counted for a ticket that went to Done without an In Progress status: a quick task or a backlog cleanup. */
const NO_START_HOURS = 2;
const NOT_DONE_RULE = "Won't Do, Duplicate, Cancelled, Invalid, Obsolete, Not a Bug, Cannot Reproduce, or Declined";

type ResolvedTicket = Ticket & { resolved: Timestamp };

export function jiraMetrics(j: JiraFile): SourceMetrics {
  // Count by UTC day like the other sources, so totals and monthly charts agree.
  const done = j.implemented.filter((t): t is ResolvedTicket => t.resolved !== null && inPeriod(t.resolved, j.period));
  const impl = done.filter((t) => !NOT_DONE.test(t.resolution ?? ""));
  const reported = j.reported.filter((t) => inPeriod(t.created, j.period));
  const dropped = done.length - impl.length;
  const unknownResolution = impl.filter((t) => t.resolution === null).length;
  // A ticket closed without ever entering In Progress was a quick task or a cleanup, so count it as a short fixed time.
  const daysToDone = (t: ResolvedTicket) => (t.started && epochMs(t.started) <= epochMs(t.resolved) ? hoursBetween(t.started, t.resolved) : NO_START_HOURS) / 24;
  const untimed = impl.filter((t) => !t.started || epochMs(t.started) > epochMs(t.resolved)).length;
  return {
    metrics: {
      tickets_implemented: impl.length,
      median_days_to_done: roundTo(median(impl.map(daysToDone)), 1),
      tickets_reported: reported.length,
    },
    monthly: {
      tickets_implemented: monthly(impl, j.period, (t) => t.resolved),
      tickets_reported: monthly(reported, j.period, (t) => t.created),
    },
    lists: { "Jira tickets by type": countBy(impl.map((t) => t.type ?? "(none)")) },
    details: {
      "Jira tickets implemented": impl.map((t) => ({ url: t.url, title: `${t.key} ${t.summary}`, at: t.resolved, type: t.type ?? "" })),
      "Jira tickets reported": reported.map((t) => ({ url: t.url, title: `${t.key} ${t.summary}`, at: t.created, type: t.type ?? "", status: t.status ?? "" })),
    },
    caveats: [
      ...(dropped ? [`Jira left out ${dropped} done tickets resolved as won't do, duplicate, or similar.`] : []),
      ...(untimed ? [`${untimed} of ${impl.length} implemented Jira tickets never passed through an In Progress status, so days to done counts each as ${NO_START_HOURS} hours.`] : []),
      ...(unknownResolution ? [`${unknownResolution} implemented Jira tickets have no resolution recorded, so won't-do tickets among them are counted.`] : []),
    ],
  };
}

// Notion

export function notionMetrics(n: NotionFile): SourceMetrics {
  return {
    metrics: { notion_pages_created: n.pages_created.length, notion_comments: n.comments.length },
    caveats: n.method ? [`Notion: ${n.method}`] : [],
  };
}

// Report

const METRIC_KEYS = [
  "merged_prs", "comments_per_pr", "changes_requested_per_100_prs", "median_pr_diff_lines", 
  "median_hours_to_merge", "repos_contributed", "reviewed_prs", "review_comments_per_pr", "changes_requested_by_you_per_100_prs",
  "median_hours_to_first_review", "people_reviewed",
  "messages", "threads_started_per_100_messages", "active_channels", "appreciation_per_100_messages", "laughs_per_100_messages",
  "tickets_implemented", "median_days_to_done", "tickets_reported",
  "notion_pages_created", "notion_comments",
] as const;
type MetricKey = (typeof METRIC_KEYS)[number];

/** How a metric reads in the report. `better` colors the change; "neutral" leaves it gray when either direction can be good. */
export type MetricInfo = { name: string; def: string; better: "higher" | "lower" | "neutral"; more?: string[] };

/** Definitions shown under each metric, with exclusions in `more`. Built from the same constants the filters use. */
/** Rules every metric of a source shares, shown once under the source's heading. */
export function sourceInfo(org: string | null, bots: ReadonlySet<string>, sameRepo: ReadonlyMap<string, string> = new Map()): Record<Source, string[]> {
  const q = (xs: Iterable<string>) => [...xs].map((x) => `"${x}"`).join(", ");
  return {
    github: [
      `Only PRs in the ${org ?? "chosen"} GitHub org; other orgs and personal repos are ignored.`,
      `Automated PRs are left out and listed under Details: PRs opened by a bot, branches starting with ${q(AUTOMATED_BRANCH_PREFIXES)}, and ${AUTOMATED_TITLE_RULE}. A PR a coding agent (such as Copilot) opened for you counts as yours.`,
      `Bots never count as authors, commenters, or reviewers: accounts GitHub marks as bots, logins like "name[bot]", "name-bot", "infra-robot", or "actions-runner", deleted accounts, and ${q(BOT_LOGINS)}${bots.size ? `, plus ${q(bots)} (passed with --bots)` : ""}.`,
      "A comment is a conversation comment, an inline code comment, or the text of a submitted review. GitHub wraps each inline reply in an empty review; that counts once, as the inline comment.",
      "Your PRs: PRs you authored that merged in the period. Closed-unmerged and still-open PRs don't count.",
      "Your reviews: other people's PRs where you submitted a review (approve, request changes, or comment) in the period; unsubmitted drafts don't count. Your review date decides the period, not the merge date.",
      "Hours are wall-clock time, including nights, weekends, and holidays.",
      ...(sameRepo.size ? [`Counted as one repo (moved or replaced, passed with --same-repo): ${[...sameRepo].map(([a, b]) => `${a} as ${b}`).join(", ")}.`] : []),
    ],
    slack: [
      "Only public channels, including archived ones. DMs, group DMs, and private channels are never collected; a channel whose type Slack doesn't report is treated as private.",
      "Every message counts, including short ones like \"thanks\".",
      "Days are UTC.",
    ],
    jira: ["Days are UTC."],
    notion: ["As far as Notion search finds them; search shows only a page's latest edit time."],
  };
}

/** Definitions shown under each metric; `more` holds only what this metric adds to its source's rules. */
export function metricInfo(): Record<MetricKey, MetricInfo> {
  return {
    merged_prs: { name: "Merged PRs", def: "Your PRs merged in the period.", better: "higher" },
    comments_per_pr: { name: "Comments received per PR", def: "Average comments from other people per merged PR. Fewer means cleaner PRs.", better: "lower",
      more: ["Most PRs merge with a bare approval, so an average, not a median (which would be 0).", "Your own comments don't count."] },
    changes_requested_per_100_prs: { name: "Change requests per 100 PRs", def: "Reviews from others that requested changes, per 100 merged PRs.", better: "lower",
      more: ["Each change request counts, so a PR sent back twice counts twice. Dismissed change requests still count."] },
    median_pr_diff_lines: { name: "Median PR size (lines)", def: "Lines added plus deleted per merged PR. Smaller PRs are easier to review.", better: "lower" },
    median_hours_to_merge: { name: "Median hours to merge", def: "From ready for review to merge.", better: "lower",
      more: ["Starts when the PR left draft, or when it was opened if it never was a draft."] },
    repos_contributed: { name: "Repos with merged PRs", def: "Distinct repos where your PRs merged.", better: "higher" },
    reviewed_prs: { name: "PRs reviewed", def: "Other people's PRs you reviewed in the period.", better: "higher" },
    review_comments_per_pr: { name: "Your comments per reviewed PR", def: "Average comments you wrote per PR you reviewed.", better: "neutral",
      more: ["More can mean deeper review or more nitpicking, so the change isn't colored.", "Only comments written in the period."] },
    changes_requested_by_you_per_100_prs: { name: "Your change requests per 100 reviewed PRs", def: "Reviews you submitted as request changes, per 100 PRs you reviewed.", better: "neutral",
      more: ["Each change request counts. Depends as much on the PRs as on you, so the change isn't colored."] },
    median_hours_to_first_review: { name: "Median hours to first review", def: "From when a PR was ready for you to your first review.", better: "lower",
      more: ["Starts when the PR left draft (or was opened), or later if you were asked directly after that."] },
    people_reviewed: { name: "People reviewed", def: "Distinct PR authors you reviewed.", better: "higher" },
    messages: { name: "Slack messages", def: "Your messages in public channels.", better: "neutral" },
    threads_started_per_100_messages: { name: "Slack threads started per 100 messages", def: "How often you start a conversation rather than reply in one.", better: "higher",
      more: ["A thread start is a top-level message in a channel; everything else is a reply."] },
    appreciation_per_100_messages: { name: "Appreciation reactions per 100 messages", def: "Thanks, 🙌, 🎉, 🔥, 👍 and similar reactions from others on your public messages.", better: "higher",
      more: ["Each person's reaction counts once per emoji; your own reactions don't count.", "Acknowledgements (👀 ✅) and votes (➕ 1️⃣ 🅱️) don't count.", "Matched by emoji name, so custom emoji like :thankyou: count; the full list is under Reactions you received.", "Needs collect-slack-threads.ts for the period; blank without it."] },
    laughs_per_100_messages: { name: "Laugh reactions per 100 messages", def: "😂, 🤣, 😄 and similar reactions from others on your public messages.", better: "higher",
      more: ["Each person's reaction counts once per emoji; your own reactions don't count.", "Needs collect-slack-threads.ts for the period; blank without it."] },
    active_channels: { name: "Slack channels active in", def: "Distinct public channels you posted in.", better: "higher" },
    tickets_implemented: { name: "Jira tickets implemented", def: "Done tickets assigned to you, resolved in the period.", better: "higher",
      more: [`Resolutions ${NOT_DONE_RULE} don't count.`, "Uses the current assignee: a ticket you finished that was later reassigned counts for the new assignee."] },
    median_days_to_done: { name: "Median days in progress to done", def: "From when work started on a ticket you implemented to when it was resolved.", better: "lower",
      more: ["Starts at the ticket's first move into an In Progress status, so backlog time doesn't count. Includes review and deployment statuses after that.",
        `A ticket that went to Done without an In Progress status (a quick task or a backlog cleanup) counts as ${NO_START_HOURS} hours; the data notes say how many.`] },
    tickets_reported: { name: "Jira tickets reported", def: "Tickets you created in the period, in any status.", better: "higher" },
    notion_pages_created: { name: "Notion pages created", def: "Pages you created in the period.", better: "higher" },
    notion_comments: { name: "Notion comments", def: "Your comments in the period.", better: "neutral", more: ["Only comments on pages you created or edited; comments elsewhere are missed."] },
  };
}

type Which = "current" | "previous";
type Source = "github" | "slack" | "jira" | "notion";
export type Report = {
  periods: Partial<Record<Which, Period>>;
  sources: Partial<Record<Source, Partial<Record<Which, SourceMetrics>>>>;
  missing: string[];
  caveats: string[];
  github_org: string | null;
  highlights: Highlight[];
  /** Jev scores from DIR/scores.jsonl, if score-jev.ts ran. */
  scores: ScoreSummary | null;
  info: Partial<Record<MetricKey, MetricInfo>>;
  source_info: Partial<Record<Source, string[]>>;
};

// Jev scores

export type ScoredItem = Pick<ScoreLine, "url" | "where" | "at" | "text"> & { score: number };
export type ScoreSummary = { scored: number; strong: Record<string, number>; top: Record<string, ScoredItem[]> };

export function summarizeScores(lines: ScoreLine[], topN = 8): ScoreSummary {
  const criteria = [...new Set(lines.flatMap((l) => Object.keys(l.scores)))];
  const strong: Record<string, number> = {};
  const top: Record<string, ScoredItem[]> = {};
  const stand = [...standouts(lines, STANDOUT_PERCENT, STANDOUT_FLOOR).values()];
  for (const k of criteria) {
    const scored = lines.map((l) => ({ url: l.url, where: l.where, at: l.at, text: l.text, score: l.scores[k] ?? 0 }));
    strong[k] = stand.filter((c) => c.includes(k)).length;
    top[k] = scored.sort((a, b) => b.score - a.score).slice(0, topN);
  }
  return { scored: lines.length, strong, top };
}

/** Rename repos so a moved or replaced repo counts as one. Names without an org get the file's org. */
export function mergeRepos(g: GithubFile, sameRepo: ReadonlyMap<string, string>): GithubFile {
  if (!sameRepo.size) return g;
  const full = (r: string) => (r.includes("/") ? r : `${g.org}/${r}`);
  const to = new Map([...sameRepo].map(([from, into]) => [full(from), full(into)]));
  const rename = <T extends Pr>(p: T): T => ({ ...p, repo: to.get(p.repo) ?? p.repo });
  return { ...g, authored: g.authored.map(rename), reviewed: g.reviewed.map(rename) };
}

export type BuildOptions = { bots?: ReadonlySet<string>; sameRepo?: ReadonlyMap<string, string> };

export function build(dir: string, { bots = new Set(), sameRepo = new Map() }: BuildOptions = {}): Report {
  const report: Report = { periods: {}, sources: {}, missing: [], caveats: [], github_org: null, highlights: [], info: {}, source_info: {}, scores: null };
  for (const which of ["current", "previous"] as const) {
    const loaded = [
      ["github", readJson(join(dir, which, "github.json"), githubFile)],
      ["slack", readJson(join(dir, which, "slack.json"), slackFile)],
      ["jira", readJson(join(dir, which, "jira.json"), jiraFile)],
      ["notion", readJson(join(dir, which, "notion.json"), notionFile)],
    ] as const;
    for (const [src, data] of loaded) {
      if (data === null) {
        report.missing.push(`${which}/${src}.json`);
        continue;
      }
      const seen = (report.periods[which] ??= data.period);
      if (seen.from !== data.period.from || seen.to !== data.period.to) {
        report.caveats.push(`${which}/${src}.json covers ${data.period.from} to ${data.period.to}, unlike the other ${which} files.`);
      }
      const threads = data.source === "slack" ? readJson(join(dir, which, "slack-threads.json"), slackThreadsFile) : null;
      const m = data.source === "slack" ? slackMetrics(data, threads) : metricsFor(data.source === "github" ? mergeRepos(data, sameRepo) : data, bots);
      (report.sources[src] ??= {})[which] = m;
      if (which === "current") report.caveats.push(...m.caveats);
      if (data.source === "github" && which === "current") report.github_org = data.org;
    }
  }
  report.info = metricInfo();
  const notes = sourceInfo(report.github_org, bots, sameRepo);
  for (const src of Object.keys(report.sources) as Source[]) report.source_info[src] = notes[src];
  report.highlights = readJson(join(dir, "highlights.json"), highlightsSchema) ?? [];
  const scoresPath = join(dir, "scores.jsonl");
  if (existsSync(scoresPath)) {
    const lines = readFileSync(scoresPath, "utf8").split("\n").filter(Boolean).map((l, i) => parse(scoreLine, JSON.parse(l), `${scoresPath}:${i + 1}`));
    report.scores = summarizeScores(lines);
  }
  return report;
}

function metricsFor(data: GithubFile | SlackFile | JiraFile | NotionFile, bots: ReadonlySet<string>): SourceMetrics {
  switch (data.source) {
    case "github": return githubMetrics(data, bots);
    case "slack": return slackMetrics(data);
    case "jira": return jiraMetrics(data);
    case "notion": return notionMetrics(data);
    default: {
      const _exhaustive: never = data;
      return _exhaustive;
    }
  }
}

export function render(report: Report): string {
  const template = readFileSync(new URL("./report-template.html", import.meta.url), "utf8");
  // Escape every "<" so no data (e.g. "</script>" or "<!--") can end or alter the script block.
  const data = JSON.stringify({ m: report }).replaceAll("<", "\\u003c");
  const title = `Performance review ${report.periods.current?.from.slice(0, 4) ?? ""}`.trim();
  return template.replace("__TITLE__", title.replace(/[<&]/g, "")).replace("__DATA__", () => data);
}

function main() {
  const usage = "usage: build-report.ts DIR [--bots login,login] [--same-repo old=new ...]";
  const { values, positionals } = parseArgs({
    options: { bots: { type: "string", default: "" }, "same-repo": { type: "string", multiple: true, default: [] } },
    allowPositionals: true,
  });
  const [dir] = positionals;
  if (dir === undefined) fatal(usage);
  const bots = new Set(values.bots.split(",").map((b) => b.trim().toLowerCase()).filter(Boolean));
  const sameRepo = new Map<string, string>();
  for (const pair of values["same-repo"].flatMap((v) => v.split(","))) {
    const [from, into, ...extra] = pair.split("=").map((x) => x.trim());
    if (!from || !into || extra.length) fatal(`--same-repo expects old=new, got "${pair}". ${usage}`);
    sameRepo.set(from, into);
  }
  const report = build(dir, { bots, sameRepo });
  writeJson(join(dir, "metrics.json"), report);
  writeFileSync(join(dir, "report.html"), render(report));
  log(`wrote ${dir}/metrics.json and ${dir}/report.html; missing: ${report.missing.join(", ") || "none"}`);
}

if (isMain(import.meta.url)) main();
