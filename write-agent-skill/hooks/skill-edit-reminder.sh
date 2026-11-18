#!/usr/bin/env bash
# PreToolUse hook for Edit and Write. On the first edit of a SKILL.md in a session, reminds Claude
# to load write-agent-skill and write-well, which audits found skipped at this point.

input=$(cat)
[[ $(jq -r '.tool_input.file_path // empty' <<<"$input") == */SKILL.md ]] || exit 0

marker="${TMPDIR:-/tmp}/claude-skill-edit/$(jq -r '.session_id // "none"' <<<"$input")"
[[ -e "$marker" ]] && exit 0
mkdir -p "$(dirname "$marker")" && touch "$marker"

jq -n '{hookSpecificOutput: {hookEventName: "PreToolUse",
  additionalContext: "Editing a SKILL.md: load the write-agent-skill and write-well skills first if you have not this session, and follow them for this edit."}}'
