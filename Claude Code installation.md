# Claude Code installation

[`setup/install.sh`](setup/install.sh) wires this repo into Claude Code wherever the skills are copied or symlinked instead of installed as the plugin. It is idempotent: rerun it after pulling changes to it. It:

- Registers the skills' hooks in `settings.json`. Hooks in skill folders only load through the plugin.
- Imports [`setup/CLAUDE.md`](setup/CLAUDE.md) into the user `CLAUDE.md`. These are rules that skill descriptions alone don't trigger.
- Disables claude.ai-synced plugins (`<name>@synced`) that duplicate a skill here.

## Local

The skills load through the `~/.claude/skills` → `~/.agents/skills` symlink. Run once:

```bash
~/.agents/skills/setup/install.sh
```

## Cloud

Setup script for Claude Code cloud environments (claude.ai/code). Paste it into the environment's setup script field. After changing it here, update it in Claude Code and bump `rev` so the environment rebuilds.

```bash
#!/bin/bash
set -euo pipefail

# rev: 5  (bump to force a rebuild after pushing skill changes)
SK_DIR="/opt/juraj-skills"

git clone --depth 1 https://github.com/JuroUhlar/skills "$SK_DIR"

mkdir -p ~/.claude/skills
for d in "$SK_DIR"/*/; do
  [ -f "$d/SKILL.md" ] && cp -r "${d%/}" ~/.claude/skills/
done

command -v jq >/dev/null || { apt-get update -qq && apt-get install -y -qq jq; }
"$SK_DIR/setup/install.sh"
```

## What needs it

- `commit-rules/hooks/pre-push-reminder.sh` and `visual-pr-description/hooks/pr-create-reminder.sh` need `jq`.
