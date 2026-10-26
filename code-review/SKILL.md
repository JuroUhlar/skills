---
name: code-review
description: Use when asked to review a PR, branch diff, or local changes, or before merging or handing off your own work.
metadata:
  inspiration:
    - https://github.com/mattpocock/skills/tree/main/skills/engineering/code-review
    - https://github.com/obra/superpowers/tree/main/skills/requesting-code-review
    - https://github.com/cursor/plugins/tree/main/pstack/skills/interrogate
---

# Code review

Find the highest-leverage defects in a change. Signal over volume: few high-confidence findings beat many weak ones. "No findings" is a valid result; say what you checked and what stays unverified.

## Setup

1. **Fixed point:** user ref → PR `baseRefName` (`gh pr view --json baseRefName,...`) → `main`/`master`. Confirm `git rev-parse` and a non-empty `git diff <fp>...HEAD` before anything else; also `git log <fp>..HEAD --oneline`. Skip lockfile hunks. Uncommitted work: `git diff` / `--staged`.
2. **Intent**, one paragraph, from the first source found: user-supplied → PR description / linked issue → spec under `docs/`, `specs/`, `.scratch/` → commit messages (weak; say so). Nothing found: ask once; user says none → skip the Spec axis. Judge execution of the goal; don't question the goal.
3. **Standards sources:** repo docs on how to write code (`STANDARDS.md`, `CONTRIBUTING.md` and its design constraints and product decisions, `AGENTS.md`, rules). They override the smell baseline.
4. **Risk surfaces:** auth, secrets/crypto, payments, input validation, concurrency, DB writes/migrations, caching, public API contracts, perf-critical paths. Higher risk = stricter evidence bar.
5. **Declare the mode** before reading the diff, one line the user can correct: `Mode: sub-agents | direct (<reason>); Risk: <surfaces>`.

## Run

- **Large** = over ~300 changed non-test lines, or any risk surface touched. Unsure → large.
- Large: three parallel sub-agents (**Spec**, **Standards**, **Production**); the orchestrator doesn't pre-read the diff, it only aggregates. Keep axes separate until aggregation.
- Otherwise: review directly, no sub-agents.
- BAD: "the diff is mostly tests, I'll review it myself" on a change that touches DB writes. Size is not the only trigger.

Every sub-agent prompt:
- Crafted context only: intent, diff command, commit list, axis brief. Never your session history.
- Read-only: no changes to the working tree, index, or HEAD; other revisions go in a separate worktree.
- Must not spawn further reviewers.
- Runs the diff itself and reads callers/callees beyond it. Under 400 words.
- Includes the **Finding quality** rules below.

PRs: don't run the suite or lint unless asked; assume CI passes. Targeted repros of a suspected defect are the exception (see **Prove it**). High-risk change: run Production on two different models; issues both raise independently are the strongest signal.

## Finding quality

- Each finding: location, what breaks, why it matters here, **evidence** (the traced call chain or execution path, not "this could be nil").
- Hypothetical only counts if a caller can reach it. Trace the call site; validated upstream → drop.
- "Broken" ≠ "I'd do it differently". The latter isn't a finding without a concrete problem.
- No restating the code, no comments on code you didn't read, no "looks good" unchecked. Strengths: list what's done well, specifically (file:line), separately from findings; accurate praise earns trust in the rest.
- Simple code isn't a defect for lacking abstraction; premature abstraction is worse than duplication.
- If prior comments or docs look wrong, say so with code evidence.

## Axis briefs

**Spec** (needs a spec): (a) requirements missing or partial; (b) behavior not asked for (scope creep); (c) implemented but wrong. Quote the spec. The spec is a vision document: where it's silent, a reasonable user's expectation counts as a requirement; silence isn't permission. End with **Declined to judge**: behaviors set aside as outside the spec, one line + reason each.

