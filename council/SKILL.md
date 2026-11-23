---
name: council
description: Use when the user invokes council.
disable-model-invocation: true
---

# Council

Get independent second opinions from the other frontier models on a review, a design, a decision, or a sanity check.

## Members

Default council: the models below whose family (Claude, GPT, Gemini, Grok) isn't running this session. Hard mode, when the user says "hard" or "hardmode": use the hard-mode column and add Grok.

| Family | Default | Hard mode | Provider instance |
|---|---|---|---|
| Claude | Opus `claude-opus-5-5` | Fable `claude-fable-5-2` | `claudeAgent` (Claude subscription) |
| GPT | Sol `gpt-6.2-sol` | Astra `gpt-6.2-astra` | `acpRegistry_github_copilot` (GitHub Copilot) |
| Gemini | Neon `gemini-4-neon` | Neon `gemini-4-neon` | `acpRegistry_github_copilot` |
| Grok | none | newest Grok in the model list (`grok-4.7` now) | `acpRegistry_github_copilot` |

- Never use the `codex` provider, even though it also serves Sol.
- Launch with the harness's cross-provider delegation (T3 Code: `delegate_task` with `target.providerInstanceId` and `target.model`). If a model id is missing, check the harness's model list for the newest model of that family and say which one you used.
- A member that can't start: say so and report the other one. Don't swap in another model unasked.

## Brief

Write one brief and send the same text to both members, in parallel.

- The question, as the user asked it.
- The material by reference: file paths, the diff command (`git diff main...HEAD`), PR URL, or the pasted text.
- Constraints the user stated and the goal behind the question.
- Not your own conclusion or leanings. A member given your answer tends to confirm it.
- Read-only: no edits, commits, or comments.
- Ask for: a verdict in one line, the top issues with evidence (`path:line`, command output), what they'd do differently, and what they couldn't check.

## Report

- **Verdicts:** one line per member, named.
- **Agreed:** points both raise independently. Strongest signal.
- **Disputed:** where they differ, both positions and your call with the reason.
- **Unique:** points only one raised. Check each before stating it as fact; otherwise label it unverified.
- Your own view last, marked as yours.
- Offer to fork a member's thread if the user wants to keep discussing its review (T3 Code: `t3_thread_transfer` with `action: "fork"` on the child thread). The fork is a top-level thread with the member's context; its replies don't come back here.
