// Run: node --test 'perf-review/scripts/*.test.ts'
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { build, githubMetrics, jiraMetrics, monthly, render, reviewStart, histogram, mergeRepos } from "./build-report.ts";
import { toRecord } from "./collect-github.ts";
import { startedAt, toTicket } from "./collect-jira.ts";
import { channelKind, threadOf } from "./collect-slack.ts";
import { automatedReason, inPeriod, isBot, median, monthChunks, utcDay } from "./common.ts";
import { batchItems } from "./prepare-batches.ts";
import {
  day, highlights, isDay, isTimestamp, period, review, type Day, type GithubFile, type MergedPr, type Pr, type Review,
  type Ticket, type Timestamp,
} from "./records.ts";
import { array, literal, nullable, number, object, parse, ParseError, string, withDefault } from "./schema.ts";

const d = (s: string): Day => {
  assert.ok(isDay(s), s);
  return s;
};
const t = (s: string): Timestamp => {
  assert.ok(isTimestamp(s), s);
  return s;
};
const YEAR = { from: d("2026-01-01"), to: d("2026-12-31") };
const ME = { login: "me", type: "User" };
const who = (login: string, type = "User") => ({ login, type });
const dir = () => mkdtempSync(join(tmpdir(), "perf-review-"));

const merged = (over: Partial<MergedPr> = {}): MergedPr => ({
  repo: "acme/app", number: 1, url: "https://github.com/acme/app/pull/1", title: "Add export", author: ME, state: "MERGED",
  created_at: t("2026-03-01T10:00:00Z"), merged_at: t("2026-03-02T10:00:00Z"), closed_at: null, additions: 30, deletions: 10,
  changed_files: 2, head_ref: "feat/export", labels: [], ready_for_review_at: [], review_requests: [], reviews: [], comments: [],
  truncated: [], ...over,
});
const open = (over: Partial<Pr> = {}): Pr => ({ ...merged(), state: "OPEN", merged_at: null, author: who("bob"), ...over });
const comment = (login: string, over: { type?: string; kind?: "comment" | "inline"; at?: string } = {}) =>
  ({ ...who(login, over.type), at: t(over.at ?? "2026-03-01T12:00:00Z"), kind: over.kind ?? "comment" });
const submitted = (login: string, at: string, state: Exclude<Review["state"], "PENDING"> = "APPROVED", body = 0): Review =>
  ({ ...who(login), state, at: t(at), body_chars: body, inline_comments: 0 });
const pending = (login: string): Review => ({ ...who(login), state: "PENDING", at: null, body_chars: 0, inline_comments: 0 });
const gh = (authored: MergedPr[] = [], reviewed: Pr[] = []): GithubFile =>
  ({ source: "github", user: "me", org: "acme", period: YEAR, collected_at: t("2026-12-31T00:00:00Z"), authored, reviewed });

describe("schema", () => {
  it("parses declared fields and drops unknown ones", () => {
    const s = object({ a: string, b: nullable(number), c: withDefault(array(literal("x", "y")), () => []) });
    assert.deepEqual(parse(s, { a: "1", b: undefined, extra: true }), { a: "1", b: null, c: [] });
  });
  it("reports the path of a bad value", () => {
    assert.throws(() => parse(object({ list: array(object({ n: number })) }), { list: [{ n: 1 }, { n: "2" }] }), (e: unknown) =>
      e instanceof ParseError && e.message.startsWith("list[1].n: expected number"));
  });
  it("gives every record its own default", () => {
    const s = array(object({ tags: withDefault(array(string), () => []) }));
    const [a, b] = parse(s, [{}, {}]);
    a?.tags.push("x");
    assert.deepEqual(b?.tags, []);
  });
  it("ignores inherited properties", () => {
    assert.throws(() => parse(object({ toString: string }), {}), ParseError);
  });
});

