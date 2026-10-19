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

Generate a project verification skill: a repo-local skill that drives the real app the way a user does and captures proof. [`verify-with-proof`](../verify-with-proof/SKILL.md) uses it. Write for an agent that reads it cold, mid-task, and has never seen the app.

Repo already has one → [Maintain](#maintain) it instead.

## Interview the repo, not the user

Ask only what you can't observe.

- **Surface:** what users touch (web, CLI/TUI, desktop, API, mobile, library). Pick the primary one, note the rest.
- **Run:** the repo's own dev command; ports, env vars, seed data, auth.
- **Drive:** existing harnesses first (Playwright specs, PTY helpers, curl-able endpoints, debug port). Then generic: browser/CDP for web and Electron, tmux/PTY for CLI/TUI, HTTP for services.
- **Observe:** screenshots, terminal transcripts, response bodies, exit codes, DB state.
- **Isolate:** can two instances run side by side (ports, data dirs, profiles)? If not, the skill says so.

Checkout doesn't build or start → fix it or report precisely before generating. An irrelevant missing asset blocks startup → the skill may create it, marked as verification scaffolding, and remove it in cleanup.

## Generate the skill

Write `verify-<app>/SKILL.md` in the repo's project skill directory (match what exists, e.g. `.claude/skills/`, `.agents/skills/`). Frontmatter: `name` and a `description` naming the app, the surface, and when to use it. Every section comes from what the interview found; no placeholders.

- **Launch:** exact command, plus a readiness signal that means usable, not just answering (a DB health check can pass while init scripts still run). Starts from an empty data dir, including migrations and seed data. Short-lived CLI: build once, run each drive in its own isolated PTY session.
- **Doctor:** one read-only "worth driving?" check: process up, right build, port owned by us, auth valid. Run it first and after anything surprising.
- **Drive:** real selectors and commands from this repo. Stable handles (ARIA names, data attributes, prompt strings, routes), not coordinates or tab order.
- **Evidence:** what to capture and where it's kept. Copy in the rules from [Prove it against the real thing](../verify-with-proof/SKILL.md#prove-it-against-the-real-thing) that apply to this app; teammates may not have this skill.
- **Cleanup:** stop only what the run started, never by process name. Remove instances and scratch state; evidence survives.
- **Helpers:** shipped scripts are executable, and the skill body shows how to invoke them.

## Seed the feature map

Create `verify-<app>/features/README.md` plus one file for each of the top 3–5 user-facing features (from routes, commands, menus, docs).

- **README:** baseline preconditions, driving conventions, index of feature files.
- **Feature file:** H1, one paragraph of user-visible behavior, then exactly these H2s:
  - `Sub-features`: short IDs, one line each.
  - `How to get to it (user POV)`: every entry point.
  - `Driving it with <harness>`: `Preconditions:`, then bullets pairing user action → exact command → observable result.
  - `Gotchas`: traps that waste or invalidate a run.
- No implementation details: user paths, handles, required state, commands, proof.
- Seed data lacks a precondition → the journey reports failure and the reason goes in `Gotchas`. Never weaken the journey to make it pass.

## Prove it before handing over

Run the generated skill end to end once: launch, doctor, drive one feature, capture evidence, clean up. Then confirm the evidence still exists.

- Run cleanup after every failed iteration too.
- Proved it in a stand-in (container instead of a fresh VM, local stack instead of remote) → list the setup steps the real target won't get. They stay unverified.

## Maintain

The feature map rots as the app changes.

1. **Scope.** Edit only the verification skill's directory. The map describes behavior the app no longer has → doc drift (fix the map) or product regression (report it, don't paper over it).
2. **Index.** Fix missing, extra, and dead entries in the features README.
3. **Source check.** Per feature, read the source and flag drift with file citations. Sweep changes since the map was last touched for user-facing surfaces the map lacks; name a concrete source path before calling one missing. Fan out read-only subagents per feature only for a large map ([`orchestrator`](../orchestrator/SKILL.md)).
4. **Live pass**, even when source looks clean. Drive every feature at least once. Doctor before the first drive and after any failed one; a wedged UI on a healthy process → reset or relaunch. Unreachable feature → record the concrete prerequisite and the route tried; a map that omits the prerequisite has drifted.
5. **Triage.** Wrong description → fix it. Working behavior the harness can't drive → fix the harness and re-drive it live. Broken app → report to the user, out of scope.
6. **Outcome.** Say one: `clean` (nothing to change), `changed` (one commit or PR of proven corrections), `blocked` (what blocked it).
