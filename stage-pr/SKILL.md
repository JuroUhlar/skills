---
name: stage-pr
description: >-
  Open a draft pull request for current work or branch. Iterate until CI is green and Copilot review approves.
  Use when the user asks to make a stage a PR/make PR reviewable, ready for review.
---

# Make a PR reviewable

Open a PR in a draft state. Keep iterating until CI is green and the requested Copilot review approves. Leave the PR in draft.

## Related skills 

* [`visual-pr-description`](../visual-pr-description/SKILL.md)
* [`pr-comments`](../pr-comments/SKILL.md)

## Loop

Refresh state every pass with `gh pr view` and `gh pr checks` (`--watch`). 
For every failure or review finding 

* Read failing CI log (if exists)
* Fix the failure
* Verify locally (if cheap)
* Push 
* CI starts automatically but you must re-request Copilot review

Stop when both are true on the current head:

- CI is green.
- The latest requested Copilot review approves that head.

When done, report the PR URL after a fresh read shows green CI and a Copilot approval of the current head.

## Limits

- Do not mark the draft ready, merge, enable auto-merge, force-push, or edit CI workflows to force a green result.
- Stop and report when a failure is outside this PR, or when a comment needs a product call.

