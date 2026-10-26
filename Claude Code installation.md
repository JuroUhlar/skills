# Claude Code installation

Setup script for Claude Code cloud environments (claude.ai/code). It installs the skills and the hooks they ship. Paste it into the environment's setup script field. After changing it here, update it in Claude Code and bump `rev` so the environment rebuilds.

```bash
#!/bin/bash
set -euo pipefail

# rev: 4  (bump to force a rebuild after pushing skill changes)
SK_DIR="/opt/juraj-skills"

git clone --depth 1 https://github.com/JuroUhlar/skills "$SK_DIR"

# Skills.
mkdir -p ~/.claude/skills
for d in "$SK_DIR"/*/; do
  [ -f "$d/SKILL.md" ] && cp -r "$d" ~/.claude/skills/
done

# Hooks. Copied skills don't load hooks, so register them in settings.json.
command -v jq >/dev/null || { apt-get update -qq && apt-get install -y -qq jq; }
SETTINGS=~/.claude/settings.json
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
jq --arg push "$SK_DIR/commit-rules/hooks/pre-push-reminder.sh" \
  --arg pr "$SK_DIR/visual-pr-description/hooks/pr-create-reminder.sh" \
  '.hooks.PreToolUse += [
    {matcher: "Bash", hooks: [{type: "command", command: $push}]},
    {matcher: "Bash|mcp__.*__create_pull_request", hooks: [{type: "command", command: $pr}]}
  ]' \
  "$SETTINGS" > "$SETTINGS.tmp" && mv "$SETTINGS.tmp" "$SETTINGS"
```

## What needs it

- `commit-rules/hooks/pre-push-reminder.sh`: pre-push hook. Needs `jq` and a `PreToolUse` entry for `Bash` in `settings.json`.
- `visual-pr-description/hooks/pr-create-reminder.sh`: PR-create hook. Needs `jq` and a `PreToolUse` entry for `Bash|mcp__.*__create_pull_request` in `settings.json`.
