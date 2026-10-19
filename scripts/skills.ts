// Build and check the skills repo.
//
//   npm run build   # regenerate .claude-plugin/marketplace.json
//   npm run check   # type-check this script, then fail on any repo rule violation

import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
  try {
    return parseYaml(match[1]) as Frontmatter;
  } catch (error) {
    const reason = (error as Error).message.split("\n")[0];
    throw new Error(`${skill}/SKILL.md: invalid frontmatter (${reason})`);
  }
}

function renderMarketplace(): string {
  const marketplace = JSON.parse(readFileSync(MARKETPLACE, "utf8"));
  const skills = publicSkills();
  // The bundle ships the whole repo so relative links between skills resolve.
  const bundle = {
    name: "all",
    description: "Every skill in this marketplace, including the pmode router. Install this or individual skills, not both.",
    source: "./",
    strict: false,
    skills: skills.map((skill) => `./${skill}`),
  };
  marketplace.plugins = [
    bundle,
    ...skills.map((skill) => ({
      name: skill,
      description: (frontmatter(skill).description ?? "").split(/\s+/).join(" ").trim(),
      source: `./${skill}`,
      strict: false,
      skills: ["./"],
    })),
  ];
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

  // Claude Code tracks commits when no version is set; a pinned version hides every later push.
  // https://code.claude.com/docs/en/plugins/host-marketplace#release-a-new-version
  const marketplace = JSON.parse(readFileSync(MARKETPLACE, "utf8"));
  if (marketplace.version || marketplace.metadata?.version) {
    errors.push(`${relative(ROOT, MARKETPLACE)}: remove the marketplace version, it doesn't control plugin updates`);
  }
  for (const plugin of marketplace.plugins ?? []) {
    if (plugin.version) errors.push(`${relative(ROOT, MARKETPLACE)}: plugin ${plugin.name} sets version, which blocks updates`);
  }
  for (const skill of skills) {
    const manifest = join(ROOT, skill, ".claude-plugin", "plugin.json");
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, "utf8")).version) {
      errors.push(`${relative(ROOT, manifest)}: sets version, which blocks updates`);
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

/**
 * Run the eval suite against the working tree. `claude plugin eval` needs a plugin root,
 * so assemble one in the OS temp dir from the public skills and evals/.
 */
function runEvals(extraArgs: string[]): number {
  const plugin = join(tmpdir(), "juraj-skills-eval");
  rmSync(plugin, { recursive: true, force: true });
  mkdirSync(join(plugin, ".claude-plugin"), { recursive: true });
  writeFileSync(join(plugin, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "all" }));
  for (const skill of publicSkills()) cpSync(join(ROOT, skill), join(plugin, "skills", skill), { recursive: true });
  cpSync(join(ROOT, "evals"), join(plugin, "evals"), {
    recursive: true,
    filter: (src) => !src.startsWith(join(ROOT, "evals", "results")),
  });
  const outputDir = join(ROOT, "evals", "results", new Date().toISOString().replaceAll(":", "-"));
  // Sonnet keeps runs cheap. Skill choice differs by model, so pass `--model opus` to confirm on Opus.
  const args = ["plugin", "eval", plugin, "--model", "sonnet", "--ablation", "none", "--runs", "1", "--max-cost-usd", "3",
    "--no-publish", "--trust-plugin", "--output-dir", outputDir, ...extraArgs];
  return spawnSync("claude", args, { stdio: "inherit" }).status ?? 1;
}

function main(command: string | undefined): number {
  if (command === "eval") return runEvals(process.argv.slice(3));
  if (command === "build") {
    writeFileSync(MARKETPLACE, renderMarketplace());
    return 0;
  }
  if (command === "check") {
    const errors = check();
    for (const error of errors) console.log(error);
    console.log(errors.length ? `${errors.length} problem(s)` : "ok");
    return errors.length ? 1 : 0;
  }
  console.log("usage: node scripts/skills.ts <build|check|eval>");
  return 2;
}

try {
  process.exitCode = main(process.argv[2]);
} catch (error) {
  console.log((error as Error).message);
  process.exitCode = 1;
}
