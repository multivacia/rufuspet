#!/usr/bin/env bash
# Atualiza uma instalação do Rufus para a versão mais recente da branch:
# backup do banco, código (só fast-forward), migrations, build e restart.
#
#   Produção:     bash /opt/rufuspet/deploy/atualizar.sh
#   Homologação:  APP_DIR=/opt/rufuspet-dev BRANCH=develop PM2_NOME=rufus-api-dev bash /opt/rufuspet-dev/deploy/atualizar.sh
#
# O deploy automático (GitHub Actions) chama este script via /usr/local/bin/rufus-deploy.
set -euo pipefail
umask 022  # arquivos do site precisam ser legíveis pelo nginx (www-data)

# Tudo dentro de main(): o bash lê o arquivo inteiro antes de executar, então o
# "git merge" abaixo pode trocar este próprio arquivo sem quebrar a execução atual.
main() {
  local APP_DIR="${APP_DIR:-/opt/rufuspet}"
  local BRANCH="${BRANCH:-main}"
  local PM2_NOME="${PM2_NOME:-rufus-api}"
  local BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/$(basename "$APP_DIR")}"

  cd "$APP_DIR"

  passo "Backup do banco"
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  local DATABASE_URL ARQUIVO
  DATABASE_URL="$(grep -E '^DATABASE_URL=' api/.env | cut -d= -f2-)"
  ARQUIVO="$BACKUP_DIR/rufus-$(date +%Y%m%d-%H%M%S).sql.gz"
  (umask 077; pg_dump "$DATABASE_URL" | gzip > "$ARQUIVO") # só o backup fica restrito ao dono
  echo "backup: $ARQUIVO"
  # mantém os 30 backups mais recentes
  ls -1t "$BACKUP_DIR"/rufus-*.sql.gz 2>/dev/null | tail -n +31 | xargs -r rm -f

  passo "Código ($BRANCH)"
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git merge --ff-only "origin/$BRANCH"
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

  passo "Reiniciando $PM2_NOME"
  pm2 restart "$PM2_NOME" --update-env
  local PORTA
  PORTA="$(grep -E '^PORT=' "$APP_DIR/api/.env" | cut -d= -f2)"
  for _ in $(seq 1 15); do
    if curl -fsS "http://127.0.0.1:${PORTA:-3100}/health"; then
      echo
      echo "Atualizado."
      return 0
    fi
    sleep 1
  done
  echo "ERRO: a API não respondeu ao /health; veja: pm2 logs $PM2_NOME --lines 50" >&2
  return 1
}

passo() { printf '\n==> %s\n' "$*"; }

main "$@"