describe("records", () => {
  it("rejects impossible dates without throwing anything else", () => {
    for (const bad of ["2026-02-30", "2026-13-01", "2026-00-10", "2026-01-32", "26-01-01"]) assert.equal(isDay(bad), false, bad);
    assert.throws(() => parse(day, "2026-13-01"), ParseError);
  });
  it("rejects a period that ends before it starts", () => {
    assert.throws(() => parse(period, { from: "2026-02-01", to: "2026-01-01" }), ParseError);
  });
  it("accepts ISO and Jira timestamps, rejects others", () => {
    assert.ok(isTimestamp("2026-03-01T10:00:00Z") && isTimestamp("2026-03-01T10:00:00.123+0000") && isTimestamp("2026-03-01T10:00:00-05:00"));
    for (const bad of ["2026-03-01", "2026-03-01T10:00:00", "yesterday", "2026-13-01T10:00:00Z"]) assert.equal(isTimestamp(bad), false, bad);
  });
  it("requires a timestamp on submitted reviews only", () => {
    assert.deepEqual(parse(review, { login: "a", type: "User", state: "PENDING", at: null, body_chars: 0, inline_comments: 0 }).at, null);
    assert.throws(() => parse(review, { login: "a", type: "User", state: "APPROVED", at: null, body_chars: 0, inline_comments: 0 }), ParseError);
  });
  it("rejects highlights with typos or non-https links", () => {
    const ok = { title: "x", why: "y", tags: ["initiative"], at: "2026-03-01", source: "slack", links: [{ label: "#eng", url: "https://x.slack.com/a" }] };
    assert.equal(parse(highlights, [ok]).length, 1);
    assert.throws(() => parse(highlights, [{ ...ok, link: [] }]), /unknown field link/);
    assert.throws(() => parse(highlights, [{ ...ok, links: [{ label: "x", url: "javascript:alert(1)" }] }]), ParseError);
  });
});

describe("dates", () => {
  it("splits periods on calendar months, inclusive", () => {
    assert.deepEqual(monthChunks({ from: d("2026-01-16"), to: d("2026-03-05") }), [
      { from: "2026-01-16", to: "2026-01-31" }, { from: "2026-02-01", to: "2026-02-28" }, { from: "2026-03-01", to: "2026-03-05" }]);
    assert.deepEqual(monthChunks({ from: d("2025-12-20"), to: d("2026-01-02") }), [{ from: "2025-12-20", to: "2025-12-31" }, { from: "2026-01-01", to: "2026-01-02" }]);
  });
  it("converts offsets to UTC days, including Jira's +0000 form", () => {
    assert.ok(inPeriod(t("2025-12-31T23:30:00-05:00"), { from: d("2026-01-01"), to: d("2026-01-31") }));
    assert.equal(utcDay(t("2026-03-01T00:30:00.000+0100")), "2026-02-28");
    assert.equal(inPeriod(null, YEAR), false);
  });
  it("buckets by month from the period start", () => {
    assert.deepEqual(monthly([t("2026-02-01T00:00:00Z"), t("2026-02-09T00:00:00Z"), t("2027-01-01T00:00:00Z")], YEAR, (x) => x).slice(0, 3), [0, 2, 0]);
  });
  it("takes medians of odd, even, and empty lists", () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 3, 2]), 2.5);
    assert.equal(median([]), null);
  });
});

describe("bots and automation", () => {
  it("detects bots by type, name, list, and extra logins", () => {
    for (const [login, type] of [["dependabot[bot]", null], ["renovate", null], ["some-ci-bot", null], ["app", "Bot"], ["fp-github-infra-robot", null], ["team-actions-runner", null]] as const) {
      assert.ok(isBot({ login, type }), login);
    }
    assert.ok(isBot({ login: null, type: null }));
    for (const login of ["alice", "robotics-fan", "botanist"]) assert.equal(isBot(who(login)), false, login);
    assert.ok(isBot(who("deploy-user"), new Set(["deploy-user"])));
  });
  it("flags release and dependency PRs, not human release PRs", () => {
    assert.ok(automatedReason(merged({ head_ref: "changeset-release/main", title: "Version Packages" })));
    assert.ok(automatedReason(merged({ title: "chore(deps): bump foo from 1 to 2" })));
    assert.ok(automatedReason(merged({ author: who("github-actions", "Bot") })));
    assert.equal(automatedReason(merged({ title: "chore(release): cut 2.0 with migration notes" })), null);
    assert.equal(automatedReason(merged({ title: "Release v2.0" })), null);
  });
  it("counts coding-agent PRs as the user's, even when the user also reviewed them", () => {
    const agent = merged({ author: who("copilot-swe-agent", "Bot"), reviews: [submitted("me", "2026-03-02T00:00:00Z")] });
    const g = githubMetrics(gh([agent], [agent]));
    assert.equal(g.metrics.merged_prs, 1);
    assert.equal(g.details?.["automated PRs left out of the numbers"]?.length, 0);
  });
  it("applies extra bot logins at report time", () => {
    const p = open({ author: who("deploy-user"), reviews: [submitted("me", "2026-03-02T00:00:00Z")] });
    assert.equal(githubMetrics(gh([], [p])).metrics.reviewed_prs, 1);
    assert.equal(githubMetrics(gh([], [p]), new Set(["deploy-user"])).metrics.reviewed_prs, 0);
  });
});

