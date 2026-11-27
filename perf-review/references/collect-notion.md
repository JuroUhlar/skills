# Brief: collect Notion through MCP

Fill in `{DIR}`, `{FROM}`, `{TO}`, then send to one sub-agent per period. Notion's API sees only pages shared with an integration, so the Notion connector, which acts as the user, is the source. The sub-agent keeps bulky MCP output out of the main context.

---

Collect Notion activity for the connected user from `{FROM}` to `{TO}` (inclusive) and write it to `{DIR}`. Read-only: never create, edit, or comment. Write the file in one go when collection is complete. Report only file paths, counts, and anything you could not collect.

Write `{DIR}/notion.json`.

1. `notion-get-self` for the user's name and id.
2. Pages created: `notion-search` with `query: ""`, `filters: {created_by_user_ids: ["me"], created_date_range: {start_date, end_date}}`, `sort: "created"`, `page_size: 50`, `max_highlight_length: 0`. Search one calendar month at a time. A month returning 50 results may be truncated: split it in half and search again.
3. Pages edited: the same search with `edited_by_user_ids` and `last_edited_date_range`. If the result says these filters were dropped (non-Business plan), skip this step and say so in `method`.
   - Search results carry one `timestamp`, the last-edited time, not the creation time. Store it as `last_edited`; the search filter already guarantees the creation or edit range.
4. Comments: for every page from steps 2 and 3, call `notion-get-comments` with `include_resolved: true`. Keep comments marked `by-you="true"` whose timestamp falls in the period. Follow `next-cursor` and omitted discussions when shown.

```json
{"source": "notion", "user": "<name>", "period": {"from": "{FROM}", "to": "{TO}"}, "collected_at": "<ISO now>",
 "method": "<which steps ran, which filters were dropped, and that comments on pages the user never created or edited are missed>",
 "pages_created": [{"id": "...", "title": "...", "url": "...", "type": "page" | "database", "last_edited": "<ISO>", "path": "..."}],
 "pages_edited": [same shape],
 "comments": [{"page_id": "...", "page_title": "...", "page_url": "...", "discussion": "discussion://...", "at": "<ISO>", "resolved": false, "text": "<full comment text, HTML converted to plain text>"}]}
```
