#!/usr/bin/env bash
set -e

query="$*"
if [ -z "$query" ]; then
  echo '{"error":"Missing keyword. Please provide search keyword."}'
  exit 0
fi

max_results="${MAX_RESULTS:-8}"
per_site="${PER_SITE:-3}"
sites=("stackoverflow.com" "github.com" "developer.mozilla.org" "npmjs.com" "nodejs.org")

escape_json() {
  echo "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

results=""
count=0

for site in "${sites[@]}"; do
  if [ "$count" -ge "$max_results" ]; then
    break
  fi

  html="$(curl -sL -A "Mozilla/5.0" --get --data-urlencode "q=site:${site} ${query}" "https://duckduckgo.com/html/")"
  lines="$(echo "$html" | grep -oE '<a rel="nofollow" class="result__a" href="[^"]+"[^>]*>[^<]+' | head -n "$per_site")"
  while IFS=$'\t' read -r url title; do
    if [ -z "$url" ] || [ -z "$title" ]; then
      continue
    fi
    if [ "$count" -ge "$max_results" ]; then
      break
    fi
    eurl="$(escape_json "$url")"
    etitle="$(escape_json "$title")"
    esnippet="$(escape_json "source: ${site}")"
    entry="{\"title\":\"${etitle}\",\"url\":\"${eurl}\",\"snippet\":\"${esnippet}\"}"
    if [ -z "$results" ]; then
      results="$entry"
    else
      results="${results},${entry}"
    fi
    count=$((count+1))
  done < <(echo "$lines" | sed -E 's/.*href="([^"]+)".*>(.*)/\1\t\2/')
done

eq="$(escape_json "$query")"
echo "{\"query\":\"${eq}\",\"results\":[${results}]}"
