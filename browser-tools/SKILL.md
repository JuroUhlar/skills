---
name: browser-tools
description: Use before the first browser tool call (browse, chrome-devtools, or the harness's built-in browser), and when a site needs the user's login or blocks curl.
---

# Browser tools

## Pick the tool by job

- **Built-in browser of the harness**: check something yourself (public site, local dev server) without the user's logins.
- **`browse` MCP**: do tasks on real sites as the user, with their logins and lent tabs, handoff for login, 2FA or payment, and recordings. It hides common automation signals (`navigator.webdriver`, the DevTools `Runtime.enable` leak) and types and moves the mouse like a person, but Chrome's debugging bar stays visible. Dismissing that bar disconnects every tab.
- **`chrome-devtools` MCP**: when you need to debug deeper: console, network, performance traces, Lighthouse, CSS, device emulation.

A site that blocks `curl` (e.g., npmjs.com returns 403 or an empty page): open it in a browser. Don't guess what it shows.

## Chrome profiles for `browse`

Pass the id as `browser` when opening a tab:

- `chrome-0a-9c-58-f4-41-10`: work profile (default when no `browser` is given)
- `chrome-0a-9c-58-f4-41-10-2`: personal profile

## Delegating

Browser work goes to a subagent that reports back only the result. A subagent's `handoff()` shows only in Chrome, never in chat. Before delegating work behind a login, check for the login wall and tell the user in chat what they'll need to do.
