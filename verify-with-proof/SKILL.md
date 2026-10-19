---
name: verify-with-proof
description: Use after implementing, before claiming work is done, fixed, or passing, and when asked to "verify", "prove it works", or "did this fix it".
metadata:
  inspiration:
    - https://github.com/cursor/plugins/tree/main/pstack/skills/principle-prove-it-works
    - https://github.com/cursor/plugins/tree/main/pstack/skills/create-verification-skill
    - https://github.com/obra/superpowers/tree/main/skills/verification-before-completion
---

# Verify with proof

No success claim without evidence from the real artifact, observed this turn. "Should work", "compiles", "agent said done" are not evidence.

## Define the check first

State what done means as checks you can run, not a mood: command, observable, expected result. Re-read the spec/ticket and list each requirement; passing tests ≠ requirements met.

- BAD: "login works"
- GOOD: "POST /login with expired token → 401, no session row written; valid token → 200 + row"

The check must be **red-capable**: it asserts the exact symptom, so it fails on the old behavior and passes on the new. "Runs without erroring" is not a check. Expected values come from an independent source (spec, known-good literal), never recomputed the way the code does it.

No check possible (needs prod access, human clicks)? Say so, list what you tried, ask. Don't substitute a proxy.

## Prove it against the real thing

- **Real user path.** Drive the running app the way a user does: real binary/PTY for CLI, real browser for UI, real request for API. Not internal setters, test-only endpoints, or mocks (unless a production boundary already isolates the external system).
- **Read the actual value**, not a cached or derived view. Process alive? Check the process, not a log's mtime. Written? Read it back.
- **Observe side effects** (files, rows, messages sent), not just what's visible.
- **Dry-run / test modes:** observe what they actually skip. Some still hit the network.
- **Verification fails or looks odd → suspect your observation method first.**
- Reuse the repo's project verification skill, if present, before building a harness; 
- throwaway probes add no dependencies
- A repo with several entry points to a feature: one convenient path is incomplete proof.
- Script the check so a reviewer can re-run it; keep script + output as the artifact and link it from the PR. Beats an eyeballed one-off.

## Baseline, then after

Same command, data, environment on both. Baseline = merge base / parent / current broken state.

- Bug fix: the symptom must reproduce before the change, gone after. The after-state comes from the running changed build, not compilation or unit tests alone.
- Regression test: write → pass → revert fix → **must fail** → restore → pass.
- Flaky symptom: raise the repro rate (loop 100×, stress, narrow timing) before judging.

## Delegation

Agent reports success → check the diff/artifact yourself.

## Report

Lead with the status and the evidence: command → output, before vs after. Make it visual, use screenshots if helpful. Name what you did not verify. If a check couldn't run, say "unverified" or "inconclusive"; never soften a failure, never imply success you didn't observe.

## Hygiene

- **Redact** secrets (`<REDACTED>`) in shown commands, outputs, and artifacts. Drive loops via env vars; quote only lines carrying signal.
- Cleanup: stop only processes you started (never kill by name); remove scratch state, **keep the evidence**.
- Sensitive artifacts (prompts, bodies, heap dumps, private screenshots): inline minimal, don't write to disk without consent.
- Shared instance that can't be isolated: don't double-drive it.

## Next

If this verified your own change, offer to review the diff with [`code-review`](../code-review/SKILL.md) before handing it off.

No project verification skill, and proving this took real setup (launch, auth, seed data)? Offer [`create-verification-skill`](../create-verification-skill/SKILL.md) so the next proof is cheap.
