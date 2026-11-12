# Subagents

Role definitions for subagents, shared by Claude Code and Codex. [`setup/install.sh`](../setup/install.sh) turns each file into the format each tool reads and picks the model from `tier`.

| Role | Tier | Job |
|---|---|---|
| [`thinker`](thinker.md) | strong | Review, diagnosis, plans, deciding how to address review comments |
| [`fixer`](fixer.md) | mid | Changes a brief already specifies, staging PRs, CI babysitting |
| [`clerk`](clerk.md) | cheap | Mechanical text and data work |
| [`Explore`](explore.md) | cheap | Read-only code search. Named `Explore` so it replaces Claude Code's built-in, which runs on the main model. |

Frontmatter keys: `name`, `description`, `tier` (`strong`, `mid`, `cheap`), optional `readonly: true` (Claude gets a read-only tool list) and `codex_name` (name to use in Codex). The body is the agent's instructions.

Edit the files here, then rerun `setup/install.sh`. Don't edit the generated copies in `~/.claude/agents` or `~/.codex/agents`.
