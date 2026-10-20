---
name: commit-rules
description: Use when committing, writing commit messages, splitting work into commits, pushing, or resolving merge or rebase conflicts.
metadata:
  inspiration:
    - https://github.com/cursor/plugins/tree/main/pstack/skills/principle-sequence-verifiable-units
    - https://github.com/obra/superpowers/tree/main/skills/finishing-a-development-branch
    - https://github.com/mattpocock/skills/blob/main/docs/engineering/resolving-merge-conflicts.md
---

# Commit rules

## Ask before auto-committing

At the first commit point in a session, ask once: "Commit automatically for the rest of this session?" Remember the answer. Without an answer, don't commit, leave local changes to be inspected by the user.

## Branch naming conventions

* If the work has a ticket ID, use it as prefix.
* If not, prefix with feat/fix/docs/refactor etc. 
* Use meaningful names that describe the work
* GOOD: `INTER-1234-feat-add-login-flow`
* BAD: `claude/naughty-beaver-hf7402` (never use harness prefixes or random names)

## Install the repo's commit hooks

Before the first commit, look for hook config (`.husky/`, `lefthook.yml`, `.pre-commit-config.yaml`). If hooks are configured but not active (check `git config core.hooksPath` and `.git/hooks/`), ask the user before installing them.

## Message conventions

- Match the repo's rules first: commitlint config (`commitlint.config.*`, `.commitlintrc*`) if present, else `git log --format='%s%n%b' -20`.
- If the repo has no clear style:
  - Subject: imperative, sentence case, ends with a period, under ~72 characters.
  - Body: optional. One sentence of why, or bullets for multiple changes.
- Follow [`write-well`](../write-well/SKILL.md).

```
BAD:  feat(auth): updated token refresh logic
GOOD: Refresh tokens before expiry instead of on 401.
```

## Keep the PR description current

After pushing to a branch with an open PR, check whether the description still matches the commits. If not, update it.

## Sequence commits as an argument

Order commits so a reviewer can replay them and watch the work prove itself.

- Failing test, then the fix (see [`tdd`](../tdd/SKILL.md#the-loop)).
- Subtraction before reshape, refactor before feature (see [Pre-factor](../core-principles/SKILL.md#pre-factor)).
- Baseline capture before the change it measures.
- Each commit builds and passes checks on its own, except a deliberately failing test that the next commit fixes.

## Resolve conflicts by intent

A conflict is two intents, not two blocks of text.

1. Before touching a hunk, trace each side to its commit, PR, or issue. Quote what each side wanted.
2. Keep both behaviors where they are compatible.
3. Where they aren't, pick the side matching the merge's goal and say what was dropped and why.
4. Add nothing that was on neither side.
5. Run the repo's checks before the merge commit or `rebase --continue`.

Don't resolve with `--ours`/`--theirs` or by deleting the less familiar block.

## A refusal is information

When git or a hook refuses, find out why. Never route around it (`--force`, `-D`, `--no-verify`, `reset --hard`) unless the user asks for that specific action.

- Rejected push: the remote moved. Fetch and look at what landed.
- Refused worktree or branch removal: files or commits exist nowhere else. Show the user what's at stake.
- Failing pre-commit hook: fix the cause, or ask. Fix a wrong hook in a separate commit.
- Untracked files blocking checkout or merge: someone's work. Ask before moving or deleting.
