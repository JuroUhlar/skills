#!/usr/bin/env bash
# PreToolUse hook for Agent. When a subagent is spawned without a type or as general-purpose,
# reminds Claude to pick a role by job; audits found general-purpose used where a role fit.

input=$(cat)
type=$(jq -r '.tool_input.subagent_type // empty' <<<"$input")
[[ -z "$type" || "$type" == general-purpose ]] || exit 0

jq -n '{hookSpecificOutput: {hookEventName: "PreToolUse",
  additionalContext: "Subagent type: pick by job. thinker for review, diagnosis, plans, and deciding how to address review comments; fixer for changes a brief already specifies, staging PRs, and CI babysitting; clerk for mechanical text and data work; Explore for read-only code search. general-purpose only when none fits. If one fits, cancel this call and respawn with that subagent_type."}}'
