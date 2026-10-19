---
name: tdd
description: Use when building a feature or fixing a bug test-first, when asked for red-green-refactor, a failing test, or a regression test, when writing or changing tests, and when asked to audit, review, or evaluate test coverage or test quality.
metadata:
  inspiration:
    - https://github.com/mattpocock/skills/tree/main/skills/engineering/tdd
    - https://github.com/obra/superpowers/tree/main/skills/test-driven-development
    - https://github.com/cursor/plugins/tree/main/pstack/skills/principle-test-behavior-not-implementation
---

# Test-Driven Development

Red → green loop. This skill makes the loop produce tests worth keeping. Consult every section before and during the loop, not after.

Read the project's domain glossary (`GLOSSARY.md` if present) so test names match its language, and respect design constraints and product decisions in `CONTRIBUTING.md`.

## Interfaces: where tests go

Test through the public **interface**: where callers observe behavior without reaching inside. Never against internals.

**Test only at pre-agreed interfaces.** Before writing any test, list the interfaces and confirm them with the user; no test at an unconfirmed one. Interfaces in a spec the user already confirmed count as confirmed. One line per interface: what it catches, what it misses. Ask: "Which public interfaces should we test?"

## The loop

1. **Name the break.** Before writing the test: which production change should make it fail, and is that change a bug or a decision? Can't name one → redesign the test around an observable behavior.
2. **Red.** One test, one behavior, real code. Run it. It must *fail* (not error) for the expected reason: feature missing, not a typo or bad import. Passes immediately → it tests existing behavior; fix the test. Bug fix: the failure must show the reported symptom.
3. **Green.** Minimum code to pass. No speculative options or features.
   - Never edit a test to fit a wrong implementation; never weaken an assertion unless the expected behavior genuinely changed.
   - Code written before its test: delete it, restart from the test. Don't keep it "as reference". Throwaway exploration is fine; discard it.
4. **Check.** Run the targeted test, then the project's full suite before calling it done. Report every failure by name, including ones you didn't cause.
5. **Repeat** as a vertical slice: one interface → one test → one implementation. Each test is a tracer bullet informed by the last cycle.

Refactoring is not part of the loop; it belongs to review ([`code-review`](../code-review/SKILL.md)).

## When a test isn't worth it

Don't force one when the path is unclear or costly: broad harness setup, brittle mocks, production-only state, slow e2e, vague repro. Prefer no new test over a bad one (mostly tests mocks, encodes implementation, timing-dependent, deleted right after proving the fix). Use the closest executable check instead (script, repro command, browser automation) per [`verify-with-proof`](../verify-with-proof/SKILL.md), and say so in the report.

## Anti-patterns

- **Implementation-coupled**: mocks internal collaborators, tests private methods, verifies through a side channel (querying the DB instead of the interface). Tell: breaks on refactor with no behavior change.
- **Tautological**: expected value recomputed the way the code does it (`expect(add(a, b)).toBe(a + b)`). Expected values come from an independent source: known-good literal, worked example, the spec.
- **Vacuous**: would still pass if every imported function returned `undefined`. Loose assertions (`toBeDefined`, `toBeTruthy`, `not.toThrow`, `toBeGreaterThan(0)`), call-only checks (`toHaveBeenCalled`), assertions on data the test built itself. Fix: call the subject with one concrete input, assert the literal output or effect. For an absence, also assert the presence on another input.
- **Change detector**: only an intentional decision can fail it (constant's value, message wording, private structure). Test the behavior that depends on the decision: not `MAX_RETRIES === 5` but "a failing call is retried 5 times; a 6th never happens".
- **Testing the framework**: assert the contract your code makes at its boundary, not upstream mechanics.
- **Horizontal slicing**: all tests first, then all code. Tests verify imagined behavior and go insensitive to real change.

See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking rules.

## Before done: mutation check

Mentally mutate the production code: wrong constant or argument, wrong branch, missing side effect, empty/default return, missing validation (zero, empty, malformed). Each realistic mutation should fail at least one test. One nothing catches is unprotected behavior, or a tautological test.

## Auditing existing tests

Coverage % shows what ran, not what's protected. Judge tests by what they'd catch:
- Scan the target against the anti-patterns above; list tests to rewrite or delete.
- Run the mutation check mentally per behavior to find unprotected ones.
- Then **offer** real mutation testing (the ecosystem's mutation tool, scoped to the audited files). Offer, don't run unprompted: it's slow. Surviving mutants = unprotected behavior; killed ones prove the tests work.
- Report per feature: protected, unprotected (with the surviving mutation), and tests to fix or drop. Don't write new tests unless asked.

## When stuck

- Hard to test → design too coupled; simplify the interface, inject dependencies.
- Must mock everything → same.
- Huge setup → extract helpers; still huge → simplify the design.

## Report

Evidence, not outcome: the failing-before test and its failure, the passing-after run, full-suite status. No failing-before? Say why and name the closest check used.

## Next

Offer to prove the behavior on the running build with [`verify-with-proof`](../verify-with-proof/SKILL.md).
