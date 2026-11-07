#!/usr/bin/env bash
# JavaScript each prerendered page loads, after `bun run build`. Skips the legacy polyfill
# chunk (loaded with noModule, so modern browsers never run it).
# Usage: bash scripts/route-sizes.sh
set -euo pipefail
cd "$(dirname "$0")/.."

printf "%-14s %8s %10s %9s\n" route scripts raw gzip
for f in .next/server/app/*.html; do
  route=$(basename "$f" .html)
  raw=0; gz=0; n=0
  while read -r src; do
    [ -n "$src" ] || continue
    path=".next${src#/_next}"
    raw=$((raw + $(wc -c < "$path")))
    gz=$((gz + $(gzip -9 -c "$path" | wc -c)))
    n=$((n + 1))
  done < <(grep -o '<script src="/_next/static/chunks/[^"]*\.js"[^>]*>' "$f" \
    | grep -v noModule | grep -o '/_next/static/chunks/[^"]*\.js' | sort -u)
  printf "%-14s %8d %8dKB %7dKB\n" "$route" "$n" $((raw / 1024)) $((gz / 1024))
done
