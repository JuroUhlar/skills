#!/usr/bin/env bash
# PreToolUse hook for browser MCP tools. On the first browser call in a session, reminds Claude
# to load browser-tools, which picks the tool and holds the Chrome profiles.

input=$(cat)
marker="${TMPDIR:-/tmp}/claude-browser-tools/$(jq -r '.session_id // "none"' <<<"$input")"
[[ -e "$marker" ]] && exit 0
mkdir -p "$(dirname "$marker")" && touch "$marker"

jq -n '{hookSpecificOutput: {hookEventName: "PreToolUse",
  additionalContext: "First browser call this session: load the browser-tools skill if you have not, and check this is the right browser tool for the job."}}'
