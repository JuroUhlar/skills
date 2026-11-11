---
name: claude-security-projects
description: Use when creating, configuring, or auditing Claude Security projects (claude.ai/security), or when the Claude Security connector can't set something you need, such as excluded folders or context-only repositories.
---

# Claude Security projects

Last verified: 2026-11-11. Keep this date current; see [Keep this skill current](#keep-this-skill-current).

## Pick the tool

- **The Claude Security connector** (MCP tools like `list_projects`, `get_project`, `list_findings`, `save_document`, `send_project_message`): use it for everything it covers. It's a supported API.
- **The internal API**: use it only for what the connector can't do. When last checked, the connector's create call took scoped folders only, so it couldn't set excluded folders or context-only repositories, it couldn't change a project's repositories after creation, and it couldn't read or change sharing (`get_project` has no members; `update_project` only sets the name and hidden severities).
- **The UI**: use it when neither works, or for settings the user should decide themselves.

## Call the internal API

- Requests are [Connect RPC](https://connectrpc.com/docs/protocol/) with JSON bodies, not REST:
  `POST https://claude.ai/claudeai-rpc/anthropic.claudesecurity.api.v1alpha.ClaudeSecurityService/<Method>`
- Authentication is the user's browser session. Run `fetch` with a relative URL inside a logged-in claude.ai tab, through a browser automation tool that can evaluate JavaScript in the page. Never copy cookies or session keys out of the browser, and never print request headers that include them.
- Send `content-type: application/json` and `x-organization-uuid: <org uuid>`. The org UUID appears in the page's own request URLs (`/api/organizations/<uuid>/...`).
- `v1alpha` means it can change without notice. Read the response of every write and compare it with what you sent.

| Method | Body | Notes |
|---|---|---|
| `CreateProject` | `{name, assets: [Asset]}` | Returns the project with assets. Notes aren't part of it; see [Notes](#notes). |
| `GetProject` | `{project_id}` | Full config: assets, status, scan settings. |
| `ListProjects` | not inspected | Use the connector's `list_projects` instead. |
| `UpdateProjectAsset` | `{project_id, asset_id, params: {settings: {exclude_paths?, base_paths?, branch?}, update_mask: "excludePaths,basePaths,branch"}}` | Changes one existing repo entry in place. List only the fields you send in `update_mask` (camelCase), comma-separated. Returns the updated asset. `asset_id` (`asst_...`) comes from `GetProject` or the connector's `get_project`. |
| `ListProjectMembers` | `{project_id}` | Returns `{members: [{account_uuid, full_name, email, is_owner, added_at, added_by_name, role}]}`. The owner has `is_owner: true` and no role. |
| `AddProjectMember` | `{project_id, account_uuid, role}` | `role` is `full` (UI: Full), `view_triage` (UI: Triage) or, by UI label only, View only (value not captured). One call per person. Returns `{member: {...}}`. Get `account_uuid` from `ListProjectMembers` on a project that already has the person. |

`GetProject` also returns `sharing: {visibility, is_shared, viewer_capabilities, is_owner}`. `visibility: "private"` is the UI's "Only people invited". To copy sharing between projects, read the source with `ListProjectMembers` and call `AddProjectMember` for each missing member, then read the target back.

Severity of a finding can't be set by any method, in the UI, or by the project agent (it says its tools only resolve or reopen). The severity badge only shows a tooltip. A finding page's chat offers "Why is this <severity>?" and "Tell Claude why this is wrong" chips, which send a chat message; the agent can then update the threat model, which later scans use for rating. To act on a finding now, use Triage → Dismiss as (False positive / Accepted risk / Duplicate / Other).

Seen in network traffic but not tried: `ListFindings`, `ListProjectMemories`, `GetProjectBriefing`, `ListProposedAssetChanges`, `ListProjectAgentMessages`. Before using an unlisted method, capture it as in [Capture an unknown call](#capture-an-unknown-call).

## Asset shape

```json
{"type": "github_repository",
 "repository_url": "https://github.com/<owner>/<repo>",
 "branch": "main",
 "base_paths": ["/"],
 "exclude_paths": ["test", "examples"]}
```

- `base_paths` is the scope. `["/"]` means the whole repository, and a list of folders (`"packages/api/src/foo"`, no leading slash) means only those folders.
- `base_paths: []` means a **context-only** repository: Claude reads it to understand the code in scope and reports no findings in it.
- `exclude_paths` are folders relative to the repository root, with no leading slash. The UI warns that excluded folders are out of scope, so Claude can miss findings elsewhere that involve their code. Exclude tests, examples, e2e, docs and fixtures, not code that runs for users.
- A project holds at most 8 repositories, counting context-only ones.

## Build the payload from the default branch

- The server rejects a folder that doesn't exist on the given branch. Take paths from the remote default branch, not from a local checkout, which may be on a feature branch with different paths:
  ```
  git -C <repo> fetch origin
  git -C <repo> ls-tree -r -d --name-only origin/<default-branch>
  ```
- Use the repository's current GitHub name. A renamed repository's old name fails with "Claude GitHub App isn't installed", even though git still follows the redirect. Resolve it with `gh repo view <owner>/<old-name> --json nameWithOwner,defaultBranchRef`.
- Tests that sit next to the code (`*.test.ts`) can't be excluded, because exclusions are per folder.

## Create projects

1. Create one project first and check its response against the plan. Then create the rest.
2. Check each response: repository URLs, branches, `base_paths` and `exclude_paths` as sent.
3. Save the notes (see [Notes](#notes)).
4. Run the connector's `list_projects` to confirm the projects exist. New projects show `pending` until the first read of the code finishes.

### Overlapping scope

- A 409 with `project_asset_scope_overlap` means another project already scopes some of the same folders. Context-only entries don't count as overlap.
- Fix it by scoping the shared folder in one project only and saying so in both projects' notes. An org admin can also turn on "Overlapping projects" in Organization settings → Claude Security.

## Notes

- `CreateProject` doesn't carry the notes the UI asks for. Save them after creation with the connector's `save_document`, as a short Markdown document: what the code does, who can reach it, the secrets it holds, and the areas to focus on.
- Once the first read finishes, check that the project's threat model reflects them.

## Capture an unknown call

Use this to learn a method or payload the UI sends, without changing anything:

1. In the claude.ai tab, wrap `window.fetch`. For write methods (`Create*`, `Update*`, `Delete*`, `Save*`, `Set*`, `Add*`), store the URL and body, and return a fake error response without sending the request.
2. Do the action once in the UI, with minimal throwaway values.
3. Read the stored bodies. Close the dialog with its Close or Cancel button.
4. Confirm with `list_projects` that nothing was created.

- A full page navigation removes the wrapper. Install it again after every reload.
- For read methods, `GetProject` on an existing project already shows the stored shape.

## Ask before

- Moving legacy projects to continuous scanning. The UI says this can't be undone.
- Archiving a project, or changing sharing or members, unless the user named who gets which access or which project to copy it from.
- Sending a project message. Each one starts a billed agent turn.

## Gotchas

- In the New project dialog, Escape closes the whole dialog and loses the form. Use Tab to leave a field.
- The notes field clears when you switch between the dialog's two steps. Fill it last, then create.

## Keep this skill current

- When a call fails, a field behaves differently, or the connector gains a capability: confirm the cause with [Capture an unknown call](#capture-an-unknown-call) or `GetProject`, then update this file in the same session. Fix the method table, the asset shape or the gotchas, and change the "Last verified" date.
- Delete anything that is no longer true. If the connector now covers something, move it from the internal API back to the connector.
- Write only what you confirmed against the live service, never from memory.
