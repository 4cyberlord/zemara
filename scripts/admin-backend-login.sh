#!/bin/bash
# admin-backend-login.sh — LaunchAgent wrapper for the prophet-roja-admin
# Next.js backend (the /api/admin/* REST API Zemara reads/writes through).
#
# Started at login by ~/Library/LaunchAgents/com.zemara.prophet-admin.plist.
# If something already serves the health endpoint (e.g. `pnpm dev:all`
# started it by hand), exit cleanly so the agent does not fight it;
# KeepAlive(SuccessfulExit=false) only relaunches after a crash.

set -u

export PATH="/Users/cyberlord/.nvm/versions/node/v24.15.0/bin:/usr/local/bin:/usr/bin:/bin"

ADMIN_DIR="${PROPHET_ADMIN_DIR:-/Users/cyberlord/code/prophet-roja-admin}"
ADMIN_PORT="${PROPHET_ADMIN_PORT:-3000}"
HEALTH_URL="http://127.0.0.1:${ADMIN_PORT}/api/health"

if curl -sf --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
  echo "[admin-backend-login] already healthy at $HEALTH_URL — nothing to do"
  exit 0
fi

if [ ! -d "$ADMIN_DIR" ]; then
  echo "[admin-backend-login] admin checkout missing at $ADMIN_DIR" >&2
  exit 1
fi

echo "[admin-backend-login] starting admin backend in $ADMIN_DIR on port $ADMIN_PORT"
cd "$ADMIN_DIR" || exit 1
exec npm run dev
