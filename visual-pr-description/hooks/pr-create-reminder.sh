#!/usr/bin/env bash
# PreToolUse hook for Bash and GitHub MCP create/update_pull_request. Before a PR is created or
# its body rewritten, reminds Claude to write the body with the visual-pr-description template.

input=$(cat)
if [[ $(jq -r '.tool_name // empty' <<<"$input") == Bash ]]; then
  command=$(jq -r '.tool_input.command // empty' <<<"$input")
  grep -Eq '(^|[^[:alnum:]_.-])gh[[:space:]]+pr[[:space:]]+(create|edit[[:space:]].*--body)([[:space:]=-]|$)' <<<"$command" || exit 0
elif [[ $(jq -r '.tool_name' <<<"$input") == *update_pull_request ]]; then
  [[ $(jq -r '.tool_input.body // empty' <<<"$input") ]] || exit 0
fi

jq -n '{hookSpecificOutput: {hookEventName: "PreToolUse",
  additionalContext: "Writing a PR body: use the visual-pr-description skill and its template. Describe the end state, not earlier attempts. If you skipped that, finish this call, then rewrite the body following the skill."}}'
