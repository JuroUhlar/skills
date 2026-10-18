---
name: grill-me
description: Relentless interview to sharpen a plan, decision, or design until every branch is resolved. Use when the user invokes grill-me or asks to be grilled.
disable-model-invocation: true
metadata:
  source: https://github.com/mattpocock/skills/tree/main/skills/productivity/grilling
---

# Grill me

Interview the user until you share an understanding. Map the work as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask now without guessing. Ask the whole frontier in one round. Number each question and give your recommended answer. Then wait.

```
**Q1 — <title>:** <body, including choices if useful>

Recommended: <your answer>

**Q2 — <title>:** <body>

Recommended: <your answer>
```

Word each question so "yes" accepts your recommended answer.

Each round reshapes the tree. Settled decisions push the frontier out. A question that depends on another still open in this round belongs to a later round.

Look up facts yourself (code, docs, tools). Do not ask the user for anything you can find. Decisions stay with the user. Wait for those.

The session is done when the frontier is empty: every branch visited, nothing silently assumed. Do not act on the plan until the user confirms you share an understanding.
