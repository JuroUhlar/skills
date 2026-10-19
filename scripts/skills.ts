// Build and check the skills repo.
//
//   npm run build   # regenerate .claude-plugin/marketplace.json
//   npm run check   # type-check this script, then fail on any repo rule violation

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

const ROOT = resolve(import.meta.dirname, "..");
const MARKETPLACE = join(ROOT, ".claude-plugin", "marketplace.json");
const README = join(ROOT, "README.md");
const MAX_INSPIRATION = 3;

type Frontmatter = {
  name?: string;
  description?: string;
  metadata?: { inspiration?: string[] | string };
};

/** Top-level skill folders that ship, skipping gitignored ones (fp-*, .trash, ...). */
function publicSkills(): string[] {
  const dirs = readdirSync(ROOT)
    .filter((name) => existsSync(join(ROOT, name, "SKILL.md")))
    .sort();
  const ignored = new Set(gitCheckIgnore(dirs));
  return dirs.filter((name) => !ignored.has(name));
}

function gitCheckIgnore(paths: string[]): string[] {
  try {
    return execFileSync("git", ["check-ignore", "--stdin"], { cwd: ROOT, input: paths.join("\n"), encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
  } catch (error) {
    // Exit code 1 means none of the paths are ignored.
    if ((error as { status?: number }).status === 1) return [];
    throw error;
  }
}

function frontmatter(skill: string): Frontmatter {
  const text = readFileSync(join(ROOT, skill, "SKILL.md"), "utf8");
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error(`${skill}/SKILL.md has no frontmatter`);
  return parseYaml(match[1]) as Frontmatter;
}

function renderMarketplace(): string {
  const marketplace = JSON.parse(readFileSync(MARKETPLACE, "utf8"));
  marketplace.plugins = publicSkills().map((skill) => ({
    name: skill,
    description: (frontmatter(skill).description ?? "").split(/\s+/).join(" ").trim(),
    source: `./${skill}`,
    strict: false,
    skills: ["./"],
  }));
  return JSON.stringify(marketplace, null, 2) + "\n";
}

function headingAnchors(md: string): Set<string> {
  const headings = readFileSync(md, "utf8").matchAll(/^#+\s+(.*)$/gm);
  return new Set(
    [...headings].map(([, heading]) =>
      heading.trim().toLowerCase().replace(/[^\w\- ]/g, "").replaceAll(" ", "-"),
    ),
  );
}

function markdownFiles(): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return walk(path);
      return path.endsWith(".md") ? [path] : [];
    });
  return [README, ...publicSkills().flatMap((skill) => walk(join(ROOT, skill)).sort())];
}

function check(): string[] {
  const errors: string[] = [];
  const skills = publicSkills();

  for (const skill of skills) {
    const meta = frontmatter(skill);
    if (meta.name !== skill) errors.push(`${skill}: frontmatter name is ${JSON.stringify(meta.name)}, must match folder`);
    if (!meta.description) errors.push(`${skill}: missing description`);
    const inspiration = meta.metadata?.inspiration;
    if (Array.isArray(inspiration) && inspiration.length > MAX_INSPIRATION) {
      errors.push(`${skill}: ${inspiration.length} inspiration URLs, max ${MAX_INSPIRATION}`);
    }
  }

  if (readFileSync(MARKETPLACE, "utf8") !== renderMarketplace()) {
    errors.push(`${relative(ROOT, MARKETPLACE)} is stale: run \`npm run build\``);
  }

  const readme = readFileSync(README, "utf8");
  for (const skill of skills) {
    if (!readme.includes(`](${skill}/SKILL.md)`)) errors.push(`README.md: skill ${skill} is not listed`);
  }

  for (const md of markdownFiles()) {
    const rel = relative(ROOT, md);
    const text = readFileSync(md, "utf8");
    text.split("\n").forEach((line, i) => {
      if (line.includes("—")) errors.push(`${rel}:${i + 1}: em dash (see write-well)`);
    });
    for (const [, link] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^[a-z]+:/.test(link) || link.startsWith("{")) continue;
      const [path, anchor] = link.split("#", 2);
      const target = path ? resolve(dirname(md), path) : md;
      if (!existsSync(target)) errors.push(`${rel}: broken link ${link}`);
      else if (anchor && target.endsWith(".md") && !headingAnchors(target).has(anchor)) {
        errors.push(`${rel}: broken anchor ${link}`);
      }
    }
  }

  return errors;
}

const command = process.argv[2];
if (command === "build") {
  writeFileSync(MARKETPLACE, renderMarketplace());
} else if (command === "check") {
  const errors = check();
  for (const error of errors) console.log(error);
  console.log(errors.length ? `${errors.length} problem(s)` : "ok");
  process.exitCode = errors.length ? 1 : 0;
} else {
  console.log("usage: node scripts/skills.ts <build|check>");
  process.exitCode = 2;
}
