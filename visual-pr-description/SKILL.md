---
name: visual-pr-description
description: Create or update a GitHub pull request description with a compact visual change outline. Use when writing or updating the description of the user's own PR.
metadata:
  source: https://github.com/humanlayer/skills/tree/main/plugins/visual-pr/skills/visual-pr
---

# Describe a Pull Request

Create or update the pull request for the current task with a concise description that helps a reviewer understand why the change exists and the shape of the implementation.

## Workflow

1. Read the description template:

   [references/pr_description_template.md](references/pr_description_template.md)

2. Find the pull request:
   - Check the current branch for a PR with `gh pr view --json url,number,title,state,baseRefName,headRefName 2>/dev/null`.
   - If no PR exists and you are about to create one (for example in [`stage-pr`](../stage-pr/SKILL.md)), write the body now and pass it to the create call.
   - Asked to explain or preview a PR: print the description in chat. Publish only when asked to create or update the PR body.
   - If no PR exists otherwise, stop and offer to open one with [`stage-pr`](../stage-pr/SKILL.md). Don't commit, push, or create a PR from this skill; committing follows [`commit-rules`](../commit-rules/SKILL.md).

3. If necessary, gather only the context needed to explain the change:
   - Read the ticket and any relevant task artifacts.
   - Read the complete PR diff and enough surrounding code to understand behavior and ownership.
   - Use `gh pr view` to collect PR metadata and changed files.
   - Read [`show-me`](../show-me/SKILL.md) for the visual-outline conventions used in the PR body.

4. Write the PR description using the template:
   - Ceremony matches scope - tiny change gets a minimal description.
   - Describe the branch's end state. Don't narrate earlier attempts, review rounds, or what didn't work.
   - Keep **Why** to exactly one sentence.
   - Keep **Things to note** to 1-3 bullets. Prioritize reviewer warnings, migrations, compatibility constraints, deliberate omissions, or surprising decisions. Write `- None.` when there are no special considerations.
   - Fill **Verification** with the evidence from [`verify-with-proof`](../verify-with-proof/SKILL.md#report), at most 3 lines: what ran and the result, no raw output. Omit it when nothing could be run.
   - Make **Change outline** a compact, `/show-me`-inspired structural view rather than prose or a file-by-file changelog.
   - Include only the views that help explain this PR:
     - SQL table and endpoint contract changes, plus pseudocode for business logic.
     - key data structure / type changes
     - A shallow file tree showing changed responsibilities.
     - React component tree changes, including important hooks, state, and package boundaries.
     - Call-tree, call-stack, control-flow, or data-flow changes.
   - Prefer `diff` blocks when showing changes to an existing shape. Show the complete target shape when most of it is new or diff notation would obscure ownership or order.
   - GitHub colors each `diff` line by its first character: `-` is red, `+` is green. Start a line with `-` only when it is really removed. Never write "old → new" on one line, it renders as a deletion.
   - Use a Markdown table for a list of items with several attributes each, such as dependency bumps (package, from, to, why).
   - Keep code block lines under ~80 characters. Longer lines scroll sideways and hide the end.
   - Keep each view focused on what a reviewer needs. Omit categories that did not change.
   - Never just duplicate a part of the diff in the PR body.
   - Optional: if you know a ticket id/url, related plan/document urls, or other relevant links, put them in **Context**; otherwise omit **Context**.

5. Save and publish the description:
   - Update the PR with `gh pr edit {number} --body` and a quoted heredoc, or pass the body to the create call when the PR doesn't exist yet.
   - Confirm the update succeeded.

6. Report completion with a short summary and link to the PR.

Always read and follow [references/pr_description_template.md](references/pr_description_template.md). Do not expand the PR body beyond that template. When updating, rewrite to the template rather than appending, but keep sections the author wrote (notes, screenshots, links). Say so if you remove any.

Write as one human talking to another: avoid jargon and slang, and use simple, coherent, concise language.
