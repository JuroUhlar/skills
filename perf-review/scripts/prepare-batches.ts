// Split current-period Slack messages and Notion comments into text batches for highlight sub-agents.
//
//   node prepare-batches.ts DIR [--size 150] [--context 3] [--top 5] [--min-score 1] [--min-chars 40]
//
// With DIR/scores.jsonl (score-jev.ts), keeps only items in the top --top percent of some criterion that also
// score at least --min-score on it, strongest first, with their scores. Without it, keeps every item of at least --min-chars.
// Each item comes with its thread context; a thread's picked items stay together, as one effort. Writes DIR/batches/NN.txt.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { fatal, isMain, log } from "./common.ts";
import { loadItems, readScores, renderItem, STANDOUT_FLOOR, STANDOUT_PERCENT, standouts, type Item } from "./items.ts";

export type Picked = { item: Item; scores: Record<string, number> | null; standsOut: string[] };

export function pickItems(dir: string, opts: { before: number; top: number; minScore: number; minChars: number }): { picked: Picked[]; person: string; scored: boolean } {
  const { items, person } = loadItems(dir, opts.before);
  const lines = readScores(dir);
  if (!lines.length) {
    const picked = items.filter((i) => [...i.text.trim()].length >= opts.minChars).map((item) => ({ item, scores: null, standsOut: [] }));
    return { picked, person, scored: false };
  }
  const scores = new Map(lines.map((l) => [l.id, l.scores]));
  const stand = standouts(lines, opts.top, opts.minScore);
  const best = (s: Record<string, number>) => Math.max(0, ...Object.values(s));
  const picked = items.flatMap((item) => {
    const s = scores.get(item.id);
    const standsOut = stand.get(item.id);
    return s && standsOut ? [{ item, scores: s, standsOut }] : [];
  });
  picked.sort((a, b) => best(b.scores ?? {}) - best(a.scores ?? {}));
  return { picked, person, scored: true };
}

/** Picked items as batch texts of about `size` items each. Each thread starts with a `===` line; its items stay together, in time
 * order, placed where its strongest item ranks, and each earlier message is shown once. A thread is never split across batches, so only a thread larger than `size` makes a batch larger. */
export function batchTexts(picked: readonly Picked[], person: string, size: number): string[] {
  const threads = new Map<string, Picked[]>();
  for (const p of picked) threads.set(p.item.thread, [...(threads.get(p.item.thread) ?? []), p]);
  const batches: string[][] = [];
  let count = 0;
  for (const group of threads.values()) {
    group.sort((a, b) => a.item.at.localeCompare(b.item.at));
    const header = group.length > 1 ? `=== Thread with ${group.length} messages by ${person}: judge them together as one effort\n\n` : "=== Single message\n\n";
    const shown = new Set<string>();
    const body = group.map(({ item, scores, standsOut }) => {
      const line = scores ? `Scores: ${Object.entries(scores).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(", ")}; stands out on ${standsOut.join(", ")}\n` : "";
      return `--- ${item.url}\n${line}${renderItem(item, person, shown)}\n`;
    }).join("\n");
    if (!batches.length || (count > 0 && count + group.length > size)) { batches.push([]); count = 0; }
    batches[batches.length - 1]?.push(header + body);
    count += group.length;
  }
  return batches.map((b) => b.join("\n"));
}

function main() {
  const { values, positionals } = parseArgs({
    options: { size: { type: "string", default: "150" }, context: { type: "string", default: "3" }, top: { type: "string", default: String(STANDOUT_PERCENT) }, "min-score": { type: "string", default: String(STANDOUT_FLOOR) }, "min-chars": { type: "string", default: "40" } },
    allowPositionals: true,
  });
  const [dir] = positionals;
  const size = Number(values.size), before = Number(values.context), top = Number(values.top), minScore = Number(values["min-score"]), minChars = Number(values["min-chars"]);
  if (dir === undefined || !Number.isInteger(size) || size < 1 || !Number.isInteger(before) || before < 0 || !(top > 0 && top <= 100) || Number.isNaN(minScore) || !Number.isInteger(minChars) || minChars < 0) {
    fatal("usage: prepare-batches.ts DIR [--size 150] [--context 3] [--top 5] [--min-score 1] [--min-chars 40]");
  }

  const { picked, person, scored } = pickItems(dir, { before, top, minScore, minChars });
  const out = join(dir, "batches");
  mkdirSync(out, { recursive: true });
  for (const f of readdirSync(out)) rmSync(join(out, f));
  const texts = batchTexts(picked, person, size);
  texts.forEach((text, i) => writeFileSync(join(out, `${String(i + 1).padStart(2, "0")}.txt`), text));
  const n = texts.length;
  log(`wrote ${n} batches of up to ${size} to ${out} from ${picked.length} items${scored ? ` in the top ${top}% of some criterion` : ""}`);
}

if (isMain(import.meta.url)) main();
