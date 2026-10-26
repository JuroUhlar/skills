#!/usr/bin/env bash
# PreToolUse hook for Bash. On `git push`, blocks the first push of a branch once so Claude
# checks the branch name, then reminds Claude to keep the PR description current.

input=$(cat)
command=$(jq -r '.tool_input.command // empty' <<<"$input")
grep -Eq '(^|[^[:alnum:]_.-])git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+push([[:space:]]|$)' <<<"$command" || exit 0

dir=$(jq -r '.cwd // empty' <<<"$input")
if [[ "$command" =~ git[[:space:]]+-C[[:space:]]+([^[:space:]]+) ]]; then
  [[ "${BASH_REMATCH[1]}" = /* ]] && dir=${BASH_REMATCH[1]} || dir="$dir/${BASH_REMATCH[1]}"
fi
branch=$(git -C "${dir:-.}" branch --show-current 2>/dev/null)

respond() {
  jq -n --arg field "$1" --arg text "$2" --arg decision "$3" \
    '{hookSpecificOutput: ({hookEventName: "PreToolUse", ($field): $text}
      + if $decision == "" then {} else {permissionDecision: $decision} end)}'
}

# No upstream means the branch name isn't public yet. Block once per commit, not per branch,
# so the push after a rename passes.
if [[ -n "$branch" ]] && ! git -C "$dir" rev-parse --abbrev-ref '@{upstream}' >/dev/null 2>&1; then
  marker="${TMPDIR:-/tmp}/claude-pre-push/$(git -C "$dir" rev-parse --show-toplevel HEAD | git hash-object --stdin | cut -c1-16)"
  if [[ ! -e "$marker" ]]; then
    mkdir -p "$(dirname "$marker")" && touch "$marker"
    respond permissionDecisionReason "First push of branch '$branch', so its name becomes public. It must describe the work: ticket ID or feat/fix/docs prefix plus meaningful words, e.g. INTER-1234-feat-add-login-flow. Never random words or harness names like claude/naughty-beaver-hf7402. If the name is bad, rename it (git branch -m <new-name>). Then run the push again; it won't be blocked a second time." deny
    exit 0
  fi
fi

respond additionalContext "After this push: if the branch has an open PR (gh pr view), check that the PR description still matches the commits and update it if not."
