---
name: audit-chat-history
description: Use when the user invokes audit-chat-history or asks to audit Claude Code chat history for failure points, skill effectiveness, or prompting style.
disable-model-invocation: true
---

# Audit chat history

Find where sessions go wrong, which skills help, and which are skipped or ignored. Reports quote private sessions, so write them to `~/.claude/audits/<date>/`, never into a repo.

## 1. Condense

```sh
python3 -I scripts/condense.py ~/.claude/audits/<date> --since <previous audit date>
```

- Writes one file per session, `stats.json`, and `batches/*.txt` (one per sub-agent). Sessions in this skills repo go to `meta`, scheduled and headless runs to `automated`.
- `skill_loads` splits loads into model-chosen and user-typed. A skill the user always types is one its description fails to trigger. `never_loaded` lists skills with no loads at all.
- `models` totals runs, turns, and tokens per model, for main sessions and per sub-agent type. `models.json` has one row per run with its job. Tokens include cached reads, so they show volume, not cost.
- Compare with the previous audit's `stats.json` and report the change in model-chosen loads per skill. That shows whether earlier fixes worked.

## 2. Review in sub-agents

One sub-agent per batch, all in parallel, each with [references/brief.md](references/brief.md) and its placeholders filled in. Give the `meta` batch an extra focus: what the user fought while writing skills, and decisions already made.

## 3. Verify before proposing

- Grep the current `SKILL.md` files for every rule a sub-agent says is missing. Sub-agents often propose rules that already exist.
- Tag each proposal:
  - **missing**: add text.
  - **ignored**: the rule exists, so change where it sits or what triggers it, not its wording.
  - **setup**: hooks, connectors, settings, duplicate installs.
- Before proposing a hard block (deny hook, permission rule), count both the incidents and the times the user wanted the blocked action. One incident against several legitimate uses is better fixed in the skill text.
- Check that each job ran on a fitting model. Read the user's agent definitions and routing rules first, since they set what "fitting" means. Look for:
  - Judgment work (review, diagnosis, design) on a cheap model.
  - Mechanical work (copying, bulk edits, polling, extraction) on the strongest model.
  - Sub-agents run as the generic type or as forks of the main model when a defined agent fit the job.
  - The largest token consumers, usually long main sessions.

  Tag a missing or wrong agent definition **setup**, and a routing rule that exists but wasn't followed **ignored**.
- Read the previous report's decisions and don't re-propose what the user rejected.

## 4. Report

Write `REPORT.md` next to the stats, then summarize in chat:

- Scope: sessions, dates, cost.
- Skill table: model loads, user loads, verdict. Split never-loaded skills into "fit a session but weren't loaded" and "no occasion".
- Failure patterns with counts and session refs.
- Models: tokens by model for main sessions and sub-agents, and mismatched runs with session refs.
- Proposed edits, tagged as above, with the evidence.
- Prompting style: keep and change.

Don't edit skills during the audit. Offer to apply the proposals.
