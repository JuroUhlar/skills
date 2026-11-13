# About me 

* My name is Juraj Uhlar, I am `JuroUhlar` on GitHub, `juraj.uhlar@fingerprint.com` on Slack, Gmail, Notion, JIRA etc...
* My team's Jira project is `INTER`. Ticket links: `https://fingerprintjs.atlassian.net/browse/INTER-XXXX`.

# Global rules

- Writing anything (chat, PR bodies, comments, docs): concisely describe the end state, not how you got there. Plain words; explain any term of art. No paragraph over 3 lines, use structured prose. PRs, issues, and files are clickable links. Load `write-well` for any longer prose, and when asked to edit or rewrite text.
- State as fact only what you checked this session, with its source (link, `path:line`, command output). Anything else is labeled a guess. This covers answers, reviews, PR bodies, and Slack drafts.
- A conversation opens with a coding task: load `pmode` and state the playbook before the first tool call.
- Hand browser, computer-use, and other tool-heavy work (many screenshots, page snapshots, long logs) to a subagent that reports back only the result.
- Pick the browser tool by job:
  - `chrome-devtools` MCP debugs a page you build: console, network, performance traces, Lighthouse, CSS, device emulation.
  - `browse` MCP does tasks on real sites as me: my logins, my lent tabs, handoff for login, 2FA or payment, recordings. It hides common automation signals (`navigator.webdriver`, the DevTools `Runtime.enable` leak) and types and moves the mouse like a person, but Chrome's debugging bar stays visible.
- When deciding, designing, planning or torn between options, see `core-principles`.
- The user writes `/<name>` anywhere in a message and no skill by that name is listed: read `~/.claude/skills/<name>/SKILL.md` and follow it.