describe("mergeRepos", () => {
  it("counts a replaced repo as its successor in every metric", () => {
    const g = gh([merged({ repo: "org/documentation" }), merged({ url: "u2", repo: "org/docs" })]);
    const m = githubMetrics(mergeRepos({ ...g, org: "org" }, new Map([["documentation", "docs"]])));
    assert.equal(m.metrics.repos_contributed, 1);
    assert.deepEqual(m.lists?.["Repos (your merged PRs)"], [["org/docs", 2]]);
  });
});

describe("histogram", () => {
  it("buckets values by lower bound, with an open last bucket", () => {
    assert.deepEqual(histogram([0, 9, 10, 99, 100, 5000], [0, 10, 100], "lines"), { buckets: ["0–9", "10–99", "100+ lines"], counts: [2, 2, 2] });
  });
});

describe("github metrics", () => {
  it("counts comments received from people, including review bodies", () => {
    const p = merged({
      comments: [comment("alice"), comment("alice", { kind: "inline" }), comment("me"), comment("ci", { type: "Bot" })],
      reviews: [submitted("bob", "2026-03-01T13:00:00Z", "COMMENTED", 50), submitted("bob", "2026-03-01T14:00:00Z", "COMMENTED")],
    });
    const m = githubMetrics(gh([p])).metrics;
    assert.equal(m.comments_per_pr, 3); // the empty COMMENTED review only wraps the inline comment, so it isn't one more
  });
  it("counts every change request from people, per 100 PRs", () => {
    const asked = merged({ reviews: [submitted("bob", "2026-03-01T13:00:00Z", "CHANGES_REQUESTED"), submitted("bob", "2026-03-01T14:00:00Z", "CHANGES_REQUESTED")] });
    const byBot = merged({ url: "u2", reviews: [submitted("lint-bot", "2026-03-01T13:00:00Z", "CHANGES_REQUESTED")] });
    const m = githubMetrics(gh([asked, byBot, merged({ url: "u3" }), merged({ url: "u4" })])).metrics;
    assert.equal(m.changes_requested_per_100_prs, 50); // 2 from bob on 4 PRs; the bot's doesn't count
  });
  it("averages comments per PR, not a median that is usually 0", () => {
    const discussed = merged({ comments: [comment("alice"), comment("alice"), comment("bob")] });
    const quiet = [merged({ url: "u2" }), merged({ url: "u3" })];
    const m = githubMetrics(gh([discussed, ...quiet])).metrics;
    assert.equal(m.comments_per_pr, 1);
  });
  it("leaves automated PRs out of the numbers but lists them once", () => {
    const bot = merged({ url: "u2", head_ref: "changeset-release/main", title: "Version Packages" });
    const g = githubMetrics(gh([merged(), bot], [bot]));
    assert.equal(g.metrics.merged_prs, 1);
    assert.equal(g.details?.["automated PRs left out of the numbers"]?.length, 1);
  });
  it("measures time to merge from ready for review", () => {
    const p = merged({ created_at: t("2026-03-01T00:00:00Z"), ready_for_review_at: [t("2026-03-03T00:00:00Z")], merged_at: t("2026-03-03T06:00:00Z") });
    assert.equal(githubMetrics(gh([p])).metrics.median_hours_to_merge, 6);
  });
  it("counts reviewed PRs, comments, and wait time; ignores pending reviews", () => {
    const p = open({
      created_at: t("2026-03-01T00:00:00Z"),
      review_requests: [{ reviewer: "me", type: "User", at: t("2026-03-02T00:00:00Z") }],
      reviews: [submitted("me", "2026-03-02T05:00:00Z", "COMMENTED", 20), submitted("me", "2026-03-02T06:00:00Z", "COMMENTED"),
        submitted("me", "2026-03-03T00:00:00Z"), pending("me")],
    });
    const m = githubMetrics(gh([], [p])).metrics;
    assert.equal(m.median_hours_to_first_review, 5);
    assert.equal(m.reviewed_prs, 1);
    assert.equal(m.review_comments_per_pr, 1);
    assert.equal(m.changes_requested_by_you_per_100_prs, 0);
  });
  it("skips wait time when the first review was before the period", () => {
    const p = open({ created_at: t("2025-12-20T00:00:00Z"), reviews: [submitted("me", "2025-12-21T00:00:00Z", "COMMENTED", 5), submitted("me", "2026-01-05T00:00:00Z")] });
    const m = githubMetrics(gh([], [p])).metrics;
    assert.equal(m.median_hours_to_first_review, null);
    assert.equal(m.reviewed_prs, 1);
  });
  it("starts the review wait at the right moment", () => {
    const late = open({ created_at: t("2026-03-01T00:00:00Z"), review_requests: [{ reviewer: "me", type: "User", at: t("2026-03-05T00:00:00Z") }] });
    assert.equal(reviewStart(late, "me", t("2026-03-02T00:00:00Z")), "2026-03-01T00:00:00Z");
    const draft = open({
      created_at: t("2026-03-01T00:00:00Z"), ready_for_review_at: [t("2026-03-04T00:00:00Z")],
      review_requests: [{ reviewer: "me", type: "User", at: t("2026-03-01T01:00:00Z") }, { reviewer: "team", type: "Team", at: t("2026-03-04T00:00:00Z") }],
    });
    assert.equal(reviewStart(draft, "me", t("2026-03-05T00:00:00Z")), "2026-03-04T00:00:00Z");
  });
});

