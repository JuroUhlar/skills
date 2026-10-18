---
name: improve-codebase-guardrails
description: Use when asked to add or improve linters, type checks, import rules, CI checks, or tests that guard a codebase, or after a mistake or review correction that shouldn't happen again.
metadata:
  inspiration:
    - https://github.com/cursor/plugins/tree/main/pstack/skills/correct
    - https://github.com/cursor/plugins/tree/main/pstack/skills/principle-encode-lessons-in-structure
    - https://github.com/mattpocock/skills/tree/main/skills/engineering/retro
---

# Improve codebase guardrails

Change the repo's structure so the next human or agent can't make a known mistake, instead of relying on someone remembering a rule.

Design for a contributor who sees only the files they opened, copies the nearest example, and takes the shortest path that compiles. A change that looks right from one file must be right for the whole repo (see [Locally right is globally right](../core-principles/SKILL.md#locally-right-is-globally-right)).

## Find mistake classes

- Read recent commits, reverts, review comments, agent instruction files, and comments explaining workarounds.
- Group mistakes into classes. One occurrence is enough to guard against a class; don't wait for a repeat.
- Read the repo's check commands (package scripts, build tool, pre-commit, CI) first. A check that is unwired, skipped, or silently broken is a finding; no lint/typecheck/test in CI is the top finding.

## Hierarchy of constraints

Fix each class at the highest level that works. Drop a level only after saying why the one above can't hold.

### 1. Architecture: the mistake can't be expressed

- One owner per piece of state, one supported way per task.
- Internals unimportable, so the wrong import fails to resolve.
- One source of truth; generate derived lists instead of hand-syncing them.
- Limits (timeout, size cap, auth, rate limit) live in the choke point every caller passes through, not copied into each caller.
- Delete old ways and dead code an agent would copy.

### 2. Types: the mistake doesn't compile

- Apply [Make wrong state unrepresentable](../core-principles/SKILL.md#make-wrong-state-unrepresentable) and [Parse, don't validate](../core-principles/SKILL.md#parse-dont-validate) to the mistake class: sum types, branded primitives, exhaustive switches, types derived from the owning schema.
- Turn on the compiler's strict flags before writing new types.

### 3. Lint or CI check: the mistake fails the build

- The error names the fix: the file, type, or function to use instead.
  - BAD: `no-restricted-syntax: toFixed is not allowed`
  - GOOD: `Use money.format() from src/money.ts; toFixed rounds incorrectly for currency`
- Import-boundary rules between modules and layers belong here when the language can't hide internals.

### 4. Test: the mistake fails a test

- Behavior through the public interface (see [Interfaces: where tests go](../tdd/SKILL.md#interfaces-where-tests-go)).
- Only when the mistake is a wrong result, not a wrong shape; shapes belong to levels 1–3.

### 5. Prose rule: nothing fails

- Only for judgment calls no check can make. Put it in the repo's standards or agent instruction file (see [`improve-codebase-docs`](../improve-codebase-docs/SKILL.md)).
- Make it prominent and show the failure it prevents.
- Once a structural fix lands, delete the prose rule it replaces. The rule was the symptom.

## Repeat correction means climb

- When a mistake recurs despite a prose rule, the rule failed. Move the class up the hierarchy in the same change.
- Same for a check that keeps getting suppressed: the level or the check is wrong.

## Fail only on new occurrences

When a bad pattern is already widespread, fail only on new occurrences (baseline file, diff-scoped lint, counter that can only go down). Limits only tighten.

## Prove each check

- Show it fails on a real past mistake, then passes on the fix.
- Same command locally and in CI.
- Exceptions go on the offending line with a reason.

## Fix a wrong gate in its own change

If a check is wrong, fix or remove it in a separate commit or PR. Never route around it (skip, disable, weaken) inside the work it gates.

## Report

Per class: evidence (commits, review comments), the level picked, and why a higher level didn't work.
