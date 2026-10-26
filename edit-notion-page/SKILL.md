---
name: edit-notion-page
description: Use when creating, editing, or rewriting a Notion page through the Notion MCP (notion-update-page, update_content, replace_content).
---

# Edit Notion page

Notion stores different text than you send, and other people edit the page while you work. Most failed edits come from matching against text you remember sending instead of what Notion stores.

## Stored text differs from sent Markdown

`update_content` matches `old_str` against the stored text, which is Notion-flavored Markdown (spec: fetch `notion://docs/notion-flavored-markdown-spec`). Seen conversions:

| Sent | Stored |
| --- | --- |
| `` `x` `` | `<code>x</code>` |
| `**x**` | `<b>x</b>` |
| `_` | `\_` |
| `~` | `\~` |
| some lists | `<ol><li>` blocks |

- Markdown section anchors (`#monitoring`) don't resolve. Notion links sections by block ID; fetch the page to get it.

## Small edits

### Fetch before every edit

- Fetch right before each `update_content` call, and copy `old_str` from that output.
- Never write `old_str` from memory of what you sent, or from a fetch made before the user's latest edits.
- This overrides the tool's "fetch unless already loaded": while someone else edits the page, a loaded copy goes stale.

### Short, unique anchors

- Anchor on a heading or a first sentence.
- Avoid characters Notion escapes (`_`, `~`, `*`, `|`) in `old_str`.

### One logical change per call

- Edits in a batch apply or fail one by one; the batch isn't atomic. An insert that lands while its paired delete fails duplicates content.
- If you must batch, put deletes before inserts.
- Delete text directly. No temporary marker text to find and delete later.
- To add at the page's start or end, use `insert_content`; it needs no `old_str`.

### Check warnings after every call

- On `no_match` or any warning, refetch and fix it before the next edit.

## Large changes: round trip

Draft or rewrite locally, write to Notion once.

1. Fetch the page and save it to a local file.
2. Edit the file with normal file tools: exact matching, visible diff.
3. Fetch again right before writing. Diff against step 1; merge anything someone else changed.
4. Write the whole page with `replace_content`.

- `replace_content` overwrites anyone editing at that moment. Use it only right after step 3, and tell the user before if they're editing.
- For a new page, draft the full content locally and create it once, then make only small edits.
