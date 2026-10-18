---
name: pr-comments
description: Use when replying to or resolving PR review comments, addressing review feedback, or staging/drafting PR review comments without posting them.
---

# PR comments

Prefer `gh` over GitHub MCP (MCP review calls often fail on SAML-protected orgs).

## Voice

Write as the user.

- Terse. No thanks, no "good catch", no filler.
- No em dashes, no long paragraphs. For longer comments: bullet points, code snippets, diffs, scannable structure.
- Backticks on identifiers.

## Reply to review comments

### Who (not) to reply to

- Bots (Copilot etc.): reply and resolve freely.
- Humans: never reply or resolve unless the user says so in this conversation. Fix the code, draft a reply in conversation, leave posting to them.

### Reply body

- Default: `Fixed in <sha>.`
- Add a few words only if the fix is non-obvious.

```
Fixed in 879dfc3. Declared it as `const` so the snippet is safe under strict mode. 
```

### Reply flow

1. Fix, commit, push (SHA must resolve on the PR).
2. Reply:
   ```sh
   gh api repos/<owner>/<repo>/pulls/<n>/comments/<comment_id>/replies -f body='Fixed in <sha>.'
   ```
3. Resolve addressed threads with GraphQL `resolveReviewThread` (REST can't). Get the thread `id` by matching the REST comment `id` to `reviewThreads.comments.databaseId`.

### Resolve only what you fixed

Leave skipped or disputed threads open. Bots: say why in the reply. Humans: tell the user.

## Stage review comments

Create comments in a pending review. Never submit (omit `event`). The user posts via Files changed → Finish your review.

### One pending review

- One pending review per user per PR. Reuse yours if it exists, else create one.
- Add comments to it with GraphQL `addPullRequestReviewThread`, using the review's `node_id` (`PRR_...`), not numeric `id`.
- Confirm `state: PENDING` and stop.

### Staging traps

- `POST .../reviews/{id}/comments` → 404.
- `POST .../pulls/{n}/comments` opens a second pending review → 422.
- Files outside the diff can't be commented. Attach to a related changed file and say so.
