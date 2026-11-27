// Collect raw GitHub PR activity for one person in one org and period.
//
//   node collect-github.ts --org ORG --from YYYY-MM-DD --to YYYY-MM-DD --out FILE [--user LOGIN]
//
// Uses the `gh` CLI's token. Writes two lists of raw PR records:
// - authored: PRs GitHub search attributes to the user (including coding-agent PRs they assigned), merged in the period.
// - reviewed: other people's PRs where the user submitted a review in the period, merged or not.
// Records keep raw timestamps, actors, and actor types. Bot and automation rules run later, in build-report.ts.
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { fatal, fetchJson, inPeriod, isMain, log, monthChunks, now, periodArgs, sleep, today, writeJson } from "./common.ts";
import { asMerged, epochMs, reviewState, timestamp, type GithubFile, type MergedPr, type Pr, type Review } from "./records.ts";
import { array, boolean, isObject, literal, nullable, number, object, parse, string, withDefault, type Infer } from "./schema.ts";

const USAGE = "usage: collect-github.ts --org ORG --from YYYY-MM-DD --to YYYY-MM-DD --out FILE [--user LOGIN]";
const SEARCH_CAP = 1000;
const LIMITS = { comments: 100, reviews: 100, threads: 100, threadComments: 50, timeline: 100 } as const;

const PR_FIELDS = `
  number url title createdAt mergedAt closedAt state additions deletions changedFiles headRefName
  repository { nameWithOwner }
  author { login __typename }
  labels(first: 20) { nodes { name } }
  comments(first: ${LIMITS.comments}) { totalCount nodes { author { login __typename } createdAt } }
  reviews(first: ${LIMITS.reviews}) { totalCount nodes { author { login __typename } state submittedAt body comments { totalCount } } }
  reviewThreads(first: ${LIMITS.threads}) { totalCount nodes { comments(first: ${LIMITS.threadComments}) { totalCount nodes { author { login __typename } createdAt } } } }
  timelineItems(first: ${LIMITS.timeline}, itemTypes: [READY_FOR_REVIEW_EVENT, REVIEW_REQUESTED_EVENT]) {
    totalCount
    nodes {
      __typename
      ... on ReadyForReviewEvent { createdAt }
      ... on ReviewRequestedEvent { createdAt requestedReviewer { __typename ... on User { login } ... on Team { slug } ... on Bot { login } } }
    }
  }`;

const QUERY = `query($q: String!, $cursor: String) {
  rateLimit { remaining resetAt }
  search(query: $q, type: ISSUE, first: 20, after: $cursor) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes { ... on PullRequest { ${PR_FIELDS} } }
  }
}`;

// Wire schemas for the GraphQL response.
const author = nullable(object({ login: string, __typename: string }));
const connection = <T>(node: (v: unknown, p: string) => T) => object({ totalCount: number, nodes: array(node) });
const gqlPr = object({
  number: number,
  url: string,
  title: string,
  createdAt: timestamp,
  mergedAt: nullable(timestamp),
  closedAt: nullable(timestamp),
  state: literal("OPEN", "CLOSED", "MERGED"),
  additions: number,
  deletions: number,
  changedFiles: number,
  headRefName: string,
  repository: object({ nameWithOwner: string }),
  author,
  labels: object({ nodes: array(object({ name: string })) }),
  comments: connection(object({ author, createdAt: timestamp })),
  reviews: connection(object({ author, state: reviewState, submittedAt: nullable(timestamp), body: withDefault(string, () => ""), comments: object({ totalCount: number }) })),
  reviewThreads: connection(object({ comments: connection(object({ author, createdAt: timestamp })) })),
  timelineItems: connection(object({
    __typename: string,
    createdAt: nullable(timestamp),
    requestedReviewer: nullable(object({ __typename: string, login: nullable(string), slug: nullable(string) })),
  })),
});
type GqlPr = Infer<typeof gqlPr>;
const searchResponse = object({
  data: object({
    rateLimit: object({ remaining: number, resetAt: timestamp }),
    search: object({
      issueCount: number,
      pageInfo: object({ hasNextPage: boolean, endCursor: nullable(string) }),
      // Non-PR results come back as empty objects; keep only nodes with a url.
      nodes: array((v, p) => (isObject(v) && "url" in v ? gqlPr(v, p) : null)),
    }),
  }),
});
const errorResponse = object({ errors: array(object({ type: withDefault(string, () => ""), message: withDefault(string, () => "") })) });

async function search(token: string, q: string): Promise<GqlPr[]> {
  const out: GqlPr[] = [];
  let cursor: string | null = null;
  for (let rateLimited = 0; ; ) {
    const raw = await fetchJson("https://api.github.com/graphql", {
      method: "POST",
      headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { q, cursor } }),
    });
    if (isObject(raw) && "errors" in raw) {
      const { errors } = parse(errorResponse, raw, "graphql");
      if (errors.some((e) => e.type === "RATE_LIMITED") && ++rateLimited <= 3) {
        log("  GraphQL rate limited, waiting 60s");
        await sleep(60_000);
        continue;
      }
      fatal(`GraphQL error for ${q}: ${errors.map((e) => e.message).join("; ").slice(0, 300)}`);
    }
    const { search: s, rateLimit } = parse(searchResponse, raw, "graphql").data;
    if (s.issueCount > SEARCH_CAP) fatal(`Query matches ${s.issueCount} PRs, over GitHub's ${SEARCH_CAP} search cap: ${q}`);
    for (const n of s.nodes) if (n) out.push(n);
    if (rateLimit.remaining < 50) {
      const wait = Math.max(0, epochMs(rateLimit.resetAt) - Date.now()) + 1000;
      log(`  rate limit nearly used up, waiting ${Math.round(wait / 1000)}s for the reset`);
      await sleep(wait);
    }
    if (!s.pageInfo.hasNextPage) return out;
    cursor = s.pageInfo.endCursor;
  }
}

