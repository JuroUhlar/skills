#!/usr/bin/env bash
# Wires this repo into Claude Code for installs that copy or symlink skill folders instead of
# installing the plugin: registers the skills' hooks, imports the global instructions, and
# disables claude.ai-synced copies of these skills. Idempotent; rerun after pulling.
set -euo pipefail

repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
claude_dir=${CLAUDE_CONFIG_DIR:-$HOME/.claude}
settings=$claude_dir/settings.json
memory=$claude_dir/CLAUDE.md

command -v jq >/dev/null || { echo "install.sh needs jq" >&2; exit 1; }
mkdir -p "$claude_dir"
[ -s "$settings" ] || echo '{}' > "$settings"

# Synced claude.ai plugins load as `<name>@synced` next to the skill folders, so each skill
# would be listed twice. Disable every synced plugin that shares a name with a skill here.
skills=$(for d in "$repo"/*/; do [ -f "$d/SKILL.md" ] && basename "$d"; done | jq -R . | jq -s .)

jq --arg push "\"$repo/commit-rules/hooks/pre-push-reminder.sh\"" \
  --arg pr "\"$repo/visual-pr-description/hooks/pr-create-reminder.sh\"" \
  --argjson skills "$skills" '
  def ours: [.hooks[]?.command // empty] | any(test("pre-push-reminder\\.sh|pr-create-reminder\\.sh"));
  .hooks.PreToolUse = ([.hooks.PreToolUse[]? | select(ours | not)] + [
    {matcher: "Bash", hooks: [{type: "command", command: $push}]},
    {matcher: "Bash|mcp__.*__(create|update)_pull_request", hooks: [{type: "command", command: $pr}]}
  ])
  | .enabledPlugins = ((.enabledPlugins // {}) + ($skills | map({key: "\(.)@synced", value: false}) | from_entries))
  ' "$settings" > "$settings.tmp" && mv "$settings.tmp" "$settings"

# Import instead of copying, so edits to setup/CLAUDE.md apply without rerunning.
start='<!-- juraj-skills:start -->'
end='<!-- juraj-skills:end -->'
block="$start
@$repo/setup/CLAUDE.md
$end"
touch "$memory"
if grep -qF "$start" "$memory"; then
  BLOCK=$block awk -v s="$start" -v e="$end" '
    $0 == s { print ENVIRON["BLOCK"]; skip = 1; next }
    $0 == e { skip = 0; next }
    !skip' "$memory" > "$memory.tmp" && mv "$memory.tmp" "$memory"
else
  [ -s "$memory" ] && echo >> "$memory"
  echo "$block" >> "$memory"
fi

echo "Hooks, global instructions, and synced-duplicate suppression installed from $repo"
