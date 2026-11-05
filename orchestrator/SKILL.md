---
name: orchestrator
description: Use when running long or multi-step work, delegating to subagents or parallel agents, working autonomously while the user is away ("I'm going to bed", "keep working on your own"), or resuming after context compaction.
metadata:
  inspiration:
    - https://github.com/cursor/plugins/tree/main/pstack
    - https://github.com/obra/superpowers
    - https://github.com/mattpocock/skills
---

# Orchestrator

The main thread decides and integrates. Delegates and scripts do the bulk work.

## Context

### Guard the context window

- Bulk reads, broad searches, and verbose output (logs, test runs, builds) go to subagents.
- The main thread keeps conclusions, not dumps.

### Continue, don't compact

Prefer continuing the session over compacting. A summary drops the details you'll need.

### Trust the record after compaction

- After compaction, trust git log, ledgers, and files over your memory of them.
- Re-read the original brief before continuing.

### Mark assumptions

Notes you write get read later as facts. Label guesses: `Assumption: ...`.

## Decisions

### Never block on the human

- Reversible work: proceed, then present the result.
- Irreversible, security-relevant, or externally visible actions (push, deploy, send, delete): confirm first.

### Ask before the user leaves

When the user says they're leaving, ask now for everything only they can give: repro environment (browser, OS, device), credentials, product decisions. Then work.

### Rulings, not stalls

Decide ambiguities yourself and log each one so the user can audit:

```
Ruling: <what>. Why: <why>. Cost if wrong: <cost>.
```

## Delegation

### Check before relaying

A delegate's claim is a lead, not a finding. Check it before passing it on, per [`verify-with-proof`](../verify-with-proof/SKILL.md#delegation).

### Brief with links

Pass delegates file paths, URLs, and commit SHAs, not your summaries of them.

### One skill per delegate

Give each delegate:

- the recipe (steps or skill to follow),
- the check that proves done,
- do-not-touch fences (files, APIs, behavior out of scope).

### Scope narrowly

Widen scope only for a named risk. "Check everything" gets taken literally and burns time.

### Cheapen mechanics, never judgment

Send only deterministic or cheaply verifiable work to cheaper models or scripts. Design, review, and diagnosis stay on the strong model.

### Build the lever

For repetitive edits, write a script or codemod instead of hand-editing or fanning out N agents.

## Loops

### A retry must change something

Change the context, capability, or task size. Rerunning the same prompt is not a retry.

### Narrow and cap fix loops

Each pass must shrink the failure set. Set a pass limit up front; when you hit it, stop and report.

## Parallel work

### Fresh base

Fetch the default branch and base each worktree on the remote copy. A stale local `main` makes every delegate's work need a rebase.

### Worktrees delay collisions

Separate worktrees still clash on shared names, migrations, ports, and generated files at merge time. Rename shared things up front or run the work in sequence.
