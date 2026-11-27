// Helpers shared by the collectors and the report builder.
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { epochMs, isDay, toTimestamp, type Actor, type Day, type Period, type Pr, type Timestamp } from "./records.ts";
import { parse, type Schema } from "./schema.ts";

// Dates

const MS_PER_DAY = 86_400_000;

export function toDay(d: Date): Day {
  const s = d.toISOString().slice(0, 10);
  if (!isDay(s)) throw new Error(`invalid date ${String(d)}`);
  return s;
}

export const addDays = (d: Day, n: number): Day => toDay(new Date(Date.parse(`${d}T00:00:00Z`) + n * MS_PER_DAY));
export const today = (): Day => toDay(new Date());
export const now = (): Timestamp => toTimestamp(new Date());

/** Split [from, to] (inclusive) into calendar-month pieces, so each search stays under API result caps. */
export function monthChunks(p: Period): Period[] {
  const out: Period[] = [];
  let cur = p.from;
  while (cur <= p.to) {
    const at = new Date(`${cur}T00:00:00Z`);
    const nextMonth = toDay(new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1)));
    const last = addDays(nextMonth, -1);
    out.push({ from: cur, to: last < p.to ? last : p.to });
    cur = nextMonth;
  }
  return out;
}

/** UTC calendar day of a timestamp with any offset. */
export const utcDay = (t: Timestamp): Day => toDay(new Date(epochMs(t)));

export function inPeriod(t: Timestamp | null, p: Period): boolean {
  if (t === null) return false;
  const d = utcDay(t);
  return p.from <= d && d <= p.to;
}

export const hoursBetween = (a: Timestamp, b: Timestamp): number => Math.round(((epochMs(b) - epochMs(a)) / 3_600_000) * 100) / 100;

export function median(values: number[]): number | null {
  const s = [...values].sort((x, y) => x - y);
  const hi = s[Math.floor(s.length / 2)];
  const lo = s[Math.ceil(s.length / 2) - 1];
  return hi === undefined || lo === undefined ? null : (lo + hi) / 2;
}

export type NonEmpty<T> = [T, ...T[]];
export const isNonEmpty = <T>(a: T[]): a is NonEmpty<T> => a.length > 0;
/** Earliest of a non-empty list of timestamps. */
export const earliest = (ts: NonEmpty<Timestamp>): Timestamp => ts.reduce((a, b) => (epochMs(b) < epochMs(a) ? b : a));

// Bots and automation

export const BOT_LOGINS = new Set(["github-actions", "dependabot", "renovate", "copilot", "copilot-pull-request-reviewer", "coderabbitai", "codecov",
  "sonarcloud", "vercel", "netlify", "changeset-bot", "linear", "snyk-bot"]);
// Machine-user naming conventions: foo[bot], foo-bot, infra-robot, actions-runner.
const BOT_NAME = /\[bot\]$|(^|[-_])(bot|robot|runner)([-_]|$)/i;
// PRs opened by release tooling or dependency bots. Human release PRs are real work, so titles only match tool-generated names.
export const AUTOMATED_BRANCH_PREFIXES = ["changeset-release/", "release-please--", "renovate/", "dependabot/", "snyk-"];
const AUTOMATED_TITLE = /^(version packages\b|(chore|build)\(deps(-dev)?\): bump )/i;
/** AUTOMATED_TITLE in words, for the report. */
export const AUTOMATED_TITLE_RULE = `titles starting with "Version Packages" or "chore(deps): bump" / "build(deps-dev): bump"`;

/** `extra`: lowercase logins of known machine users. Deleted ("ghost") accounts count as bots. */
export function isBot(a: Actor, extra: ReadonlySet<string> = new Set()): boolean {
  if (a.login === null) return true;
  const lower = a.login.toLowerCase();
  return a.type === "Bot" || BOT_NAME.test(lower) || BOT_LOGINS.has(lower) || extra.has(lower);
}

/** Why a PR counts as automated, or null. `codingAgent`: a bot opened it on the user's behalf, so it's the user's work. */
export function automatedReason(p: Pr, opts: { bots?: ReadonlySet<string>; codingAgent?: boolean } = {}): string | null {
  if (isBot(p.author, opts.bots) && !opts.codingAgent) return `bot author ${p.author.login ?? "(deleted)"}`;
  if (AUTOMATED_BRANCH_PREFIXES.some((b) => p.head_ref.toLowerCase().startsWith(b))) return `release/dependency branch ${p.head_ref}`;
  if (AUTOMATED_TITLE.test(p.title)) return "release/dependency title";
  return null;
}

// Files

export function readJson<T>(path: string, schema: Schema<T>): T | null {
  if (!existsSync(path)) return null;
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  return parse(schema, raw, path);
}

export function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, JSON.stringify(data, null, 1));
  renameSync(`${path}.tmp`, path);
}

// HTTP

/** Seconds to wait before retrying a response, or null if it isn't retryable. */
function retryAfter(res: Response, attempt: number): number | null {
  const header = Number(res.headers.get("retry-after"));
  if (header > 0) return header;
  // GitHub signals primary rate limits with 403 and x-ratelimit-remaining: 0.
  const reset = Number(res.headers.get("x-ratelimit-reset"));
  if (res.headers.get("x-ratelimit-remaining") === "0" && reset > 0) return Math.max(1, reset - Math.floor(Date.now() / 1000));
  if (res.status === 429 || res.status >= 500) return 10 * attempt;
  return null;
}

export async function fetchJson(url: string, init: RequestInit = {}, attempts = 6): Promise<unknown> {
  const label = `${init.method ?? "GET"} ${url.split("?")[0] ?? url}`;
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
    } catch (e) {
      if (attempt >= attempts) throw new Error(`${label} failed: ${String(e)}`, { cause: e });
      log(`  ${label}: ${String(e)}, retrying in ${10 * attempt}s`);
      await sleep(10_000 * attempt);
      continue;
    }
    if (res.ok) return res.json();
    const wait = retryAfter(res, attempt);
    if (wait === null || attempt >= attempts) throw new Error(`${label} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
    log(`  ${label}: HTTP ${res.status}, retrying in ${wait}s`);
    await sleep(wait * 1000);
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const log = (msg: string) => process.stderr.write(`${msg}\n`);

export function env(name: string, hint: string): string {
  const v = process.env[name];
  if (!v) fatal(`Set ${name}: ${hint}`);
  return v;
}

export function fatal(msg: string): never {
  log(msg);
  process.exit(1);
}

// CLI

/** True when the module at `url` is the script node was started with, not an import. Resolves symlinks,
 * since skills are often installed as a symlinked folder and Node reports the real path in import.meta.url. */
export function isMain(url: string): boolean {
  const script = process.argv[1];
  if (script === undefined) return false;
  try {
    return realpathSync(script) === realpathSync(fileURLToPath(url));
  } catch {
    return false;
  }
}

/** Narrow the shared `--from`, `--to`, `--out` options. */
export function periodArgs(values: { from?: string; to?: string; out?: string }, usage: string): Period & { out: string } {
  const { from, to, out } = values;
  if (from === undefined || !isDay(from) || to === undefined || !isDay(to) || !out) fatal(usage);
  if (from > to) fatal(`--from ${from} is after --to ${to}`);
  return { from, to, out };
}
