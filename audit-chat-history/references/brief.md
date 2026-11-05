# Sub-agent brief: audit one batch of Claude Code sessions

Goal: find where sessions went wrong, which skills helped, which were skipped or ignored, and how the user's prompts could be clearer. The skills live in `{SKILLS_DIR}`; read a skill's `SKILL.md` before judging whether it had its intended effect.

## Input

Each file in `{BATCH_FILE}` is one condensed session. Header: project | session id | start | title | cost | user messages | interrupts.

- `USER:` the user's message. `USER: [INTERRUPTED]` means the user stopped the agent.
- `ASSISTANT:` agent text. `>> SKILL x` a skill load. `>> AGENT` a sub-agent. `>> Bash:` and other tool calls. `TOOL_ERR` a failed tool call.
- Tool output is stripped. When the cause of a correction is unclear, grep the raw transcript (`ls ~/.claude/projects/*/<session-id>.jsonl`). Don't print whole raw files; they're large.
- Redact tokens and passwords (`<REDACTED>`) in anything you write.

## Per session

Append to `{FINDINGS_FILE}` after each session, not at the end, so findings survive if you run out of context:

```
### <file name>
- task: bug fix | feature | PR review | PR comments | docs | ops | research | skill authoring | chat
- skills loaded: name (model or user)
- skills that fit but weren't loaded: name, why it fit
- skill loaded but rule not followed: name, quoted rule, what happened
- user corrections: short verbatim quote [wrong-scope | didnt-verify | ignored-instruction | ignored-skill-rule | over-engineered | bad-prose | assumed | git/PR | tooling | slow/expensive | other]
- prompt notes: what the opening prompt lacked that the user supplied later; patterns worth keeping
```

Skip empty fields. Trivial sessions get one line. For the "automated" batch (scheduled tasks, headless runs), one line per run, then a section on reliability, recurring failures, and cost.

## Synthesis

End the file with `## Batch synthesis`: recurring failure patterns with session refs and counts, a per-skill verdict table, prompting patterns, and proposed SKILL.md edits that quote the rule that failed. Reply with only the synthesis, under 600 words.
