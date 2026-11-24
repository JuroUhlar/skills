---
name: reframe
description: Use when the user invokes reframe, lacks the technical vocabulary for what they want to build, or asks to map a rough description to expert terms and rewrite it as a prompt without executing the task.
metadata:
  inspiration: https://github.com/cursor/plugins/tree/main/pstack/skills/reframe
---

# Reframe

Teach the user the expert words for what they want to build, then rewrite their prompt with them. Do not execute the task itself.

Start from the user's own files, code, and description, not a summary.

If the description could name more than one problem, list the 2 or 3 candidates first. Give each the term that names it and the sign that tells it apart from the others. Pick the likeliest one, say why, and continue with it.

1. **8 to 12 terms**, ranked by how much each would change what gets built. For each:
   - the term and its meaning in one plain sentence
   - the part of the user's description or code it names
   - one real project, paper, or system that uses it that way, with a link
   - what it lets the user ask an agent for
2. **2 or 3 neighboring fields** that solved the same shape of problem under other names. For each: what carries over, where the analogy breaks, and which terms come back.
3. **What's missing:** what the user didn't mention but should care about.
4. **Rewritten prompt:** the user's description rewritten with the new terms, ready to hand to [`pmode`](../pmode/SKILL.md) or refine with [`sharpen`](../sharpen/SKILL.md).

Open every link and confirm it uses the term that way. Cut any citation you can't confirm. No padding.
