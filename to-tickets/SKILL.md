---
name: to-tickets
description: Use when the user invokes to-tickets or asks to break a spec or plan into tickets.
disable-model-invocation: true
metadata:
  inspiration: https://github.com/mattpocock/skills/blob/main/skills/engineering/to-tickets/SKILL.md
---

# To tickets

Break a spec, plan, or this conversation into **tickets**. Unless user specifically asks to to build the project in horizontal layers, build in vertical slices - Each ticket is a tracer bullet: a narrow, complete path through every layer, demoable on its own, sized for one fresh context window.

Do not invent product decisions. If alignment is still open, stop and use [`grill-me`](../grill-me/SKILL.md). If the whole change fits one session, do not split.

Each ticket delivers behavior at the spec's interfaces.

## Vertical, not layers

A ticket ships one thin feature path (data, API, UI, tests). Not one layer. "What can I demo when this is done?" must have a behavior answer. No answer means the ticket is horizontal. Merge it.

Prefactor first when it makes the change easy.

**Wide refactor exception.** One mechanical change with a huge blast radius (rename a column, retype a shared symbol) cannot land green as a tracer bullet. Sequence expand (new form beside old), migrate (batches that stay green), contract (delete the old form).

## Blocking edges

Each ticket lists the tickets that must finish before it can start. A ticket with no blockers is on the frontier and can start now.

## Quiz, then write

Present a numbered list. For each ticket: title, blocked by, what it delivers.

Ask: too coarse or too fine? Are the edges real? Merge or split?

The usual defect is too many tickets. Iterate until the user approves. Then write the tickets.

## Ticket

Use the project's nouns. No file paths. A prototype snippet stays only when it encodes a decision more precisely than prose.

**What to build.** End-to-end behavior, from the user's side. Not a layer list.

**Blocked by.** Other tickets, or none.

**Acceptance criteria.** Each one fails at the commit the implementer starts from. If it already passes, or only another ticket can satisfy it, it is the wrong criterion.

## BAD vs GOOD

BAD (horizontal):
`Ticket 1: schema. Ticket 2: API. Ticket 3: UI.`

GOOD (vertical):
`Ticket 1: signed-in user sees { id, available } for one account. Ticket 2: hidden accounts are omitted.`
