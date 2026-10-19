---
name: core-principles
description: Use when planning, designing, refactoring, or reviewing code, when judging a diff's size or structure, when you are torn between two options, or when the user says to apply core engineering principles (or rules, values) or names one.
metadata:
  inspiration:
    - https://github.com/cursor/plugins/blob/main/pstack/docs/guide/08-principles.md
    - https://github.com/cursor/plugins/tree/main/pstack/skills/architect
    - https://github.com/mattpocock/skills/tree/main/skills/engineering/codebase-design
---

# Core principles

When a principle affects your decision, call it out: "Deep modules: merged three wrappers into `Cart.checkout`."

## What (not) to build

### Experience first

The user is whoever consumes the work: end user, the colleague importing your API, the next maintainer. Their experience beats implementation convenience.
- Write the caller's code first (README snippet, 2–3 real call sites), then fit the types to it.
- Where the spec is silent, what a reasonable user expects is the requirement.

### Call out wrong assumptions

If you think the request or goal is based on incorrect assumptions (even if implied), call it out before building.

### Default to simplicity

- Prefer the simplest solution (smallest PR, simplest system, fewest moving parts) that meets requirements.
- All complexity is necessary evil that must be justified by user benefit.

### Be lazy

Most result for least code.
- Smallest diff that solves the problem; prefer deletion.
- Improvements outside the task go in a separate PR or a note.
- Before building, search for an existing implementation by domain concept, not the request's wording.
- Prefer native platform behavior over reimplementing it; hand-rolled copies miss edge cases.
- Don't build something "just in case" or "for the future".
  - Exception: If future is certain or the future-proof alternative is the same cost.

### Subtract before you add

- Remove dead code, stale shims, and unused options before building on them.
- Remove speculative validators, options, or extension points.
- Before deleting something that looks wrong, check history and PRs for why it exists. Don't infer intent from the code; a consistent pattern may be copy-paste.

### Pre-factor

If you face a lot of resistance making a change, something is wrong. Make the change easy, then make the easy change.

- Refactor without changing behavior (existing tests stay green)
- Then add the feature as a small diff.  
- Separate commits; separate PRs when the restructure is large.

### Redesign from first principles

Integrate a new requirement as if it existed from day one: "Starting fresh with this requirement, what would we build?" Redesign what the requirement touches, not the codebase.

- Signs you bolted it on: an if/else chain grows a branch, a second boolean must stay in sync with the first, a flag threads through layers.
- Friction mid-implementation means the design is wrong; revisit it instead of absorbing it. Signs: the same workaround in unrelated places, casts needed to compile, callers that must know internals.

### Design it twice

For a new interface or architecture with no precedent in the codebase:
- Sketch 2–3 radically different designs (e.g. smallest interface, most flexible, easiest common case) before committing.
- Pick one as the base and fold in the best ideas from the others; never average them into a hybrid.
- Skip for established patterns and fixes with a clear target.

## Shape of the code

### Minimize reader load

- Minimize layers of indirection, abstraction, and mutable state 
- Inline wrappers with one caller and layers that repeat the layer below.
- Shrink state scope: return over mutate, locals over fields over module state over globals; derive instead of sync.
- Tests: 
  - Can a new reader answer "where does X come from?" and "what can change X?" in 30 seconds?
  - How many times must they _Go to definition_ and how many things must they hold in their head?

### Deep modules

