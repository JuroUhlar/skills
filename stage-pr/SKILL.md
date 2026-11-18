---
name: stage-pr
description: >-
  Open a draft pull request for current work or branch. Iterate until CI is green and Copilot review approves.
  Use when the user asks to open, create, or stage a PR, or make a PR reviewable or ready for review.
---

# Make a PR reviewable

Open a PR in a draft state, with its body written by [`visual-pr-description`](../visual-pr-description/SKILL.md). Keep iterating until CI is green and the requested Copilot review approves. Leave the PR in draft.

If the work has a ticket (in the branch name, like `INTER-1234-feat-...`, or in the conversation), start the title with `<KEY>: ` and link the ticket in the body. No ticket: ask once whether to link an existing one, create one, or open without.

## Related skills 

* [`visual-pr-description`](../visual-pr-description/SKILL.md)
* [`pr-comments`](../pr-comments/SKILL.md)

## Limits

- Never run `gh pr ready`, `gh pr merge`, or `gh pr merge --auto`, and don't force-push or edit CI workflows to force a green result. The PR stays a draft for the user, unless the user said in this session to merge once it's green.
- Reply to and resolve only Copilot (bot) review comments. Never reply to, resolve, or react to a human reviewer's comments unless the user asked in this session, even when asked to "implement" or "address" them. Fix the code, then tell the user in chat which commit addresses which comment, or offer drafted replies (see [`pr-comments`](../pr-comments/SKILL.md#who-not-to-reply-to)).
- Decline a Copilot comment only with a reason you checked this session; an unchecked reason is a guess, so say so or fix it.
- At most 3 Copilot review rounds. After the third, stop and list the open comments instead of fixing them.
- A notification or check-in that changes nothing gets one line or no reply. Ask a pending question once; don't repeat it on every check-in.
- Stop and report when a failure is outside this PR, or when a comment needs a product call.

## Loop

Refresh state every pass with `gh pr view` and `gh pr checks` (`--watch`). 
For every failure or review finding 

* Read failing CI log (if exists) and fix failures if they are in this PR or easy to fix. 
  * If the failure is outside this PR or hard to fix, report it and ask the user to fix it.
* Review Copilot findings without getting bullied into scope creep.
  * Fix real issues or even small nits but push back against large changes beyond the original scope and goal. 
* Verify locally (if cheap)
* Push 
* CI starts automatically but you must re-request Copilot review (see below)

Stop when both are true on the current head:

- CI is green.
- The latest Copilot review is on the current head SHA, and every Copilot comment is fixed or declined with a reply. Human comments don't count toward this; they are the user's to answer.

## Request a Copilot review

The GitHub MCP `request_copilot_review` tool and `gh pr edit --add-reviewer @copilot` fail or silently do nothing. Use:

```sh
gh api -X POST repos/{owner}/{repo}/pulls/{n}/requested_reviewers -f 'reviewers[]=copilot-pull-request-reviewer[bot]'
```

Confirm it landed in the timeline (`reviewRequests` can omit the bot):

```sh
gh api repos/{owner}/{repo}/issues/{n}/timeline --paginate --jq '.[]|select(.event=="review_requested" and .requested_reviewer.login=="Copilot")|.created_at'
```

If no request is newer than the push, use GraphQL:

```sh
gh api graphql -f id="$(gh pr view {n} --json id -q .id)" -f query='mutation($id: ID!) {
  requestReviewsByLogin(input: {pullRequestId: $id, botLogins: ["copilot-pull-request-reviewer"], union: true}) { clientMutationId } }'
```

When done, report the PR URL after a fresh read shows green CI and a Copilot approval of the current head.