describe("collect-github toRecord", () => {
  const conn = <T>(nodes: T[], totalCount = nodes.length) => ({ totalCount, nodes });
  const a = (login: string, __typename = "User") => ({ login, __typename });
  const node = {
    number: 7, url: "https://github.com/acme/app/pull/7", title: "x", createdAt: t("2026-03-01T00:00:00Z"), mergedAt: null, closedAt: null,
    state: "OPEN" as const, additions: 1, deletions: 2, changedFiles: 1, headRefName: "b", repository: { nameWithOwner: "acme/app" }, author: a("bob"),
    labels: { nodes: [{ name: "bug" }] },
    comments: conn([{ author: a("me"), createdAt: t("2026-03-01T01:00:00Z") }], 101),
    reviews: conn([
      { author: a("me"), state: "COMMENTED" as const, submittedAt: t("2026-03-01T02:00:00Z"), body: " 👍 ", comments: { totalCount: 1 } },
      { author: a("me"), state: "PENDING" as const, submittedAt: null, body: "", comments: { totalCount: 0 } },
    ]),
    reviewThreads: conn([{ comments: conn([{ author: null, createdAt: t("2026-03-01T03:00:00Z") }], 51) }]),
    timelineItems: conn([
      { __typename: "ReadyForReviewEvent", createdAt: t("2026-03-01T00:30:00Z"), requestedReviewer: null },
      { __typename: "ReviewRequestedEvent", createdAt: t("2026-03-01T00:40:00Z"), requestedReviewer: { __typename: "Team", login: null, slug: "core" } },
    ]),
  };
  it("flattens comments, reviews, events, and truncation", () => {
    const r = toRecord(node);
    assert.deepEqual(r.comments.map((c) => [c.login, c.kind]), [["me", "comment"], [null, "inline"]]);
    assert.deepEqual(r.reviews.map((x) => [x.state, x.at, x.body_chars]), [["COMMENTED", "2026-03-01T02:00:00Z", 1], ["PENDING", null, 0]]);
    assert.deepEqual(r.ready_for_review_at, ["2026-03-01T00:30:00Z"]);
    assert.deepEqual(r.review_requests, [{ reviewer: "core", type: "Team", at: "2026-03-01T00:40:00Z" }]);
    assert.deepEqual(r.truncated, ["comments", "thread_comments"]);
  });
});

