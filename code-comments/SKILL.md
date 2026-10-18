---
name: code-comments
description: Use when writing, editing, or reviewing comments in code, including doc comments and lint suppressions.
metadata:
  inspiration:
    - https://github.com/cursor/plugins/blob/main/pstack/agents/comment-sicko.md
    - https://github.com/cursor/plugins/tree/main/pstack/skills/no-comments
---

# Code comments

Default to no comment. Write in the style of [`write-well`](../write-well/SKILL.md).

## Reshape before explaining

A comment explaining a surprise in our own code is a smell. Make the code obvious instead: rename, extract a function, add a type, or remove the workaround (see [Redesign from first principles](../core-principles/SKILL.md#redesign-from-first-principles)). Comment only when the surprise comes from something we can't change.

## Keep-list

Only these survive:
- License or legal headers.
- Behavior forced by something we can't change (vendor, platform, protocol, library bug), with a link to the issue or docs.
- A non-obvious requirement or design decision: one line of why, with a link to its source (spec, issue, `CONTRIBUTING.md` section).
- Doc comments that define a public API contract: inputs, outputs, errors, invariants. Not a restatement of the signature.
- A module overview, only when the module's purpose isn't clear from its name and location.

## Never

- Narration of what the next line does.
- Change history: "now uses X", "changed from Y", "new:". That belongs in the commit message.
- References to the task, PR, or conversation; the comment must make sense to a reader who never saw them.
- Commented-out code.
- `TODO` without an issue link.

## Lint and type suppressions

`eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `# noqa`, and similar:
- If the rule catches real bugs, fix the code instead.
- Otherwise scope the suppression to the line and state the reason on it.

## Reviewing

Each comment either matches the keep-list or gets deleted. For "do not remove" or "IMPORTANT" comments, check the claim against the code before keeping it; a constraint that matters is better enforced by a type, test, or lint (see [Encode lessons in structure](../improve-codebase-guardrails/SKILL.md#encode-lessons-in-structure)).
