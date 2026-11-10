See `README.md` for more details.
Unless the user says otherwise, edit locally and push directly to `main`. No feature branches or PRs.
Before editing a `SKILL.md`, load `write-agent-skill` and `write-well`.
After adding, removing, or renaming a skill or changing its description, run `npm run build`, then `npm run check` (CI runs the check). After changing a description, also run `npm run eval -- --runs 3` (single runs are noisy). Evals load `setup/CLAUDE.md`, like real sessions.
When a change needs something the copied skill folders don't provide in Claude Code cloud environments (a hook, a dependency, a settings entry), update `Claude Code installation.md` and tell the user to update the setup script in Claude Code.
