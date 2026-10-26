---
name: edit-notion-page
description: Use when creating, editing, or rewriting a Notion page through the Notion MCP (notion-update-page, update_content, replace_content).
---

# Edit Notion page

## Copy old_str from a fresh fetch

`update_content` matches `old_str` against stored text, which differs from the Markdown you sent: `` `x` `` → `<code>x</code>`, `**x**` → `<b>x</b>`, `_` → `\_`, `~` → `\~`, `|` → `\|`.

- Fetch right before each `update_content` call and copy `old_str` from that output. Never write it from memory of what you sent.
- This overrides the tool's "fetch unless already loaded": while someone else edits the page, a loaded copy goes stale.

## Batches apply partially

Each edit in a batch applies or fails on its own. An insert that lands while its paired delete fails duplicates content.

- One logical change per call. If you must batch, put deletes before inserts.
- On any warning, refetch and fix it before the next edit.
- Delete text directly. No temporary marker text to find and delete later.

## Large changes: round trip

1. Fetch the page and save it to a local file.
2. Edit the file with normal file tools: exact matching, visible diff.
3. Fetch again right before writing. Diff against step 1; merge anything someone else changed.
4. Write the whole page with `replace_content` (child-page rules: see the tool description).

- `replace_content` overwrites anyone editing at that moment. Use it only right after step 3, and tell the user first if they're editing.
- For a new page, draft the full content locally and create it once, then make only small edits.
