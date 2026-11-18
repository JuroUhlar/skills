#!/usr/bin/env bash
# PreToolUse hook for Bash and GitHub MCP create/update_pull_request. Before a PR is created or
# its body rewritten, reminds Claude to write the body with the visual-pr-description template.
# In a public repo, also warns to keep internal details out of the body.

input=$(cat)
repo=""
if [[ $(jq -r '.tool_name // empty' <<<"$input") == Bash ]]; then
  command=$(jq -r '.tool_input.command // empty' <<<"$input")
  grep -Eq '(^|[^[:alnum:]_.-])gh[[:space:]]+pr[[:space:]]+(create|edit[[:space:]].*--body)([[:space:]=-]|$)' <<<"$command" || exit 0
  [[ "$command" =~ (-R|--repo)[[:space:]=]+([^[:space:]]+) ]] && repo=${BASH_REMATCH[2]}
else
  [[ $(jq -r '.tool_name' <<<"$input") == *update_pull_request && -z $(jq -r '.tool_input.body // empty' <<<"$input") ]] && exit 0
  repo=$(jq -r '[.tool_input.owner, .tool_input.repo] | select(all) | join("/")' <<<"$input")
fi

text="Writing a PR body: use the visual-pr-description skill and its template. Describe the end state, not earlier attempts. If you skipped that, finish this call, then rewrite the body following the skill."
cwd=$(jq -r '.cwd // "."' <<<"$input")
visibility=$(cd "$cwd" 2>/dev/null && perl -e 'alarm 3; exec @ARGV' gh repo view ${repo:+"$repo"} --json visibility -q .visibility 2>/dev/null)
[[ "$visibility" == PUBLIC ]] && text+=" This repo is public: keep internal IDs, emails, vault or secret names, and private links (Slack, internal docs) out of the body."

jq -n --arg text "$text" '{hookSpecificOutput: {hookEventName: "PreToolUse", additionalContext: $text}}'
