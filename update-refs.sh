#!/usr/bin/env bash
# Refresh every reference clone under references/ to its upstream tip.
# References are read-only inspiration; we fast-forward only.

set -euo pipefail

cd "$(dirname "$0")"

if [ ! -d references ]; then
  echo "No references/ directory found at $(pwd)" >&2
  exit 1
fi

shopt -s nullglob
dirs=(references/*/)

if [ ${#dirs[@]} -eq 0 ]; then
  echo "No reference clones found under references/" >&2
  exit 0
fi

for d in "${dirs[@]}"; do
  if [ ! -d "$d/.git" ]; then
    echo "Skipping $d (not a git repo)"
    continue
  fi
  echo "==> Updating $d"
  git -C "$d" pull --ff-only
done

echo "All references up to date."
