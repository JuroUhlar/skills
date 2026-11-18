---
name: audit-chat-history
description: Use when the user invokes audit-chat-history or asks to audit Claude Code chat history for failure points, skill effectiveness, or prompting style.
disable-model-invocation: true
---

# Audit chat history

Find where sessions go wrong, which skills help, and which are skipped or ignored. Reports quote private sessions, so write them to `~/.claude/audits/<date>/`, never into a repo.

## What to look for

Each item is a section of `REPORT.md`, and a field in the [brief's per-session template](references/brief.md#per-session).

- **Skills**: loaded by the model or typed by the user, fit but not loaded, loaded but a rule ignored.
- **Corrections**: user corrections and interrupts, tagged by cause.
- **Setup failures**: a tool or connector that errors on most calls (auth, scope, 403, timeout), a hook that blocks or never fires, the same failing call retried, a workaround the agent rediscovers in several sessions.
- **Permission denials**: actions the user keeps rejecting.
- **Model fit**: judgment work on a cheap model, mechanical work on the strongest one, a generic sub-agent where a defined agent fit.
- **Prompting**: what the opening prompt lacked that the user supplied later.

## 1. Condense

```sh
python3 -I scripts/condense.py ~/.claude/audits/<date>
```

- Writes one file per session, `stats.json`, and `batches/*.txt` (one per sub-agent). Sessions in this skills repo go to `meta`, scheduled and headless runs to `automated`.
- Reads only sessions since the previous audit (the newest earlier folder in `~/.claude/audits/`). `change` in `stats.json` holds the delta in model-chosen skill loads and tool failures since then, which shows whether earlier fixes worked.
- `skill_loads` splits loads into model-chosen and user-typed. A skill the user always types is one its description fails to trigger. `never_loaded` lists skills with no loads at all.
- `models` totals runs, turns, and tokens per model, for main sessions and per sub-agent type. `models.json` has one row per run with its job. Tokens include cached reads, so they show volume, not cost.
- `tool_errors` lists tools, MCP servers, and Bash programs with real failures, worst first. `classes` splits errors:
  - `denied`: the user rejected the call.
  - `hook`: a hook blocked it.
  - `harness`: the agent misused a tool, such as editing an unread file.
  - `external`: auth, scope, 403, timeout, connection.
  - `exit`: non-zero exit, mostly harmless (`grep` with no match), so counted but not sampled.

  `loops` counts runs of the same failing call. `sample` holds the first real error and the full tool name, which identifies MCP servers listed by UUID.

## 2. Review in sub-agents

One sub-agent per batch, all in parallel, each with [references/brief.md](references/brief.md) and its placeholders filled in. Give the `meta` batch an extra focus: what the user fought while writing skills, and decisions already made.

## 3. Verify before proposing

- Read the previous report's Decisions and don't re-propose what the user rejected. Check that what they removed or fixed is gone from `tool_errors`.
- Grep the current `SKILL.md` files for every rule a sub-agent says is missing. Sub-agents often propose rules that already exist.
- Read `tool_errors` yourself. Sub-agents see one batch, so they miss a connector failing across batches.
- Read the user's agent definitions and routing rules before totalling the sub-agents' model mismatches, since they set what "fitting" means.
- Tag each proposal:
  - **missing**: add text.
  - **ignored**: the rule exists, so change where it sits or what triggers it, not its wording.
  - **setup**: hooks, connectors (auth, scope, install, or remove), agent definitions, settings, duplicate installs.
- Before proposing a hard block (deny hook, permission rule), count both the incidents and the times the user wanted the blocked action. One incident against several legitimate uses is better fixed in the skill text.

## 4. Report

Write `REPORT.md` next to the stats:

- Scope: sessions, dates, cost, and the `change` since the previous audit.
- One section per [What to look for](#what-to-look-for) item, with counts and session refs. The skills section is a table of model loads, user loads, and verdict, with never-loaded skills split into "fit a session but weren't loaded" and "no occasion".
- Proposed edits, tagged as above, with the evidence.

Summarize in chat and offer to apply the proposals. Don't edit skills during the audit. Once the user answers, append `## Decisions`: what was applied, rejected (with the reason), kept on purpose, and removed. The next audit reads it.