describe("slack", () => {
  const ch = { id: "C1", name: "x", is_im: false, is_mpim: false, is_private: null, is_channel: false, is_group: false, is_archived: false, is_ext_shared: false };
  it("classifies channels and fails closed", () => {
    assert.equal(channelKind({ ...ch, is_im: true, is_private: true }), "dm");
    assert.equal(channelKind({ ...ch, is_mpim: true, is_private: true }), "group_dm");
    assert.equal(channelKind({ ...ch, is_private: true, is_channel: true }), "private_channel");
    assert.equal(channelKind({ ...ch, is_private: false, is_channel: true }), "public");
    assert.equal(channelKind(ch), "unknown");
    assert.equal(channelKind({ ...ch, is_channel: true }), "unknown");
  });
  it("reads the thread from a permalink", () => {
    assert.equal(threadOf("https://x.slack.com/archives/C1/p1?thread_ts=1767348484.123456&cid=C1"), "1767348484.123456");
    assert.equal(threadOf("https://x.slack.com/archives/C1/p1"), null);
    assert.equal(threadOf("not a url"), null);
  });
});

describe("jira", () => {
  const ticket = (key: string, resolution: string | null, resolved = "2026-03-01T00:00:00.000+0000", started: string | null = "2026-02-01T00:00:00.000+0000"): Ticket => ({
    key, summary: "s", type: "Task", status: "Done", project: "A", priority: null, parent: null,
    created: t("2026-01-01T00:00:00.000+0000"), started: started === null ? null : t(started), resolved: t(resolved), resolution, url: "u" });
  it("leaves won't-do, duplicate, and out-of-period tickets out of implemented", () => {
    const j = jiraMetrics({ source: "jira", site: "x", period: YEAR, collected_at: t("2026-12-31T00:00:00Z"),
      implemented: [ticket("A-1", "Done"), ticket("A-2", "Won't Do"), ticket("A-3", "Duplicate"), ticket("A-4", null), ticket("A-5", "Done", "2027-01-01T01:00:00.000+0000")], reported: [] });
    assert.equal(j.metrics.tickets_implemented, 2);
    assert.equal(j.caveats.length, 2); // won't-do dropped, unknown resolution
  });
  it("measures days from first In Progress to done, counting tickets that never started as 2 hours", () => {
    const j = jiraMetrics({ source: "jira", site: "x", period: YEAR, collected_at: t("2026-12-31T00:00:00Z"),
      implemented: [ticket("A-1", "Done", "2026-02-03T12:00:00.000+0000"), ticket("A-2", "Done"), ticket("A-3", "Done", "2026-02-02T00:00:00.000+0000"),
        ticket("A-4", "Done", "2026-03-01T00:00:00.000+0000", null)], reported: [] });
    assert.equal(j.metrics.median_days_to_done, 1.8); // 2 h, 1, 2.5, and 28 days
    assert.match(j.caveats.join(), /1 of 4 .* 2 hours/);
  });
  it("starts the clock at the first move into an In Progress status", () => {
    const h = (at: string, to: string) => ({ created: t(at), items: [{ field: "status", to }] });
    const inProgress = new Set(["3"]);
    assert.equal(startedAt([h("2026-02-05T00:00:00.000+0000", "3"), h("2026-02-02T00:00:00.000+0000", "3"), h("2026-02-01T00:00:00.000+0000", "1")], inProgress), "2026-02-02T00:00:00.000+0000");
    assert.equal(startedAt([h("2026-02-01T00:00:00.000+0000", "10008")], inProgress), null);
  });
  it("maps API issues to tickets", () => {
    const tk = toTicket("acme.atlassian.net", { key: "A-1", fields: { summary: "s", issuetype: { name: "Bug" }, status: null, project: { key: "A" },
      priority: null, parent: null, created: t("2026-02-01T00:00:00.000+0000"), resolutiondate: null, resolution: null } });
    assert.equal(tk.url, "https://acme.atlassian.net/browse/A-1");
    assert.equal(tk.type, "Bug");
  });
});