const actorOf = (a: Infer<typeof author>) => ({ login: a?.login ?? null, type: a?.__typename ?? null });

export function toRecord(n: GqlPr): Pr {
  const comments: Pr["comments"] = [
    ...n.comments.nodes.map((c) => ({ ...actorOf(c.author), at: c.createdAt, kind: "comment" as const })),
    ...n.reviewThreads.nodes.flatMap((t) => t.comments.nodes.map((c) => ({ ...actorOf(c.author), at: c.createdAt, kind: "inline" as const }))),
  ];
  const ready: Pr["ready_for_review_at"] = [];
  const requests: Pr["review_requests"] = [];
  for (const e of n.timelineItems.nodes) {
    if (e.createdAt === null) continue;
    if (e.__typename === "ReadyForReviewEvent") ready.push(e.createdAt);
    if (e.__typename === "ReviewRequestedEvent") {
      const r = e.requestedReviewer;
      requests.push({ reviewer: r?.login ?? r?.slug ?? null, type: r?.__typename ?? null, at: e.createdAt });
    }
  }
  const reviews = n.reviews.nodes.map((r): Review => {
    const base = { ...actorOf(r.author), body_chars: [...r.body.trim()].length, inline_comments: r.comments.totalCount };
    if (r.state === "PENDING" || r.submittedAt === null) return { ...base, state: "PENDING", at: null };
    return { ...base, state: r.state, at: r.submittedAt };
  });
  const truncated: Pr["truncated"] = [];
  if (n.comments.totalCount > LIMITS.comments) truncated.push("comments");
  if (n.reviews.totalCount > LIMITS.reviews) truncated.push("reviews");
  if (n.reviewThreads.totalCount > LIMITS.threads) truncated.push("review_threads");
  if (n.reviewThreads.nodes.some((t) => t.comments.totalCount > LIMITS.threadComments)) truncated.push("thread_comments");
  if (n.timelineItems.totalCount > LIMITS.timeline) truncated.push("timeline");
  return {
    repo: n.repository.nameWithOwner,
    number: n.number,
    url: n.url,
    title: n.title,
    author: actorOf(n.author),
    state: n.state,
    created_at: n.createdAt,
    merged_at: n.mergedAt,
    closed_at: n.closedAt,
    additions: n.additions,
    deletions: n.deletions,
    changed_files: n.changedFiles,
    head_ref: n.headRefName,
    labels: n.labels.nodes.map((l) => l.name),
    ready_for_review_at: ready,
    review_requests: requests,
    reviews,
    comments,
    truncated,
  };
}

async function main() {
  const { values } = parseArgs({ options: { org: { type: "string" }, user: { type: "string" }, from: { type: "string" }, to: { type: "string" }, out: { type: "string" } } });
  const { out, ...period } = periodArgs(values, USAGE);
  const org = values.org || fatal(USAGE);
  const token = execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
  // Canonical login casing, so later equality checks hold.
  const path = values.user ? `users/${encodeURIComponent(values.user)}` : "user";
  const { login: user } = parse(object({ login: string }), await fetchJson(`https://api.github.com/${path}`, { headers: { Authorization: `bearer ${token}` } }), path);

  const authored = new Map<string, MergedPr>();
  for (const m of monthChunks(period)) {
    const found = await search(token, `org:${org} author:${user} is:pr is:merged merged:${m.from}..${m.to}`);
    for (const n of found) {
      const rec = asMerged(toRecord(n));
      if (rec) authored.set(rec.url, rec);
    }
    log(`authored ${m.from}..${m.to}: ${found.length}`);
  }

  // A PR reviewed in the period was updated on or after that review, so search by update month up to today.
  const reviewed = new Map<string, Pr>();
  for (const m of monthChunks({ from: period.from, to: today() })) {
    const found = await search(token, `org:${org} reviewed-by:${user} -author:${user} is:pr updated:${m.from}..${m.to}`);
    for (const n of found) {
      const rec = toRecord(n);
      if (rec.reviews.some((r) => r.login === user && inPeriod(r.at, period))) reviewed.set(rec.url, rec);
    }
    log(`reviewed, updated ${m.from}..${m.to}: ${found.length} found`);
  }

  const file: GithubFile = {
    source: "github",
    user,
    org,
    period,
    collected_at: now(),
    authored: [...authored.values()].sort((a, b) => epochMs(a.merged_at) - epochMs(b.merged_at)),
    reviewed: [...reviewed.values()].sort((a, b) => epochMs(a.created_at) - epochMs(b.created_at)),
  };
  writeJson(out, file);
  log(`wrote ${out}: ${authored.size} authored, ${reviewed.size} reviewed`);
}

if (isMain(import.meta.url)) await main();
