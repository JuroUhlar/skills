---
name: perf-review
description: Use when the user invokes perf-review or asks to gather data for their own performance review or self-assessment.
disable-model-invocation: true
---

# Performance review

Collect one person's GitHub, Slack, Jira, and Notion activity for a review period and the same period a year earlier, then build an interactive HTML report comparing them, with highlights.

Collection and analysis are separate steps. Collectors write raw local files, and `build-report.ts` derives every metric and applies the bot and automation rules, so changing a definition needs no recollection. Scripts are TypeScript run by Node 22.18 or later with no dependencies; [`scripts/records.ts`](scripts/records.ts) holds the schema of every data file.

## 1. Clarify

Ask once, in one message, and wait:

- Person: default the user. Their GitHub login, if not the `gh` account.
- Period: default the calendar year to date. Comparison: the same dates one year earlier, so both periods have equal length.
- GitHub org. Activity outside it is ignored.
- Sources to skip, if any.
- Output folder: default `~/perf-reviews/<year>/`. Never inside a repo: the files quote colleagues' messages.

## 2. Collect

Run the scripts for both periods in parallel, into `DIR/current/` and `DIR/previous/`. Credentials come from the environment; when one is missing, ask the user for it.

```sh
node scripts/collect-github.ts --org ORG --from FROM --to TO --out DIR/current/github.json [--user LOGIN]
SLACK_USER_TOKEN=... node scripts/collect-slack.ts --from FROM --to TO --out DIR/current/slack.json
JIRA_SITE=... JIRA_EMAIL=... JIRA_API_TOKEN=... node scripts/collect-jira.ts --from FROM --to TO --out DIR/current/jira.json
node scripts/collect-notion.ts --token TOKEN_FILE --from FROM --to TO --out DIR/current/notion.json
```

- GitHub: `gh` auth, a few minutes per year.
  - `authored`: PRs GitHub attributes to the user, merged in the period. Includes coding-agent PRs they assigned.
  - `reviewed`: others' PRs the user reviewed in the period, merged or not.
- Slack: a user token with `search:read` and `channels:read`, about 4 minutes per year. Keeps public channels, including archived ones. `skipped_non_public` counts the DMs and private-channel messages left out.
- Jira: an API token from `https://id.atlassian.com/manage-profile/security/api-tokens`.
  - `implemented`: Done tickets assigned to the user, resolved in the period, with `started`: the first move into an In Progress status.
  - `reported`: tickets the user created in the period.
- Notion: the public API sees only pages shared with an integration, so the script calls Notion's hosted MCP server (`mcp.notion.com`) as the user. Get `TOKEN_FILE` once with `node scripts/notion-login.ts --out TOKEN_FILE`; the user approves in the browser. Keep the file outside repos: it reads everything the user can.
  - `pages_created`, `pages_edited`: workspace search, one month at a time.
  - `comments`: the user's comments in the period, on those pages only.

## 3. Check the data

Run `node scripts/build-report.ts DIR` and read the counts and data notes before analysis:

- The "automated PRs left out" list: a human PR wrongly flagged, or a machine user that slipped through. Count comment authors in `authored[].comments` to find machine users; pass them to `build-report.ts --bots a,b`.
- The repo breakdown: a repo that was renamed or replaced during the two periods shows as two repos and skews the comparison. Pass `--same-repo old=new` to count them as one.
- PRs with a non-empty `truncated` list hit a GraphQL page limit, so their comment counts are lower bounds.
- Months with zero activity: a holiday, or a failed search.

## 4. Highlights

Current period only.

1. `node scripts/prepare-batches.ts DIR` writes `DIR/batches/NN.txt` from Slack messages and Notion comments.
2. Give each batch to a sub-agent with [references/highlights.md](references/highlights.md), all in parallel.
3. Merge their candidates: drop duplicates of one effort, keep the 15 to 25 strongest, and write `DIR/highlights.json` in the `highlight` shape from `records.ts`. `build-report.ts` rejects a file that doesn't match, naming the bad field.

## 5. Report

Run `build-report.ts` again. `report.html` has the comparison table with definitions, monthly charts, breakdowns, highlights, data notes, and linked PR and ticket lists. Open it locally. Ask before publishing it anywhere: it holds colleagues' names and messages.

Report each number with its comparison, and say which sources were missing.
