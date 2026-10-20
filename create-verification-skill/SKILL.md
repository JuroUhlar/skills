---
name: create-verification-skill
description: Use when the user invokes create-verification-skill, or asks to create, audit, or update a project verification skill.
disable-model-invocation: true
metadata:
  inspiration:
    - https://github.com/cursor/plugins/tree/main/pstack/skills/create-verification-skill
    - https://github.com/cursor/plugins/tree/main/pstack/skills/maintain-verification-skill
---

# Create a verification skill

Generate a project verification skill: a repo-local skill that runs the real app the way a user does and captures proof. [`verify-with-proof`](../verify-with-proof/SKILL.md) uses it. Write for an agent that reads it cold, mid-task, and has never seen the app.

Repo already has one → [Maintain](#maintain) it instead.

## Start small

Write one short page first. Add detail only when a run shows it's needed.

- Plain instructions in one `SKILL.md`, under ~80 lines.
- Add a script only after a manual step failed or got repeated across test runs. Say why in the commit.
- The repo's tests already describe user journeys → point to them. Record only what they don't show: env vars a flow needs, flows that can't run locally. Write per-feature files only when no such tests exist.

```
BAD:  launch/doctor/stop scripts and a features/ file per feature in the first draft
GOOD: one page: what the app is, when to use the skill, where to run it, proof, gotchas
```

## Interview the repo, not the user

Ask only what you can't observe.

- **Surface:** what users touch (web, CLI/TUI, desktop, API, mobile, library). Pick the primary one, note the rest.
- **Run:** every place the app runs, from docs, CI and deploy config: dev server, production build, preview or staging deploy. Ports, env vars, seed data, auth.
- **Drive:** existing harnesses first (Playwright specs, PTY helpers, curl-able endpoints). Then generic: browser for web, tmux/PTY for CLI, HTTP for services.
- **Observe:** screenshots, terminal transcripts, response bodies, exit codes, stored state.
- **Isolate:** can two instances run side by side (ports, data dirs, allowed origins)? If not, the skill says so.
- **Siblings:** look for verification skills in the org's other repos (`gh search code --owner <org> "name: verify-"`). Match their structure and terms.

Checkout doesn't build or start → fix it or report precisely before generating.

## Generate the skill

Write `verify-<app>/SKILL.md` in the repo's project skill directory (match what exists, e.g. `.claude/skills/`, `.agents/skills/`). The `description` names the app and surface, says when to use it, and says when to write a normal test instead. Follow [`write-well`](../write-well/SKILL.md). Every line comes from what the interview found or a run confirmed.

### When to use it

- A check that should stay true → an assertion in the repo's test suite. That's the permanent proof.
- The skill is for the rest: prototyping before you know what to assert, before/after comparisons (`main` vs branch), screenshots for a human, deployed environments.

### Where to run it

- Run modes ordered cheapest first. Each gets what it's for, a start command, and a test command.
- Shared or outward-facing targets (staging deploy, shared database) → ask the user first.
- A before/after recipe: the same check against `main` and the branch, each with its own evidence.

### Proof

- Visual app → screenshots of each visible result by default. Give a recipe that reliably captures the result, e.g. an element screenshot with sticky overlays hidden.
- Keep evidence in a gitignored folder inside the workspace, so links to it open from the chat.
- Report screenshots in the form the user's client renders: links where inline images don't render.
- Show how to read back side effects (rows, files, messages sent).
- Report each check with what was done, what was observed, and PASS or FAIL. A FAIL stays a FAIL.
- When done, suggest which checks should become permanent tests. Don't add them unasked.
- Copy in the rules from [Prove it against the real thing](../verify-with-proof/SKILL.md#prove-it-against-the-real-thing) that apply. Teammates may not have that skill.

### Rules

- Never print secrets from env files. List key names only.
- Never stop or reuse a server you didn't start. Stop only what you started, by process group or PID, never by name.
- Don't touch the user's local data or checkout. Use a worktree for fresh state, and copy runtime state into the evidence before removing it.

### Gotchas

One bullet each: the symptom and the fix. Only traps a run actually hit or that you reproduced.

### Keep this skill current

Always include this section: "When a run surprises you and you confirm the cause, add or fix a gotcha here in the same change. Delete gotchas that are no longer true."

## Verify each gotcha at its source

- Reproduce it and quote the actual error. Find the root cause before writing it down.
- Don't copy constraints from memory, notes, or earlier sessions without rechecking.

```
BAD:  "Port 3001 is forbidden." (from an old note)
GOOD: "The default key's workspace allows localhost:3000 only. On 3001, identification returns 403 origin_not_available."
```

## Fix gotchas at the source

- For each gotcha, ask whether repo config or a small code change removes it. Propose that before documenting a workaround.
- Common cases: a dev tool rewrites tracked files, the test runner silently starts a stale build, a report server blocks the shell, a test waits for text already on screen, a missing optional service logs errors on every run.
- Commit those fixes separately from the skill, and delete the gotcha.
- Keep a gotcha only when the fix is outside the repo (dashboard, other team) or the trap is inherent.

## Check the evidence yourself

- Open every screenshot before calling it proof. A recipe that runs can still capture the wrong thing, e.g. a sticky header covering the result.
- Unsure how the user's client shows images? Show one inline and as a link, and ask which works.

## Test with cold subagents

Offer this after the first draft. Repeat until a round reports nothing wrong and no guessing.

1. **Task.** A fresh subagent gets only the skill path and a realistic task on a feature not covered yet. Constraints: no deploy, push, or commit, leave the user's data alone, clean up, keep evidence in a given folder.
2. **Report.** Ask for: verdict with evidence, exact commands, every point where the skill was unclear, wrong or made it guess, which gotchas saved time, cleanup state.
3. **Check.** Verify its claims yourself: open its screenshots, check ports, worktrees, `git status`.
4. **Triage.** Sort its feedback into "add" and "skip, with reason". The user picks.
5. **Commit.** Each round's fixes go in a new commit that names the round, so history shows why each gotcha exists.

Proved it in a stand-in (local stack instead of staging) → list the steps the real target didn't get. They stay unverified.

## Maintain

1. **Scope.** Edit only the verification skill. The skill describes behavior the app no longer has → doc drift (fix the skill) or regression (report it, don't paper over it).
2. **Source check.** Commands, paths, env var names, and test pointers still exist. Sweep changes since the skill was last touched for new run modes or traps.
3. **Gotchas.** Each one still reproduces. Ones the repo can now fix → [fix at the source](#fix-gotchas-at-the-source).
4. **Live pass.** Run one [cold subagent round](#test-with-cold-subagents) on a recently changed feature.
5. **Outcome.** Say one: `clean` (nothing to change), `changed` (one commit or PR of proven corrections), `blocked` (what blocked it).
