// Split current-period Slack messages and Notion comments into compact text batches for highlight sub-agents.
//
//   node prepare-batches.ts DIR [--size 300] [--min-chars 40]
//
// Reads DIR/current/slack.json and DIR/current/notion.json, drops short messages ("thanks", "+1"),
// and writes DIR/batches/NN.txt, one message per block with its date, place, and link.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { fatal, isMain, log, readJson } from "./common.ts";
import { isReply, notionFile, slackFile } from "./records.ts";

type Item = { at: string; where: string; url: string; text: string };

export function batchItems(dir: string, minChars: number): Item[] {
  const slack = readJson(join(dir, "current", "slack.json"), slackFile);
  const notion = readJson(join(dir, "current", "notion.json"), notionFile);
  const items: Item[] = [
    ...(slack?.messages ?? []).map((m) => ({ at: m.at, where: `slack #${m.channel}${isReply(m) ? " (thread reply)" : ""}`, url: m.permalink, text: m.text })),
    ...(notion?.comments ?? []).map((c) => ({ at: c.at, where: `notion comment on "${c.page_title}"`, url: c.page_url, text: c.text })),
  ];
  return items.filter((i) => [...i.text.trim()].length >= minChars).sort((a, b) => a.at.localeCompare(b.at));
}

function main() {
  const { values, positionals } = parseArgs({ options: { size: { type: "string", default: "300" }, "min-chars": { type: "string", default: "40" } }, allowPositionals: true });
  const [dir] = positionals;
  const size = Number(values.size);
  const minChars = Number(values["min-chars"]);
  if (dir === undefined || !Number.isInteger(size) || size < 1 || !Number.isInteger(minChars) || minChars < 0) fatal("usage: prepare-batches.ts DIR [--size 300] [--min-chars 40]");

  const items = batchItems(dir, minChars);
  const out = join(dir, "batches");
  mkdirSync(out, { recursive: true });
  for (const f of readdirSync(out)) rmSync(join(out, f));
  let n = 0;
  for (let i = 0; i < items.length; i += size) {
    n++;
    const body = items.slice(i, i + size).map((x) => `--- ${x.at.slice(0, 10)} ${x.where} ${x.url}\n${x.text.trim()}\n`).join("\n");
    writeFileSync(join(out, `${String(n).padStart(2, "0")}.txt`), body);
  }
  log(`wrote ${n} batches of up to ${size} to ${out} from ${items.length} items`);
}

if (isMain(import.meta.url)) main();