Lots of behavior behind a small interface. The interface is everything a caller must know: signature, invariants, ordering, error modes, config, performance.
- Deletion test: delete the module in your head. If complexity vanishes, it was a pass-through; if it reappears across callers, it earns its keep.
- Don't extract an interface that only one class implements. Add it when a second implementation exists (e.g. a test fake).
- Test through the interface. Needing to test past it means the module has the wrong shape (see [Interfaces: where tests go](../tdd/SKILL.md#interfaces-where-tests-go)).

### Locally right is globally right

The next contributor sees only the files it opened, copies the nearest example, and takes the shortest path that compiles. Make that path correct:
- One owner per piece of state, one supported way to do each thing.
- Internals fail the build when imported from outside.
- No hand-synced lists.
- Delete dead code and deprecated patterns; they are templates someone will copy.

### Model the domain

Encode rules in a structure, not scattered conditionals.
- State machine over booleans and phase flags; lookup table or discriminated union over branches spread across files.
- Organize modules around domain knowledge (`pricing`, `invoices`, `subscriptions`), not pipeline steps (`load`, `validate`, `transform`, `save`) that each repeat the same domain rules.
- An abstraction that removes no branches, duplicated rules, or invalid states is just indirection; three similar lines beat a premature abstraction.

## Types, state, and errors

### Make wrong state unrepresentable

- Sum types, not bags of optional fields. If a comment explains which field combinations are valid, split the type.
  - BAD: `{ done: boolean; doneAt?: Date }` admits `done: true` with no date.
  - GOOD: `{ kind: "open" } | { kind: "done"; at: Date }`
- Brand values that share a primitive but differ in meaning, so the compiler catches swaps. Create them once when parsing.
  - BAD: `cancelOrder(userId: string, orderId: string)` compiles with arguments swapped.
  - GOOD: `type UserId = string & { readonly __brand: "UserId" }`, same for `OrderId`; `cancelOrder(userId: UserId, orderId: OrderId)`
- Make switches over a sum type exhaustive; no catch-all `default` that hides new variants.
  - BAD: `default: return "Unknown"`; adding `{ kind: "archived" }` to `Status` compiles and archived items silently show "Unknown".
  - GOOD: `default: { const _exhaustive: never = s; }`; adding a variant fails to compile at every switch missing its case.
- No casts (`as`), `any`, `@ts-ignore`, or non-null assertions (`!`) to quiet the compiler; prove the fact or fix the model.
- Derive types from the schema that owns the shape (e.g., OpenAPI, DB migrations).
- Strengthen a type only where a loose type forces a runtime check or throw ("can't happen"). Then stop: types track what each caller must handle, not a perfect description of the data.
  - BAD: `first(items: Item[])` that throws on an empty list. GOOD: `first(items: [Item, ...Item[]])`; callers prove non-emptiness once, where they build the list.
  - Stop: `sum(nums: number[])` handles empty (returns 0), so a non-empty type there only burdens callers.

### Parse, don't validate

- Parse input into domain types at the edge, once. Inside, trust the types; no re-validation deep in call chains.
- Edges: CLI args, config, env vars, network payloads, external APIs, DB rows, files.
- Keep logic pure and the I/O shell thin. Don't leak wire or storage types through an interface.
- Exception: a destructive operation gets its own guard at the call, since an empty value there becomes a dangerous default (empty path = current directory).

### Precise signals

- Keep a narrow error condition narrow. A fallback for "tool not installed" widened to any failure hides the real error behind the fallback's.
- Absent is not empty. Say "none" explicitly where omission means "default" or "auto-discover".
- Detect state, not platform: check the fact you depend on, not env vars that guess the environment. Rule out look-alikes that give the same signal.

### Idempotent operations

For every state-changing command, job, or migration step: what if it runs twice, or the last run crashed at any point?
- If the end state depends on what was left behind, add a reconcile step.
- Namespace artifacts by owner instead of relying on end-of-run cleanup, which fails exactly when the run crashes.

### Separate before serializing

Concurrent writers to one file, key, branch, or object:
- First remove the sharing: each actor owns its target; merge at read time.
- Lock only when one shared target is a real invariant. Conventions are not concurrency control.

## Changing existing code

### Breakage lives where grep stops

- Before a risky change, find the one fact that makes it safe and prove it, instead of listing maybes.
- Look past symbol search: API JSON, DB columns, wire formats, other languages reading the same bytes, feature flags, teardown and async timing, pinned library versions.
- A clean rebase can still conflict: sweep trunk for new callers of what you moved or deleted.

### Judge reversibility by side effects

One-way vs two-way door depends on what the change does, not how easy the diff is to revert. A revert doesn't unsend emails; a flagged rollout stops being reversible once data is written in the new format.

### Parity keeps the bugs

In a behavior-preserving refactor or port, the old behavior is the spec, bugs included; fixing them on the way makes old and new incomparable. Note each bug and fix it separately after the structural change lands.

### Migrate callers, then delete

When a new internal API replaces an old one:
- Migrate every caller and delete the old API in the same change.
- No compatibility layer kept "for now" unless external consumers depend on it.
- Delete tests that only protected the old implementation.
- In a planned multi-step migration, converge on the target instead of writing throwaway compatibility code. Only if you declare upfront where breakage is allowed, keep checks running on touched areas, and verify everything at the end.

## Numbers

### Explain the number

Before trusting or reporting a speedup, regression, or eval result:
- Name what limits it ("why not twice as good?") from a profile or counters, not from reading code.
- Rule out that it measured something else: errors, cached or skipped work, code that never ran, an untuned baseline, noise.
- Keep run count and spread with the number.
- Never quote a ratio between scenarios that do different work.

### Cheapest fix first

For performance, try in order: don't do it, don't do it again, do less, do it later, do it when idle, do it concurrently, do it cheaper. Stop at the first that meets the target.

Related: proof of done in [`verify-with-proof`](../verify-with-proof/SKILL.md), tests in [`tdd`](../tdd/SKILL.md), root causes in [`diagnose-bug`](../diagnose-bug/SKILL.md).