**Standards:** (a) documented-standard violations, citing file + rule; (b) code quality. Skip anything tooling enforces; smells are judgment calls.
- Baseline smells (Fowler, *Refactoring* ch. 3): mysterious name, duplicated code, feature envy, data clumps, primitive obsession, repeated switches, shotgun surgery, divergent change, speculative generality, message chains, middle man, refused bequest.
- Look for restructurings that *delete* complexity, not rearrange it.
- Ad-hoc conditionals bolted into unrelated flows; feature checks scattered through shared code; logic in the wrong layer or duplicating an existing helper.
- Pass-through wrappers; `any`/casts/silent fallbacks covering an unclear invariant.
- New API with the old one kept alive despite no external consumers.
- File pushed past ~1k lines.

**Production** (ship risk only; skip style, naming, smells, pure "not in spec"):
1. Regressions: what previously safe behavior could this break? Edge cases, failure paths, silent behavior changes, broken invariants. Trace entry → validation → auth → transform → persist → output.
2. Root cause vs symptom: guard clauses masking an invariant violation, retries hiding a broken contract, casts silencing a modeling error, a fix in module A that belongs in B's contract.
3. Idempotency: run twice, or crash halfway? "Depends on leftover state" = missing reconciliation. Shared mutable state serialized structurally (locks, exclusive ownership), not by convention.
4. Security: trace input to sink; auth gaps; secrets in logs/errors. Validate once at the boundary.
5. Data integrity: partial writes, races, cache coherence, migration reversibility.
6. Tests: bug fix without a regression test; mocks hiding risk; assertions on a proxy (mtime, cached state) instead of the real value; async/delegated work trusting self-reports over output.
7. Missing counterparts: types/schemas, validation, metrics, migrations, client/server contracts.

## Aggregate as lead reviewer

You hold context the sub-agents lack (constraints, what was tried, scaffolding vs permanent, what the next PR fixes). Filter and decide; don't concatenate.

- Try to **prove** every P0/P1/P2 before keeping it (see below). Re-trace the rest.
- Drop: nit inflation, unreachable hypotheticals, preference-only, patterns consistent with the rest of the codebase, comments on code the author didn't touch.
- Don't dismiss security or correctness findings because they're uncomfortable. A concrete path, or independent agreement, means keep.
- Same issue on several axes → one finding, highest severity, Production framing if it's a real defect, tag every axis (`[production, spec]`).
- More than ~5 blocking items → filter harder.

## Prove it

Sub-agents report suspected defects; the orchestrator attempts to demonstrate each P0/P1 with the [`verify-with-proof`](../verify-with-proof/SKILL.md) skill. Attempting is the default, not an optional extra:
- Smallest red-capable probe: a failing test, script, or request that shows the claimed symptom on the change. If it's claimed as a regression, show it passes on the base.
- Run in a separate worktree or temp dir. Never modify the reviewed checkout; don't commit the probe.
- Probe passes (bug doesn't reproduce) → drop or downgrade the finding.
- Not attempted needs a one-line reason the probe is impossible (needs prod data, a real third-party account, new infra); mark `unproven: <reason>` and keep the traced path. "Didn't try" or "traced is enough" is not a reason.
- A unit test with the existing mocks usually takes minutes; it's rarely impossible.
- Attach the command and redacted output to the finding, so the author can re-run it.

## Severity

- **P0** likely production breakage, data loss, security bug (rare)
- **P1** realistic bug; fix before merge
- **P2** worthwhile, not blocking
- **P3** polish or follow-up

Default P1/P2. Most smells are P2/P3 unless they cause a real defect.

## Output

0. **Process**: mode and why, sub-agents run (axes, models), findings proven vs unproven, steps skipped and why. Skipped steps surface here, not only when the user asks.
1. **Strengths**: specific, brief; omit if nothing stands out.
2. **Findings**, ordered P0 → P3, numbered: `#<n> P<sev>: <title> [<axes>]`, then refs (file, line, symbol), impact, fix direction, `Proof:` proven (command → output) | unproven: <reason>. P3 may use `traced`.
3. **Dismissed**: one line + reason each, so the user can override.
4. **Declined to judge** (from Spec) and **Open questions**: only blockers or ambiguities.
5. **Summary**: one paragraph, verdict (approve / approve with follow-ups / request changes), counts per axis after dedup.
