---
name: to-spec
description: Use when the user invokes to-spec or asks to write a spec from the current conversation.
disable-model-invocation: true
metadata:
  inspiration: https://github.com/mattpocock/skills/blob/main/skills/engineering/to-spec/SKILL.md
---

# To spec

Write down the shared understanding as a **spec**: the client-exposed interface and the expected behavior. Not a step-by-step implementation plan.

Do not interview. Synthesize only what this conversation and the codebase already settled. If a heading would need a new decision, leave it out. If alignment is still open, stop and use [`grill-me`](../grill-me/SKILL.md).

## Interface first

Sketch the public interfaces you will test at before the spec. Prefer existing interfaces. Prefer the highest interface. Ideal count is one.

Confirm the interfaces with the user, then write.

## Spec

Use the project's nouns. Invent nothing to fill a heading.

**Problem.** From the user's side.

**Interface.** What a caller can do: APIs, types, events, CLI, UI contracts. Not how the module is built.

**Behavior.** Numbered observable outcomes:

```
1. As a <actor>, I want <capability>, so that <reason>
```

Cover the real branches (success, failure, empty, auth, idempotency). Drop stories nobody asked for.

**Decisions.** Only constraints that fix the interface or behavior: invariants, error shape, compatibility. No file paths. No build sequence. Keep a prototype snippet only when it encodes a decision more precisely than prose (schema, type shape, state machine).

**Out of scope.** The things you refused. An empty list is a defect.

## BAD vs GOOD

BAD (implementation plan):
`Add src/billing/Balance.ts, then a React query hook, then wire the nav.`

GOOD (interface + behavior):
`GET /accounts` returns `{ id, available }` for the signed-in user. Hidden accounts are omitted.
