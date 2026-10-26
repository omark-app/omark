#!/bin/bash
# SessionStart hook: in Claude cloud sessions only, make sure dependencies and the Playwright browsers
# are installed, so the session can run the full suite. Never blocks the session.
[ "$CLAUDE_CODE_REMOTE" = "true" ] || exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0

log=$(mktemp)
fail() { echo "Omark session start: $1 failed (see $log)"; exit 0; }

corepack enable >>"$log" 2>&1 || true
if [ ! -d node_modules ] || [ pnpm-lock.yaml -nt node_modules/.modules.yaml ]; then
  pnpm install --frozen-lockfile >>"$log" 2>&1 || fail "pnpm install"
fi

# The browsers this Playwright version needs; skipped when the setup script already installed them.
if ! (cd apps/tasks && node -e "
  const { chromium, webkit } = require('@playwright/test');
  const fs = require('fs');
  process.exit([chromium, webkit].every((b) => fs.existsSync(b.executablePath())) ? 0 : 1);
") >>"$log" 2>&1; then
  (cd apps/tasks && pnpm exec playwright install --with-deps chromium webkit) >>"$log" 2>&1 || fail "playwright install"
fi
rm -f "$log"
exit 0
