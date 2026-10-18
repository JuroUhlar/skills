---
name: write-agent-skill
description: Use when writing, editing, or reviewing agent skills.
---

- optimize for semantic density, brevity, and readability.
- must be generic (not rely on specific harness, model, codebase structure, etc.)
- prefer bullet points over paragraphs of 3+ lines.
- give each substantial linkable unit (principle, rule, step) its own sub heading so it can be linked to directly.
- use BAD vs GOOD examples when useful to illustrate, but don't overdo it.
- `description` is only to trigger the skill, not summarize it, not describe it.
- only keep non-obvious stuff that a current mid-sized SOTA model (Opus 5.5, Sol 6) wouldn't already know or do by default from training data
- folder name matches `name` in frontmatter.
- reference other skills with relative links (`[tdd](../tdd/SKILL.md)`), and make sure they exist. When you mean one section, link to it (`../tdd/SKILL.md#the-loop`).
- link to another skill instead of restating it; repeat only the line needed at the decision point.
- stay consistent with sibling skills: same file and concept names, follow [`write-well`](../write-well/SKILL.md). Grep other skills for terms you introduce.
- `metadata`
  - use `metadata.source` (URL to skill) if skill is exact copy of open-source skill
  - use `metadata.inspiration` (URLs) if skill is inspired by open-source skill or skills
    - max 3 URLs, the most influential ones (frontmatter loads with the skill and costs context)
  - leave metadata empty for custom written skills
