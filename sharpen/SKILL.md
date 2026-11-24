---
name: sharpen
description: Use when the user invokes sharpen, or asks to make a task or prompt deeper, not bigger, and rewrite it before running the task.
metadata:
  inspiration: https://github.com/cursor/plugins/tree/main/pstack/skills/sharpen
---

# Sharpen

Make the user's task deeper, not bigger, then rewrite their prompt. Do not execute the task itself.

Before rewriting, answer four things:

1. **What a top practitioner would do** here that the user didn't ask for.
2. **The rawest source material** they would start from instead of digested summaries.
3. **Specific methods and tools** they would use.
4. **An external check** that would show the result is right, other than the agent or the user.

Then rewrite the prompt to ask for exactly that, ready to hand to [`pmode`](../pmode/SKILL.md).

- Have the rewritten prompt tell the agent to prototype any choice an experiment can settle and recommend an option from what it observed.
- Leave product or preference choices that no experiment can settle for the user to decide.
- If the user lacks the domain vocabulary to state the goal, pair with [`reframe`](../reframe/SKILL.md) first.
