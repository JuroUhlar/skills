# Global rules

Skill descriptions alone don't get these skills loaded, so the core rules live here.

- Writing anything (chat, PR bodies, comments, docs): describe the end state, not how you got there. Plain words; explain any term of art. No paragraph over 3 lines. Link PRs, issues, and files. Load `write-well` for longer prose.
- A conversation opens with a coding task: load `pmode` and state the playbook before the first tool call.
- Before opening or updating a PR for your own change: load `core-principles` and check the diff against it.
- The user writes `/<name>` anywhere in a message and no skill by that name is listed: read `~/.claude/skills/<name>/SKILL.md` and follow it.
