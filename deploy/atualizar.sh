#!/usr/bin/env bash
# Atualiza o Rufus para a versão mais recente do main: backup do banco, código, migrations, build e restart.
#   bash /opt/rufuspet/deploy/atualizar.sh
set -euo pipefail
umask 022  # arquivos do site precisam ser legíveis pelo nginx (www-data)

APP_DIR="${APP_DIR:-/opt/rufuspet}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/rufuspet}"

passo() { printf '\n==> %s\n' "$*"; }

cd "$APP_DIR"

passo "Backup do banco"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
DATABASE_URL="$(grep -E '^DATABASE_URL=' api/.env | cut -d= -f2-)"
ARQUIVO="$BACKUP_DIR/rufus-$(date +%Y%m%d-%H%M%S).sql.gz"
(umask 077; pg_dump "$DATABASE_URL" | gzip > "$ARQUIVO") # só o backup fica restrito ao dono
echo "backup: $ARQUIVO"

passo "Código"
git fetch origin main
git checkout main
git merge --ff-only origin/main
git log --oneline -1

passo "API"
cd "$APP_DIR/api"
npm ci --omit=dev --no-audit --no-fund
npm run migrate

passo "Site"
cd "$APP_DIR/web"
npm ci --no-audit --no-fund
npm run build
chmod -R a+rX "$APP_DIR/web/dist"

passo "Reiniciando"
pm2 restart rufus-api --update-env
sleep 2
PORTA="$(grep -E '^PORT=' "$APP_DIR/api/.env" | cut -d= -f2)"
curl -fsS "http://127.0.0.1:${PORTA:-3100}/health" && echo
echo "Atualizado."
