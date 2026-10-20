#!/usr/bin/env bash
# Instalação do Rufus num VPS Ubuntu que já tem Node 20+, PostgreSQL, nginx, PM2 e certbot.
# Não mexe em outros sites/apps do servidor (ex.: SGP): usa pasta, porta, banco, processo PM2
# e site nginx próprios. Rode como o usuário de deploy (o sudo pede senha quando precisa):
#
#   bash instalar.sh
#
# Pode ser rodado de novo se parar no meio: cada etapa pula o que já existe.
set -euo pipefail
umask 022  # arquivos do site precisam ser legíveis pelo nginx (www-data)

DOMINIO="${DOMINIO:-rufuspet.com.br}"
APP_DIR="${APP_DIR:-/opt/rufuspet}"
PORTA="${PORTA:-3100}"
DB="${DB:-rufus}"
DB_USER="${DB_USER:-rufus}"
PEDIDOS_DIR="${PEDIDOS_DIR:-/var/lib/rufuspet/pedidos}"
REPO="${REPO:-https://github.com/multivacia/rufuspet.git}"
BRANCH="${BRANCH:-main}"
DB_PORTA="${DB_PORTA:-5432}"
SITE_NGINX=/etc/nginx/sites-available/rufuspet

passo() { printf '\n==> %s\n' "$*"; }
falha() { printf '\nERRO: %s\n' "$*" >&2; exit 1; }

passo "Conferindo pré-requisitos"
for cmd in git node npm pm2 nginx psql certbot openssl ss; do
  command -v "$cmd" >/dev/null || falha "comando '$cmd' não encontrado"
done
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)' || falha "precisa de Node 20 ou superior"
sudo -v
if ! pm2 describe rufus-api >/dev/null 2>&1 && ss -ltn | grep -qE "[:.]$PORTA\b"; then
  falha "a porta $PORTA já está em uso; rode com PORTA=outra bash instalar.sh"
fi
echo "ok"

passo "Código em $APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  sudo mkdir -p "$APP_DIR"
  sudo chown "$USER": "$APP_DIR"
  git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
else
  echo "já existe (para atualizar, use deploy/atualizar.sh)"
fi
sudo mkdir -p "$PEDIDOS_DIR"
sudo chown "$USER": "$PEDIDOS_DIR"
chmod 750 "$PEDIDOS_DIR"

passo "Banco de dados '$DB'"
ENV_API="$APP_DIR/api/.env"
if [ -f "$ENV_API" ]; then
  echo "api/.env já existe: banco considerado configurado"
else
  if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER'" | grep -q 1; then
    falha "o usuário '$DB_USER' já existe no PostgreSQL e não há api/.env; rode com DB_USER=outro DB=outro"
  fi
  if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB'" | grep -q 1; then
    falha "o banco '$DB' já existe no PostgreSQL e não há api/.env; rode com DB=outro"
  fi
  SENHA_DB="$(openssl rand -hex 24)"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q \
    -c "CREATE ROLE $DB_USER LOGIN PASSWORD '$SENHA_DB'" \
    -c "CREATE DATABASE $DB OWNER $DB_USER"
  umask 077
  cat > "$ENV_API" <<ENV
DATABASE_URL=postgres://$DB_USER:$SENHA_DB@127.0.0.1:$DB_PORTA/$DB
JWT_SECRET=$(openssl rand -hex 32)
PORT=$PORTA
NODE_ENV=production
FUSO_HORARIO=America/Sao_Paulo
PEDIDOS_PASTA=$PEDIDOS_DIR
PEDIDOS_LIMITE_POR_HORA=10

# Quem recebe os pedidos se o campo do admin (tela Loja) estiver vazio.
EMAILS_INTERNOS=

# E-mail (Gmail): preencha SMTP_USER, SMTP_PASS (senha de app) e EMAIL_REMETENTE, depois: pm2 restart rufus-api
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=
EMAIL_REMETENTE=
ENV
  umask 022
  echo "banco criado; senha gerada e gravada só em api/.env"
fi

passo "Instalando dependências e aplicando migrations"
cd "$APP_DIR/api"
npm ci --omit=dev --no-audit --no-fund
npm run migrate

passo "Gerando o site"
cd "$APP_DIR/web"
npm ci --no-audit --no-fund
npm run build
chmod -R a+rX "$APP_DIR/web/dist"

passo "Subindo a API no PM2 (rufus-api, porta $PORTA)"
cd "$APP_DIR/api"
if pm2 describe rufus-api >/dev/null 2>&1; then
  pm2 restart rufus-api --update-env
else
  pm2 start src/server.js --name rufus-api --time
fi
pm2 save
for _ in 1 2 3 4 5 6 7 8 9 10; do
  curl -fsS "http://127.0.0.1:$PORTA/health" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS "http://127.0.0.1:$PORTA/health" || falha "a API não respondeu; veja: pm2 logs rufus-api --lines 50"
echo

passo "Site no nginx ($DOMINIO)"
if [ -e "$SITE_NGINX" ]; then
  echo "já existe: $SITE_NGINX (não alterado)"
else
  sed -e "s#__DOMINIO__#$DOMINIO#g" -e "s#__APP_DIR__#$APP_DIR#g" -e "s#__PORTA__#$PORTA#g" \
    "$APP_DIR/deploy/nginx-rufuspet.conf" | sudo tee "$SITE_NGINX" >/dev/null
  sudo ln -sf "$SITE_NGINX" /etc/nginx/sites-enabled/rufuspet
  if ! sudo nginx -t; then
    sudo rm -f /etc/nginx/sites-enabled/rufuspet "$SITE_NGINX"
    falha "configuração do nginx inválida; o site do Rufus foi removido e nada mais foi alterado"
  fi
  sudo systemctl reload nginx
  echo "ok"
fi

passo "HTTPS"
IP_SERVIDOR="$(curl -fsS -4 ifconfig.me || true)"
IP_DOMINIO="$(getent ahostsv4 "$DOMINIO" | awk 'NR==1{print $1}' || true)"
if [ -n "$IP_SERVIDOR" ] && [ "$IP_DOMINIO" = "$IP_SERVIDOR" ]; then
  sudo certbot --nginx -d "$DOMINIO" -d "www.$DOMINIO" --redirect --non-interactive --agree-tos \
    --register-unsafely-without-email --keep-until-expiring \
    || echo "certbot falhou; rode de novo depois: sudo certbot --nginx -d $DOMINIO -d www.$DOMINIO --redirect"
else
  echo "O DNS de $DOMINIO ainda não aponta para este servidor ($IP_SERVIDOR; DNS: ${IP_DOMINIO:-nenhum})."
  echo "Quando apontar, rode: sudo certbot --nginx -d $DOMINIO -d www.$DOMINIO --redirect"
fi

passo "Pronto"
cat <<FIM
Próximos passos:
  1. Criar o usuário do admin (a senha não fica no histórico):
       cd $APP_DIR/api && read -rsp 'Senha do admin: ' ADMIN_SENHA && echo && ADMIN_SENHA="\$ADMIN_SENHA" node scripts/criar-admin.js SEU_EMAIL
  2. E-mail: preencha SMTP_USER, SMTP_PASS e EMAIL_REMETENTE em $ENV_API e rode: pm2 restart rufus-api
  3. Abrir https://$DOMINIO/admin → Loja e preencher os dados da loja e os e-mails que recebem os pedidos.
FIM
