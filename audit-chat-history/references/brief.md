# Sub-agent brief: audit one batch of Claude Code sessions

Goal: find where sessions went wrong, which skills helped, which were skipped or ignored, and how the user's prompts could be clearer. The skills live in `{SKILLS_DIR}`; read a skill's `SKILL.md` before judging whether it had its intended effect.

## Input

Each file in `{BATCH_FILE}` is one condensed session. Header: project | session id | start | title | model | turns | cost | user messages | interrupts.

- `USER:` the user's message. `USER: [INTERRUPTED]` means the user stopped the agent.
- `ASSISTANT:` agent text. `>> SKILL x` a skill load. `>> AGENT` a sub-agent call; `SUBAGENT` lines at the end list each run's agent type, model, size, and job. `>> Bash:` and other tool calls. `TOOL_ERR <tool> [class]` a failed call, with `(repeated N times)` when the agent retried it unchanged; classes are `denied` (user rejected), `hook`, `harness` (tool misuse), `external` (auth, 403, timeout), `exit` (non-zero exit, often harmless), `other`.
- Tool output is stripped. When the cause of a correction is unclear, grep the raw transcript (`ls ~/.claude/projects/*/<session-id>.jsonl`). Don't print whole raw files; they're large.
- Redact tokens and passwords (`<REDACTED>`) in anything you write.

## Per session

Append to `{FINDINGS_FILE}` after each session, not at the end, so findings survive if you run out of context:

```
### <file name>
- task: bug fix | feature | PR review | PR comments | docs | ops | research | skill authoring | chat
- skills loaded: name (model or user)
- model mismatches: run, model, job, and why it's mismatched: judgment work (review, diagnosis, design) on a cheap model; mechanical work (copying, bulk edits, polling, extraction) on the strongest; a generic sub-agent or a fork of the main model where a defined agent fit; a long session that should have been split or delegated
- skills that fit but weren't loaded: name, why it fit
- skill loaded but rule not followed: name, quoted rule, what happened
- setup failures: tool, error, and whether the environment (connector auth, missing install, hook) or the agent (wrong arguments, retrying the same failing call) caused it; a workaround the agent found
- permission denials: what the user rejected and what the agent did next
- user corrections: short verbatim quote [wrong-scope | didnt-verify | ignored-instruction | ignored-skill-rule | over-engineered | bad-prose | assumed | git/PR | tooling | slow/expensive | other]
- prompt notes: what the opening prompt lacked that the user supplied later; patterns worth keeping
```

Skip empty fields. Trivial sessions get one line. For the "automated" batch (scheduled tasks, headless runs), one line per run, then a section on reliability, recurring failures, and cost.

## Synthesis

End the file with `## Batch synthesis`: recurring failure patterns, failing tools and connectors with session refs and counts, a per-skill verdict table, prompting patterns, and proposed SKILL.md edits that quote the rule that failed. Reply with only the synthesis, under 600 words.
