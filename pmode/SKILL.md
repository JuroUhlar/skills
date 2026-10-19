---
name: pmode
description: Load this first, before any other skill (including diagnose-bug and tdd) and before reading or searching code, whenever a conversation opens with a coding task, such as an issue, ticket, bug report, pasted error, failing or flaky test, a feature the user wants ("I want to add X"), or a request to build, add, change, fix, or refactor something. Skip for questions and trivial edits (typo, config value, dependency bump). Also when the user invokes pmode.
metadata:
  inspiration:
    - https://github.com/cursor/plugins/tree/main/pstack/skills/poteto-mode
---

# Poteto mode

Match the task to one playbook, then run the playbook's skills in order.

## Start

1. If the user linked an issue, ticket, or PR, read it first, including comments.
2. Pick one playbook. Say it in one line: "Playbook: bug fix, because the export throws on empty input."
3. Copy the playbook's steps into the todo list, verbatim.
4. Before each step, offer it and wait for the user's go-ahead, then run it with its skill. A skipped step stays in the list as `skip: <reason>`. Offer the playbook's next step instead of the one in a skill's "Next" section.

## Load each step's skill

Load the skill with the skill tool. Some skills are manual-only, so the tool refuses them; then read the linked `SKILL.md` and follow it.

## Playbooks

### Bug fix

Something is broken, throwing, failing, flaky, or slow.

1. [`diagnose-bug`](../diagnose-bug/SKILL.md) through its fix phase. Write the regression test per [`tdd`](../tdd/SKILL.md).
2. [`verify-with-proof`](../verify-with-proof/SKILL.md) that the user's symptom is gone on the running build.
3. [`code-review`](../code-review/SKILL.md) of your own diff.
4. [`commit-rules`](../commit-rules/SKILL.md).

### Feature

New or changed behavior that needs decisions: unclear requirements, a new interface, or more than one reasonable design.

1. [`grill-me`](../grill-me/SKILL.md) until the user confirms a shared understanding.
2. [`to-spec`](../to-spec/SKILL.md).
3. [`to-tickets`](../to-tickets/SKILL.md), only if the spec doesn't fit one session.
4. [`tdd`](../tdd/SKILL.md) at the spec's interfaces, one ticket at a time.
5. [`verify-with-proof`](../verify-with-proof/SKILL.md) against each behavior in the spec.
6. [`code-review`](../code-review/SKILL.md) of your own diff.
7. [`commit-rules`](../commit-rules/SKILL.md).

### Gardening

Improve the codebase itself rather than one behavior. Use the matching skill:

- [`improve-codebase-architecture`](../improve-codebase-architecture/SKILL.md)
- [`improve-codebase-docs`](../improve-codebase-docs/SKILL.md)
- [`improve-codebase-guardrails`](../improve-codebase-guardrails/SKILL.md)
- [`create-verification-skill`](../create-verification-skill/SKILL.md)

### No playbook fits

Name the closest playbook and what doesn't fit. Propose steps and confirm them with the user before starting.

## Throughout

- Design and refactor decisions: [`core-principles`](../core-principles/SKILL.md).
- Prose: [`write-well`](../write-well/SKILL.md). Code comments: [`code-comments`](../code-comments/SKILL.md).
- Long or multi-step work, or the user is away: [`orchestrator`](../orchestrator/SKILL.md).
- Open or update a PR only when the user asks: [`stage-pr`](../stage-pr/SKILL.md), [`visual-pr-description`](../visual-pr-description/SKILL.md), [`pr-comments`](../pr-comments/SKILL.md).
