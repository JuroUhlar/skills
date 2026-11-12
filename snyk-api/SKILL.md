---
name: snyk-api
description: Use when asked about Snyk data, such as vulnerabilities, issues, projects, orgs, or what the Snyk dashboard shows for a repo or package.
---

# Snyk API (read-only)

## Run requests

- Always go through the script. It loads the token, sets the version and `Accept` header, and fails loudly on non-2xx:
  ```bash
  ~/.agents/skills/snyk-api/scripts/snyk.sh "/rest/orgs?limit=100" '.data[] | {id, slug: .attributes.slug}'
  ~/.agents/skills/snyk-api/scripts/snyk.sh --all "/rest/orgs/<org_id>/projects?limit=100" '.data[].attributes.name'
  ```
- Second arg is a `jq` filter, applied per page. `--all` follows `links.next`; omit it for a first look.
- GET only. Don't add write calls (ignores, tags, deletes) without the user's explicit OK.
- Never print or echo `SNYK_TOKEN`.

## Setup and failures

- Token: `SNYK_TOKEN` in `~/.agents/skills/.local.env` (gitignored). Get it from the Snyk web UI: Account settings → API token. Don't regenerate it; that breaks every tool already using it.
- 401 → token missing, expired, or revoked: ask the user for a fresh one.
- Non-US region → set `SNYK_API_HOST` in the same file (`https://api.eu.snyk.io`, `https://api.au.snyk.io`, `https://api.us.snyk.io`). The web UI host shows the region (`app.eu.snyk.io` → EU).
- 404 on an endpoint that exists → `version` is newer than the API supports, or the org ID is wrong. Override per call with `&version=YYYY-MM-DD` or set `SNYK_API_VERSION`.

## Query rules

- Org paths need the org UUID, not the slug. Map slug → ID with `/rest/orgs`.
- Error 400 "must be at least 10" → raise `limit`. `/issues` rejects `limit` below 10. Max is 100.
- Encode reserved characters in query values, including commas in lists: `names=org%2Frepo`, `types=pip%2Cpoetry`. Some endpoints (`/projects`) reject them unencoded with a 400.
- Project names look like `<owner>/<repo>:<manifest path>`; one repo has one project per manifest. Find a repo's projects with `names_start_with=<owner>%2F<repo>`.
- `/rest/orgs/<org_id>/issues` filters:
  - `status=open`, `effective_severity_level=critical,high`, `type=package_vulnerability|code|license|cloud|custom`.
  - Per project: `scan_item.id=<project_id>&scan_item.type=project`.
- Issues carry no project name. Join through `relationships.scan_item.data.id` to `/rest/orgs/<org_id>/projects/<id>`. Fetch projects once, not one call per issue.
- Package and version live in `attributes.coordinates[].representations[].dependency`; CVE in `attributes.problems[]`; fixed versions in `coordinates[].remedies[].meta.data.fixed_in`.
- Dashboard link for a project: `https://app.snyk.io/org/<org_slug>/project/<project_id>` (swap host for other regions).
- A pip project shows old versions or misses packages from its manifest → Snyk resolved it with the org's Python version, not the app's. Git-imported pip projects resolve against the org setting (Settings → Languages → Python; default "Python 3.7"). Packages with no release for that version drop out of the graph silently. Compare with the project's `/v1/org/<org_id>/project/<id>/dep-graph`. The public API doesn't expose the setting; the web UI reads it from `/registry/org/<org_slug>/manage/languages/python`.
- `/v1/...` endpoints still work through the script, but most v1 listing endpoints are POST. Prefer REST.
- Counting across many pages: `--all` with `'.data|length'`, then sum. Big orgs have thousands of projects; filter server-side first.
