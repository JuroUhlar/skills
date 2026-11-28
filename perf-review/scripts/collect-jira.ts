// Collect Jira tickets one person implemented or reported in a period.
//
//   JIRA_SITE=acme.atlassian.net JIRA_EMAIL=... JIRA_API_TOKEN=... node collect-jira.ts --from YYYY-MM-DD --to YYYY-MM-DD --out FILE
//
// - implemented: Done tickets assigned to the user, resolved in the period, with when work started
//   (the first move into an In Progress status, from the changelog).
// - reported: tickets the user created in the period, any status.
// Tickets are kept by UTC date, matching the other sources.
import { parseArgs } from "node:util";
import { addDays, earliest, env, fetchJson, inPeriod, isMain, isNonEmpty, log, now, periodArgs, writeJson } from "./common.ts";
import { timestamp, type JiraFile, type Period, type Ticket, type Timestamp } from "./records.ts";
import { array, boolean, nullable, number, object, parse, string, withDefault, type Infer } from "./schema.ts";

const USAGE = "usage: JIRA_SITE=... JIRA_EMAIL=... JIRA_API_TOKEN=... collect-jira.ts --from YYYY-MM-DD --to YYYY-MM-DD --out FILE";
const FIELDS = ["summary", "issuetype", "status", "project", "created", "resolutiondate", "resolution", "priority", "parent"];

const named = nullable(object({ name: string }));
const issueShape = {
  key: string,
  fields: object({
    summary: withDefault(string, () => ""),
    issuetype: named,
    status: named,
    project: nullable(object({ key: string })),
    priority: named,
    parent: nullable(object({ key: string })),
    created: timestamp,
    resolutiondate: nullable(timestamp),
    resolution: named,
  }),
};
const issue = object(issueShape);
const history = object({ created: timestamp, items: array(object({ field: string, to: nullable(string) })) });
const changelog = object({ total: number, histories: array(history) });
const searchResponse = object({
  issues: array(object({ ...issueShape, changelog: withDefault(nullable(changelog), () => null) })),
  nextPageToken: nullable(string),
  isLast: nullable(boolean),
});
const changelogPage = object({ values: array(history), isLast: boolean });
const statuses = array(object({ id: string, statusCategory: object({ key: string }) }));
type History = Infer<typeof history>;

/** First time the ticket moved into a status in the In Progress category ("indeterminate" in the API). */
export function startedAt(histories: History[], inProgress: ReadonlySet<string>): Timestamp | null {
  const starts = histories.filter((h) => h.items.some((it) => it.field === "status" && it.to !== null && inProgress.has(it.to))).map((h) => h.created);
  return isNonEmpty(starts) ? earliest(starts) : null;
}

export function toTicket(site: string, i: Infer<typeof issue>, started: Timestamp | null = null): Ticket {
  const f = i.fields;
  return {
    key: i.key,
    summary: f.summary,
    type: f.issuetype?.name ?? null,
    status: f.status?.name ?? null,
    project: f.project?.key ?? null,
    priority: f.priority?.name ?? null,
    parent: f.parent?.key ?? null,
    created: f.created,
    started,
    resolved: f.resolutiondate,
    resolution: f.resolution?.name ?? null,
    url: `https://${site}/browse/${i.key}`,
  };
}

/** The full changelog; search embeds only the first page of a long one. */
async function fullHistory(site: string, auth: string, key: string, first: Infer<typeof changelog>): Promise<History[]> {
  if (first.histories.length >= first.total) return first.histories;
  const out: History[] = [];
  for (let startAt = 0; ; ) {
    const raw = await fetchJson(`https://${site}/rest/api/3/issue/${encodeURIComponent(key)}/changelog?startAt=${startAt}&maxResults=100`, { headers: headers(auth) });
    const page = parse(changelogPage, raw, `jira changelog ${key}`);
    out.push(...page.values);
    if (page.isLast || page.values.length === 0) return out;
    startAt += page.values.length;
  }
}

const headers = (auth: string) => ({ Authorization: `Basic ${auth}`, "Content-Type": "application/json", Accept: "application/json" });

/** `inProgress`: status ids to read start dates from the changelog; omit to skip the changelog. */
async function search(site: string, auth: string, jql: string, inProgress?: ReadonlySet<string>): Promise<Ticket[]> {
  const out: Ticket[] = [];
  let nextPageToken: string | null = null;
  for (;;) {
    const raw = await fetchJson(`https://${site}/rest/api/3/search/jql`, {
      method: "POST",
      headers: headers(auth),
      body: JSON.stringify({ jql, fields: FIELDS, maxResults: 100, ...(inProgress ? { expand: "changelog" } : {}), ...(nextPageToken ? { nextPageToken } : {}) }),
    });
    const page = parse(searchResponse, raw, "jira search");
    for (const i of page.issues) {
      const started = inProgress && i.changelog ? startedAt(await fullHistory(site, auth, i.key, i.changelog), inProgress) : null;
      out.push(toTicket(site, i, started));
    }
    if (page.isLast === true || !page.nextPageToken) return out;
    nextPageToken = page.nextPageToken;
  }
}

async function main() {
  const { values } = parseArgs({ options: { from: { type: "string" }, to: { type: "string" }, out: { type: "string" } } });
  const { out, ...period } = periodArgs(values, USAGE);
  const site = env("JIRA_SITE", "e.g. acme.atlassian.net").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const email = env("JIRA_EMAIL", "your Atlassian account email");
  const token = env("JIRA_API_TOKEN", "create one at https://id.atlassian.com/manage-profile/security/api-tokens");
  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  // Jira answers an unauthenticated search with an empty 200, so check the login first; /myself returns 401 instead.
  const me = parse(object({ accountId: string }), await fetchJson(`https://${site}/rest/api/3/myself`, { headers: headers(auth) }), "jira myself");
  log(`signed in as account ${me.accountId}`);
  // JQL dates are midnight in the user's Jira time zone, so query a day wider on each side and keep tickets by UTC date.
  const wide: Period = { from: addDays(period.from, -1), to: addDays(period.to, 2) };

  const all = parse(statuses, await fetchJson(`https://${site}/rest/api/3/status`, { headers: headers(auth) }), "jira statuses");
  const inProgress = new Set(all.filter((s) => s.statusCategory.key === "indeterminate").map((s) => s.id));

  const implemented = (await search(site, auth, `assignee = currentUser() AND statusCategory = Done AND resolved >= "${wide.from}" AND resolved < "${wide.to}" ORDER BY resolved`, inProgress))
    .filter((t) => inPeriod(t.resolved, period));
  const reported = (await search(site, auth, `reporter = currentUser() AND created >= "${wide.from}" AND created < "${wide.to}" ORDER BY created`))
    .filter((t) => inPeriod(t.created, period));
  const file: JiraFile = { source: "jira", site, period, collected_at: now(), implemented, reported };
  writeJson(out, file);
  log(`wrote ${out}: ${implemented.length} implemented, ${reported.length} reported`);
}

if (isMain(import.meta.url)) await main();
