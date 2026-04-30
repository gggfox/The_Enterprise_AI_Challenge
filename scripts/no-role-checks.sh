#!/usr/bin/env bash
# Forbid direct role checks outside the central ABAC config.
#
# All authorization decisions must flow through `can(...)` /
# `canMaybe(...)` / `hasPermission(...)` exported from
# `packages/shared/src/auth/`. Any usage of `.roles.includes(...)` or
# direct comparisons like `user.role === 'admin'` outside that folder
# bypasses the centralized matrix and is rejected by this lint.
#
# Run from the repo root via `pnpm lint:no-role-checks` (also wired
# into the husky pre-commit hook).

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

# Patterns that signal an authorization decision being made outside the
# permissions matrix. Tuned to be conservative -- false positives are
# better than letting a scattered check slip in.
PATTERNS=(
  '\.roles\.includes\('
  '\.role\s*===\s*['\''"]'
  "user\.role\s*===\s*['\"](admin|moderator|user)['\"]"
)

# Folders / files that are allowed to perform raw role checks.
ALLOWED_PATHS=(
  ':!packages/shared/src/auth/**'
  ':!references/**'
  ':!**/node_modules/**'
  ':!**/_generated/**'
  ':!**/dist/**'
  ':!**/.output/**'
  ':!scripts/no-role-checks.sh'
)

failed=0
for pattern in "${PATTERNS[@]}"; do
  matches=$(git ls-files -z -- '*.ts' '*.tsx' "${ALLOWED_PATHS[@]}" \
    | xargs -0 grep -nE "$pattern" 2>/dev/null || true)
  if [ -n "$matches" ]; then
    if [ $failed -eq 0 ]; then
      echo "[no-role-checks] direct role checks must go through can()/hasPermission()" >&2
    fi
    echo "$matches" >&2
    failed=1
  fi
done

if [ $failed -ne 0 ]; then
  echo >&2
  echo "Move these to packages/shared/src/auth/permissions.ts as new" >&2
  echo "permissions, then call \`can(user, action, resource, data)\`." >&2
  exit 1
fi
