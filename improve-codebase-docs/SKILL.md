---
name: improve-codebase-docs
description: Use when asked to improve, audit, or reorganize a repo's docs, agent instruction files, or glossary, or when deciding whether a design or product decision is worth recording.
metadata:
  inspiration:
    - https://github.com/mattpocock/skills/blob/main/skills/engineering/domain-modeling/ADR-FORMAT.md
    - https://github.com/mattpocock/skills/tree/main/skills/engineering/retro
---

# Improve codebase docs

## File conventions

* `README.md` - top-level overview of the project from user's perspective
* `CONTRIBUTING.md` - info relevant to developers and contributors to the project, including design constraints and product decisions
* `AGENTS.md` - very brief signpost of where to find other resources
* `GLOSSARY.md` - shared vocabulary for the project, should streamline human and agent communication
* `STANDARDS.md` - repo-specific quality rules and conventions for review agent.
* `VERIFICATION.md` - how to drive the project to actually verify behavior end-to-end with proof instead inferring from code.

## Document only what can't be looked up

A doc that repeats the environment (file trees, dependency lists, script names, API signatures) is a cache: it goes stale silently. Keep intent, constraints, and the "why"; point to the source for the rest.

## Record the "no"s

Record a decision under design constraints or product decisions in `CONTRIBUTING.md` only when all three hold:
- **Hard to reverse**: changing course later costs real effort.
- **Surprising**: a reader would ask "why on earth this way?"
- **A real trade-off**: there were genuine alternatives.

Rejected alternatives are the most valuable part; they stop the next person (or agent) from re-proposing them. One or two sentences per entry: the decision, why, what was rejected.

## Keep `AGENTS.md` small

It loads into every agent's context. Keep only pointers to other files and rules that apply to every task. Move review-time rules to `STANDARDS.md` and mechanical rules to checks (see [Encode lessons in structure](../improve-codebase-guardrails/SKILL.md#encode-lessons-in-structure)). Delete lines that don't change behavior.

## Audit

- Every claim matches the code; fix or delete stale ones.
- Each fact lives in one file; others link to it.
- Glossary terms match names in code; one name per concept.