describe("files and report", () => {
  const write = (path: string, data: unknown) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(data));
  };
  const slack = (messages: unknown[]) => ({ source: "slack", user_id: "U", user: "me", team: "t", team_url: "", period: YEAR,
    collected_at: "2026-12-31T00:00:00Z", skipped_non_public: { dm: 2 }, messages });
  const message = (ts: string, at: string, channel_id: string, thread_ts: string | null, text = "a message long enough to keep in a batch") =>
    ({ ts, at, channel_id, channel: channel_id, archived: false, shared: false, thread_ts, permalink: "https://x.slack.com/p", text });

  it("counts Slack messages in the period by UTC day, replies by thread", () => {
    const base = dir();
    write(join(base, "current", "slack.json"), slack([
      message("1.1", "2026-02-01T10:00:00Z", "C1", null), message("2.1", "2026-02-01T11:00:00Z", "C1", "1.1"),
      message("3.1", "2026-05-01T11:00:00Z", "C2", "0.5"), message("4.1", "2027-01-01T00:30:00Z", "C2", "0.5"),
    ]));
    const s = build(base).sources.slack?.current;
    assert.deepEqual(s?.metrics, { messages: 3, threads_started_per_100_messages: 33.3, active_channels: 2 });
    assert.deepEqual(s?.monthly?.messages?.slice(0, 5), [0, 2, 0, 0, 1]);
  });
  it("batches long Slack messages and Notion comments by date", () => {
    const base = dir();
    write(join(base, "current", "slack.json"), slack([message("2.1", "2026-02-02T00:00:00Z", "C1", null), message("1.1", "2026-02-01T00:00:00Z", "C1", null, "ok")]));
    write(join(base, "current", "notion.json"), { source: "notion", user: "me", period: YEAR, method: null,
      comments: [{ page_title: "Plan", page_url: "https://notion.so/p", at: "2026-01-15T00:00:00Z", text: "a Notion comment long enough to keep" }] });
    assert.deepEqual(batchItems(base, 20).map((i) => i.where), ['notion comment on "Plan"', "slack #C1"]);
    write(join(base, "current", "slack.json"), slack([message("2.1", "2026-02-02T00:00:00Z", "C1", "1.1")]));
    assert.deepEqual(batchItems(base, 20).map((i) => i.where), ['notion comment on "Plan"', "slack #C1 (thread reply)"]);
    assert.deepEqual(build(base).sources.notion?.current?.metrics, { notion_pages_created: 0, notion_comments: 1 });
  });
  it("builds from files, flags period mismatches, and escapes markup in data", () => {
    const base = dir();
    write(join(base, "current", "github.json"), gh([merged({ title: "</script><!--<script>alert(1)</script>" })]));
    write(join(base, "current", "jira.json"), { source: "jira", site: "x", period: { from: "2026-01-01", to: "2026-06-30" }, collected_at: "2026-07-01T00:00:00Z", implemented: [], reported: [] });
    const report = build(base);
    assert.equal(report.sources.github?.current?.metrics.merged_prs, 1);
    assert.ok(report.missing.includes("previous/github.json"));
    assert.ok(report.caveats.some((c) => c.includes("current/jira.json covers")));
    const html = render(report);
    const data = html.slice(html.indexOf("const {m, labels"));
    assert.equal(/<\/script>.*<\/script>/s.test(data.slice(0, data.lastIndexOf("</script>"))), false);
    assert.equal(data.includes("<!--"), false);
  });
});

describe("cli", () => {
  it("runs a script started through a symlinked folder", () => {
    const link = join(dir(), "skill");
    symlinkSync(dirname(fileURLToPath(import.meta.url)), link);
    assert.throws(() => execFileSync(process.execPath, [join(link, "build-report.ts")], { stdio: "pipe" }), (e: unknown) =>
      e instanceof Error && "stderr" in e && String(e.stderr).includes("usage: build-report.ts"));
  });
});
