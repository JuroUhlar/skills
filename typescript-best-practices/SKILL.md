---
name: typescript-best-practices
description: Use when writing, editing, or reviewing TypeScript (.ts, .tsx) code.
metadata:
  inspiration:
    - https://github.com/cursor/plugins/tree/main/pstack/skills/typescript-best-practices
---

# TypeScript best practices

## Make wrong state unrepresentable

- Discriminated unions, not bags of optional fields. If a comment explains which field combinations are valid, split the type.
  - BAD: `{ done: boolean; doneAt?: Date }` admits `done: true` with no date.
  - GOOD: `{ kind: "open" } | { kind: "done"; at: Date }`
- Brand values that share a primitive but differ in meaning, so swaps fail to compile.
  - BAD: `cancelOrder(userId: string, orderId: string)` compiles with arguments swapped.
  - GOOD: `type UserId = string & { readonly __brand: "UserId" }`, same for `OrderId`.
- Switches over a union are exhaustive; no catch-all `default` that hides new variants.
  - BAD: `default: return "Unknown"`. A new `{ kind: "archived" }` compiles and silently shows "Unknown".
  - GOOD: `default: { const _exhaustive: never = s; return _exhaustive }` (use `void _exhaustive` in a statement switch). A new variant fails to compile at every switch missing its case.
- No `as`, `any`, `@ts-ignore`, or non-null `!` to quiet the compiler. Prove the fact or fix the type.
- Derive types from the schema that owns the shape (OpenAPI, DB migrations, runtime schema) instead of hand-writing a copy.

## Parse at the edge

- Parse input into domain types once, where it enters: CLI args, config, env vars, network payloads, external APIs, DB rows, files. Inside, trust the types; no re-validation deep in call chains.
- Don't leak wire or storage types (raw API response, DB row) through an interface.

## Narrowing

- External data (`JSON.parse`, `fetch`, `postMessage`, env, files, DB rows) is `unknown`, never `any`.
- Prefer, in order: discriminant `switch`/`if` > `in` > `typeof`/`instanceof` > type guard > `as` after validation.
- A type guard must check everything its `x is T` claims. A lying guard is worse than `as`: the bug hides behind a name that says it's safe.
  - BAD: `isUser(d): d is User { return typeof d === "object" && d !== null && "id" in d }` while `User` also has `name`.
- A brand comes from a verifying guard (`input is UserId`) or parser, never from `as UserId`.

## Schemas before hand-written guards

- Before writing a property-by-property guard, use the repo's runtime schema library (zod, valibot, etc.) and infer the type: `type User = z.infer<typeof UserSchema>`. One schema, no drifting duplicate interface.
- When the type comes first, annotate the schema with it: `const UserSchema: z.ZodType<User> = z.object({...})`. Dropping a field then fails to compile.
- `safeParse` when failure is an expected branch, `parse` when it's a bug.
- Don't add a schema dependency for one guard.

## Constructing types

Build the shape so the illegal value can't exist, instead of checking at runtime:
- Non-empty: `[T, ...T[]]`. Narrow a plain `T[]` once with `(a: T[]): a is [T, ...T[]] => a.length > 0`.
- Even length: `[T, T][]`.
- Range: `{ start: Date; durationMs: number }`, not `{ start; end } // start <= end`. Derive `end` with a helper.

## Small tools

- `satisfies` over `as` for literals: `{ theme: "dark" } satisfies Config` keeps `theme` as `"dark"` and still checks the shape.
- `Pick`, `Omit`, `Parameters`, `ReturnType`, `Awaited`, `typeof` before declaring a new interface that copies an existing shape.
- Object args when a function takes 2+ params of the same type, so swapped arguments don't compile. Skip on hot paths (per-frame render, tokenizers, parsers) where the allocation matters.
  - BAD: `select(10, 1, 10, 5)`. GOOD: `select({ startLine: 10, startCol: 1, endLine: 10, endCol: 5 })`.
