---
name: handoff
description: Write a handoff summary of the current conversation so a fresh session can continue the work. Use when the user invokes handoff or asks for a handoff summary.
disable-model-invocation: true
---

# Handoff

Write a summary a fresh session can start from with no other context. Save it to `HANDOFF.md` in the scratchpad (or the working directory if there is none), print its absolute path, and print the summary so the user can paste it.

## Contents

- **Goal**: what the user wants, in their words where it matters.
- **State**: done, in progress, not started. Branch, uncommitted changes, open PRs.
- **Decisions**: what was decided and why, including options the user rejected. A fresh session re-proposes rejected options unless told.
- **Evidence**: commands, outputs, and file paths that settled questions. Quote error messages exactly.
- **Dead ends**: what was tried and failed, so it isn't retried.
- **Next step**: the single next action, concrete enough to start without asking.
- **Open questions**: what still needs the user.

## Rules

- Point to files with `path:line` instead of pasting their contents; the next session can read them.
- Include user corrections and preferences stated in this conversation; they are lost otherwise.
- Don't do more work while writing the handoff. Every extra turn re-reads the whole context.
