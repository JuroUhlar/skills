#!/usr/bin/env bash
# PreToolUse hook for Bash and GitHub MCP reply tools. Before a reply to a PR review thread,
# reminds Claude that a decline needs a reason checked this session; audits found guessed ones.

input=$(cat)
if [[ $(jq -r '.tool_name // empty' <<<"$input") == Bash ]]; then
  jq -r '.tool_input.command // empty' <<<"$input" \
    | grep -Eq '/comments/[0-9{<$][^[:space:]]*/replies|addPullRequestReviewThreadReply|in_reply_to' || exit 0
fi

jq -n '{hookSpecificOutput: {hookEventName: "PreToolUse",
  additionalContext: "Replying to a review comment: if this declines it, the reason must be one you checked this session (source read, command run). Otherwise fix it, or say the reason is a guess. Reply only to bots unless the user asked you to answer humans."}}'
