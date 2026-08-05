#!/usr/bin/env bash
#
# Deploy this working tree to the production server.
#
#   ./deploy.sh
#
# Copies the source (uncommitted work included), installs, syncs the database
# schema, builds, and restarts the API. Nothing is restarted unless both builds
# succeed, so a broken build leaves the running site untouched.
#
# Auth: uses an SSH key if you have one on the server. Otherwise put the root
# password in .deploy-pass (gitignored) or export DEPLOY_PASS.

set -euo pipefail

SERVER="root@213.199.54.61"
REMOTE="/var/www/exchange-app"
APP="exchange-api"
PORT=4010
SITE="https://exchange.ibahsoun.com"

cd "$(dirname "$0")"

# ── SSH auth ────────────────────────────────────────────────
if [[ -z "${DEPLOY_PASS:-}" && -f .deploy-pass ]]; then
  DEPLOY_PASS="$(tr -d '\n' < .deploy-pass)"
fi

if [[ -n "${DEPLOY_PASS:-}" ]]; then
  command -v sshpass >/dev/null || { echo "sshpass not installed: brew install sshpass"; exit 1; }
  export SSHPASS="$DEPLOY_PASS"
  SSH="sshpass -e ssh -o StrictHostKeyChecking=no"
else
  SSH="ssh -o StrictHostKeyChecking=no"
fi

run() { $SSH "$SERVER" "$@"; }

step() { printf '\n\033[1;34m▶ %s\033[0m\n' "$1"; }

# ── 1. Copy source ──────────────────────────────────────────
# Excluded paths are never deleted on the server, so the server's .env,
# node_modules and previous dist survive.
step "Copying source to $SERVER:$REMOTE"
rsync -az --delete \
  --exclude 'node_modules' --exclude '.git' --exclude 'dist' --exclude '.env' \
  --exclude '*.log' --exclude '.turbo' --exclude '.deploy-pass' \
  --exclude 'exchange-app-new' --exclude '*.pdf' \
  -e "$SSH" ./ "$SERVER:$REMOTE/"

# ── 2. Dependencies ─────────────────────────────────────────
step "Installing dependencies"
run "cd $REMOTE && pnpm install --frozen-lockfile 2>&1 | tail -3"

# ── 3. Database ─────────────────────────────────────────────
# db push refuses destructive changes; run it by hand if you intend one.
step "Syncing database schema"
run "cd $REMOTE/apps/api && npx prisma generate >/dev/null 2>&1 && npx prisma db push 2>&1 | grep -Ev '^$' | tail -3"

# ── 4. Build (must both pass before anything restarts) ──────
step "Building API"
run "cd $REMOTE && pnpm --filter @exchange/api build 2>&1 | tail -3"

step "Building web"
run "cd $REMOTE && pnpm --filter @exchange/web build 2>&1 | tail -4"

# ── 5. Restart API ──────────────────────────────────────────
step "Restarting $APP"
run "pm2 restart $APP --update-env >/dev/null && pm2 save >/dev/null && echo restarted"

# ── 6. Verify ───────────────────────────────────────────────
# The API needs ~10s to boot, so poll rather than sleeping a fixed amount.
step "Verifying"
health=000
for _ in $(seq 1 20); do
  sleep 3
  health=$(run "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$PORT/api/health" || true)
  [[ "$health" == "200" ]] && break
done
# Port 80 always 301s to HTTPS (certbot --redirect), so check the TLS vhost.
# --resolve pins the domain to localhost so the request never leaves the box.
page=$(run "curl -s -o /dev/null -w '%{http_code}' --resolve exchange.ibahsoun.com:443:127.0.0.1 https://exchange.ibahsoun.com/" || true)
bundle=$(run "curl -s --resolve exchange.ibahsoun.com:443:127.0.0.1 https://exchange.ibahsoun.com/ | grep -o 'assets/index-[^\"]*\.js'" || true)

echo "  api health : $health"
echo "  site       : $page"
echo "  bundle     : $bundle"

if [[ "$health" != "200" || "$page" != "200" ]]; then
  echo -e "\n\033[1;31m✗ Deploy finished but checks failed. Logs: ssh $SERVER 'pm2 logs $APP --lines 40'\033[0m"
  exit 1
fi

echo -e "\n\033[1;32m✓ Deployed — $SITE\033[0m"
echo "  Hard-refresh the browser (Cmd+Shift+R) to pick up a new bundle."
