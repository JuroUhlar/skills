#!/usr/bin/env bash
# PreToolUse hook for Bash and GitHub MCP create_pull_request. Before a PR is created,
# reminds Claude to write its body with the visual-pr-description template.

input=$(cat)
if [[ $(jq -r '.tool_name // empty' <<<"$input") == Bash ]]; then
  command=$(jq -r '.tool_input.command // empty' <<<"$input")
  grep -Eq '(^|[^[:alnum:]_.-])gh[[:space:]]+pr[[:space:]]+create([[:space:]]|$)' <<<"$command" || exit 0
fi

jq -n '{hookSpecificOutput: {hookEventName: "PreToolUse",
  additionalContext: "Creating a PR: write its body with the visual-pr-description skill and its template. If you skipped that, create the PR, then update the body following the skill."}}'
