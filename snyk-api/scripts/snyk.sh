#!/usr/bin/env bash
# Read-only Snyk API client. Usage:
#   snyk.sh <path> [jq-filter]   e.g. snyk.sh "/rest/orgs?limit=100" '.data[].attributes.slug'
#   snyk.sh --all <path> [jq-filter]   follow REST pagination (links.next), print one JSON page per line
# Loads SNYK_TOKEN (and optional SNYK_API_HOST, SNYK_API_VERSION) from ../../.local.env.
set -euo pipefail

env_file="$(cd "$(dirname "$0")/../.." && pwd)/.local.env"
if [[ -f "$env_file" ]]; then set -a; . "$env_file"; set +a; fi
: "${SNYK_TOKEN:?SNYK_TOKEN missing; add it to $env_file}"
host="${SNYK_API_HOST:-https://api.snyk.io}"
version="${SNYK_API_VERSION:-2026-03-25}"

all=false
if [[ "${1:-}" == "--all" ]]; then all=true; shift; fi
path="${1:?usage: snyk.sh [--all] <path> [jq-filter]}"
filter="${2:-.}"

# REST endpoints require ?version=; v1 endpoints reject it.
if [[ "$path" == /rest/* && "$path" != *version=* ]]; then
  [[ "$path" == *\?* ]] && path+="&version=$version" || path+="?version=$version"
fi

fetch() {
  local out code accept="application/json"
  [[ "$1" == /rest/* ]] && accept="application/vnd.api+json"
  out=$(curl -sS -w $'\n%{http_code}' -H "Authorization: token $SNYK_TOKEN" \
    -H "Accept: $accept" "$host$1")
  code="${out##*$'\n'}"; out="${out%$'\n'*}"
  if [[ "$code" != 2* ]]; then echo "HTTP $code for $1" >&2; echo "$out" >&2; exit 1; fi
  printf '%s' "$out"
}

next="$path"
while [[ -n "$next" ]]; do
  page=$(fetch "$next")
  jq -c "$filter" <<<"$page"
  $all || break
  next=$(jq -r '.links.next // empty' <<<"$page")
  # links.next may be absolute path with or without /rest prefix
  [[ -n "$next" && "$next" != /rest/* ]] && next="/rest$next"
done
