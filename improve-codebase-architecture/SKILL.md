---
name: improve-codebase-architecture
description: Use when asked to improve, review, or find refactoring opportunities in a codebase's architecture or structure, not a single diff.
disable-model-invocation: true
metadata:
  inspiration:
    - https://github.com/mattpocock/skills/tree/main/skills/engineering/improve-codebase-architecture
    - https://github.com/cursor/plugins/tree/main/pstack/skills/architect
---

# Improve codebase architecture

Find refactors where deepening a module pays back, rank them, and let the user pick. Judge candidates with [`core-principles`](../core-principles/SKILL.md), especially [Deep modules](../core-principles/SKILL.md#deep-modules), [Model the domain](../core-principles/SKILL.md#model-the-domain), and [Locally right is globally right](../core-principles/SKILL.md#locally-right-is-globally-right).

## Aim where churn is

- If the user names an area or pain point, take it.
- Otherwise read a long stretch of `git log` and rank files and directories by how often they change. Start there; refactoring code nobody touches never pays back.
- No clear hot spot: widen the net, but still skip stable code.

## Read the "no"s first

Read the glossary and the design constraints and product decisions in `CONTRIBUTING.md` before scanning. Don't re-suggest what a recorded decision rejected unless the friction is real enough to reopen it; then say so in the candidate ("contradicts the 'no ORM' constraint, worth reopening because…").

## Scan for friction

Explore the hot area and note where understanding or changing it is hard:
- One concept needs bouncing between many small modules.
- Interface nearly as complex as the implementation (deletion test fails).
- Pure functions extracted for testability while the bugs live in how they're called.
- The same workaround in unrelated places; casts or always-set optional fields to compile.
- Callers must know internals; behavior untested or untestable through the current interface.

## Present candidates as an HTML report

Write one self-contained HTML file to the OS temp dir (`architecture-review-<timestamp>.html`), open it, and give the user its path. Nothing lands in the repo.

One card per candidate:
- **Files**
- **Problem**: the friction, in the glossary's domain terms
- **Change**: what would move or merge, in plain words
- **Payoff**: what gets easier to change or test
- **Before / after**: side-by-side Mermaid diagram (calls or dependencies), loaded from a CDN
- **Strength**: Strong, Worth exploring, or Speculative, as a badge

End with the one you'd do first and why. Don't design interfaces yet; ask which candidate to explore.

## Explore the pick

- Walk the decision with the user ([`grill-me`](../grill-me/SKILL.md)): constraints, the deepened module's shape, which tests survive.
- New interface with no precedent: [design it twice](../core-principles/SKILL.md#design-it-twice).
- User rejects a candidate for a lasting reason: offer to record it as a design constraint in `CONTRIBUTING.md` (see [Record the "no"s](../improve-codebase-docs/SKILL.md#record-the-nos)) so the next review doesn't re-suggest it.
