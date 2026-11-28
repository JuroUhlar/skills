// Score every current-period Slack message and Notion comment with Jev (TypeSafe's judging model).
//
//   TYPESAFE_API_KEY=... node score-jev.ts DIR [--criteria FILE] [--context 3] [--concurrency 8] [--limit N]
//
// Each item is sent with its thread context (see items.ts) and one Score question per criterion from
// --criteria (default references/jev-criteria.json). Writes DIR/scores.jsonl, one line per item.
// Resumable: items already in the file are skipped, so a changed criteria file needs a new output (delete it).
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { env, fatal, fetchJson, isMain, log } from "./common.ts";
import { loadItems, readCriteria, readScores, renderItem, type Item } from "./items.ts";
import { type JevCriteria, type ScoreLine } from "./records.ts";
import { number, object, parse, record, string } from "./schema.ts";

const USAGE = "usage: TYPESAFE_API_KEY=... score-jev.ts DIR [--criteria FILE] [--context 3] [--concurrency 8] [--limit N]";
const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest";

const answer = object({ score: number, confidence: number });
const jevResponse = object({ model: string, answers: record(answer) });

async function score(key: string, item: Item, person: string, criteria: JevCriteria): Promise<ScoreLine> {
  const questions = Object.fromEntries(Object.entries(criteria).map(([name, c]) => [name, { type: "score", instructions: c.instructions, criteria: c.criteria }]));
  const raw = await fetchJson(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, state: renderItem(item, person), questions }),
  });
  const res = parse(jevResponse, raw, "jev");
  const missing = Object.keys(criteria).filter((k) => !res.answers[k]);
  if (missing.length) throw new Error(`jev returned no answer for ${missing.join(", ")}`);
  const pick = (f: "score" | "confidence") => Object.fromEntries(Object.keys(criteria).map((k) => [k, res.answers[k]?.[f] ?? 0]));
  return { id: item.id, source: item.source, at: item.at, where: item.where, url: item.url, text: item.text, model: res.model, scores: pick("score"), confidence: pick("confidence") };
}

async function main() {
  const { values, positionals } = parseArgs({
    options: { criteria: { type: "string" }, context: { type: "string", default: "3" }, concurrency: { type: "string", default: "8" }, limit: { type: "string" } },
    allowPositionals: true,
  });
  const [dir] = positionals;
  const before = Number(values.context), concurrency = Number(values.concurrency), limit = values.limit === undefined ? Infinity : Number(values.limit);
  if (dir === undefined || !Number.isInteger(before) || before < 0 || !Number.isInteger(concurrency) || concurrency < 1 || !(limit > 0)) fatal(USAGE);
  const key = env("TYPESAFE_API_KEY", "create one at https://console.typesafe.ai/keys");
  const criteria = readCriteria(values.criteria);

  const out = join(dir, "scores.jsonl");
  const done = new Set(readScores(dir).map((l) => l.id));
  const { items, person, missingThreads } = loadItems(dir, before);
  if (missingThreads) log(`${missingThreads} thread replies have no thread context; run collect-slack-threads.ts first`);
  const todo = items.filter((i) => i.text.trim() && !done.has(i.id)).slice(0, limit);
  log(`${items.length} items, ${done.size} already scored, ${todo.length} to score`);

  let next = 0, finished = 0, failed = 0, stop = "";
  const worker = async () => {
    for (let i = next++; i < todo.length && !stop; i = next++) {
      const item = todo[i];
      if (item === undefined) continue;
      try {
        appendFileSync(out, `${JSON.stringify(await score(key, item, person, criteria))}\n`);
      } catch (e) {
        failed++;
        // A bad key, no credit, or no access fails every item the same way: stop instead of calling thousands more times.
        if (/failed: 40[123] /.test(String(e))) stop = String(e).slice(0, 300);
        else log(`  failed ${item.url}: ${String(e).slice(0, 200)}`);
      }
      if (++finished % 100 === 0) log(`  ${finished}/${todo.length}`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  if (stop) fatal(`stopped: ${stop}`);
  log(`wrote ${out}: ${finished - failed} scored, ${failed} failed (rerun to retry)`);
  if (failed) process.exitCode = 1;
}

if (isMain(import.meta.url)) await main();
