#!/usr/bin/env bash
# Instalação do Rufus num VPS Ubuntu que já tem Node 20+, PostgreSQL, nginx, PM2 e certbot.
# Não mexe em outros sites/apps do servidor (ex.: SGP): usa pasta, porta, banco, processo PM2
# e site nginx próprios. Rode como o usuário de deploy (o sudo pede senha quando precisa):
#
#   bash instalar.sh
#
# Homologação (dev.rufuspet.com.br, branch develop, com senha de acesso e sem envio de e-mail):
#
#   AMBIENTE=homologacao bash instalar.sh
#
# Pode ser rodado de novo se parar no meio: cada etapa pula o que já existe.
set -euo pipefail
umask 022  # arquivos do site precisam ser legíveis pelo nginx (www-data)

AMBIENTE="${AMBIENTE:-producao}"
case "$AMBIENTE" in
  producao)
    DOMINIO="${DOMINIO:-rufuspet.com.br}"; COM_WWW="${COM_WWW:-1}"
    APP_DIR="${APP_DIR:-/opt/rufuspet}"; PORTA="${PORTA:-3100}"
    DB="${DB:-rufus}"; DB_USER="${DB_USER:-rufus}"
    PEDIDOS_DIR="${PEDIDOS_DIR:-/var/lib/rufuspet/pedidos}"
    BRANCH="${BRANCH:-main}"; PM2_NOME="${PM2_NOME:-rufus-api}"; SITE="${SITE:-rufuspet}"
    SENHA_ACESSO="${SENHA_ACESSO:-0}"; ENVIA_EMAIL="${ENVIA_EMAIL:-1}"
    ;;
  homologacao)
    DOMINIO="${DOMINIO:-dev.rufuspet.com.br}"; COM_WWW="${COM_WWW:-0}"
    APP_DIR="${APP_DIR:-/opt/rufuspet-dev}"; PORTA="${PORTA:-3101}"
    DB="${DB:-rufus_dev}"; DB_USER="${DB_USER:-rufus_dev}"
    PEDIDOS_DIR="${PEDIDOS_DIR:-/var/lib/rufuspet-dev/pedidos}"
    BRANCH="${BRANCH:-develop}"; PM2_NOME="${PM2_NOME:-rufus-api-dev}"; SITE="${SITE:-rufuspet-dev}"
    SENHA_ACESSO="${SENHA_ACESSO:-1}"; ENVIA_EMAIL="${ENVIA_EMAIL:-0}"
    ;;
  *) printf 'AMBIENTE deve ser producao ou homologacao\n' >&2; exit 1 ;;
esac
REPO="${REPO:-https://github.com/multivacia/rufuspet.git}"
DB_PORTA="${DB_PORTA:-5432}"
SITE_NGINX="/etc/nginx/sites-available/$SITE"
HTPASSWD="/etc/nginx/$SITE.htpasswd"
SMTP_HOST_PADRAO=""; [ "$ENVIA_EMAIL" = 1 ] && SMTP_HOST_PADRAO=smtp.gmail.com
if [ "$COM_WWW" = 1 ]; then
  SERVER_NAMES="$DOMINIO www.$DOMINIO"; CERT_DOMINIOS=(-d "$DOMINIO" -d "www.$DOMINIO")
else
  SERVER_NAMES="$DOMINIO"; CERT_DOMINIOS=(-d "$DOMINIO")
fi

passo() { printf '\n==> %s\n' "$*"; }
falha() { printf '\nERRO: %s\n' "$*" >&2; exit 1; }

passo "Conferindo pré-requisitos"
for cmd in git node npm pm2 nginx psql certbot openssl ss; do
  command -v "$cmd" >/dev/null || falha "comando '$cmd' não encontrado"
done
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)' || falha "precisa de Node 20 ou superior"
sudo -v
if ! pm2 describe "$PM2_NOME" >/dev/null 2>&1 && ss -ltn | grep -qE "[:.]$PORTA\b"; then
  falha "a porta $PORTA já está em uso; rode com PORTA=outra bash instalar.sh"
fi
echo "ok ($AMBIENTE: $DOMINIO, $APP_DIR, porta $PORTA, banco $DB, branch $BRANCH, PM2 $PM2_NOME)"

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

# E-mail (Gmail). Com SMTP_HOST vazio nenhum e-mail é enviado (homologação). Para enviar: preencha SMTP_USER, SMTP_PASS (senha de app) e EMAIL_REMETENTE, depois: pm2 restart $PM2_NOME
SMTP_HOST=$SMTP_HOST_PADRAO
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

passo "Subindo a API no PM2 ($PM2_NOME, porta $PORTA)"
cd "$APP_DIR/api"
if pm2 describe "$PM2_NOME" >/dev/null 2>&1; then
  pm2 restart "$PM2_NOME" --update-env
else
  pm2 start src/server.js --name "$PM2_NOME" --time
fi
pm2 save
for _ in 1 2 3 4 5 6 7 8 9 10; do
  curl -fsS "http://127.0.0.1:$PORTA/health" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS "http://127.0.0.1:$PORTA/health" || falha "a API não respondeu; veja: pm2 logs $PM2_NOME --lines 50"
echo

passo "Site no nginx ($DOMINIO)"
if [ -e "$SITE_NGINX" ]; then
  echo "já existe: $SITE_NGINX (não alterado)"
else
  AUTH=""
  if [ "$SENHA_ACESSO" = 1 ]; then
    if [ ! -e "$HTPASSWD" ]; then
      read -rp "Usuário para acessar $DOMINIO: " ACESSO_USUARIO
      read -rsp "Senha para acessar $DOMINIO: " ACESSO_SENHA && echo
      [ -n "$ACESSO_USUARIO" ] && [ -n "$ACESSO_SENHA" ] || falha "usuário e senha de acesso são obrigatórios"
      printf '%s:%s\n' "$ACESSO_USUARIO" "$(printf '%s' "$ACESSO_SENHA" | openssl passwd -apr1 -stdin)" \
        | sudo tee "$HTPASSWD" >/dev/null
      sudo chown root:www-data "$HTPASSWD"
      sudo chmod 640 "$HTPASSWD"
    fi
    AUTH="    # Ambiente de homologação: exige usuário e senha (arquivo $HTPASSWD)
    auth_basic \"Rufus - homologacao\";
    auth_basic_user_file $HTPASSWD;"
  fi
  sed -e "s#__SERVER_NAMES__#$SERVER_NAMES#g" -e "s#__APP_DIR__#$APP_DIR#g" -e "s#__PORTA__#$PORTA#g" \
    "$APP_DIR/deploy/nginx-rufuspet.conf" \
    | awk -v auth="$AUTH" '$0 == "__AUTH__" { if (auth != "") print auth; next } { print }' \
    | sudo tee "$SITE_NGINX" >/dev/null
  sudo ln -sf "$SITE_NGINX" "/etc/nginx/sites-enabled/$SITE"
  if ! sudo nginx -t; then
    sudo rm -f "/etc/nginx/sites-enabled/$SITE" "$SITE_NGINX"
    falha "configuração do nginx inválida; o site $SITE foi removido e nada mais foi alterado"
  fi
  sudo systemctl reload nginx
  echo "ok"
fi

passo "HTTPS"
IP_SERVIDOR="$(curl -fsS -4 ifconfig.me || true)"
IP_DOMINIO="$(getent ahostsv4 "$DOMINIO" | awk 'NR==1{print $1}' || true)"
if [ -n "$IP_SERVIDOR" ] && [ "$IP_DOMINIO" = "$IP_SERVIDOR" ]; then
  sudo certbot --nginx "${CERT_DOMINIOS[@]}" --redirect --non-interactive --agree-tos \
    --register-unsafely-without-email --keep-until-expiring \
    || echo "certbot falhou; rode de novo depois: sudo certbot --nginx ${CERT_DOMINIOS[*]} --redirect"
else
  echo "O DNS de $DOMINIO ainda não aponta para este servidor ($IP_SERVIDOR; DNS: ${IP_DOMINIO:-nenhum})."
  echo "Quando apontar, rode: sudo certbot --nginx ${CERT_DOMINIOS[*]} --redirect"
fi

passo "Pronto"
cat <<FIM
Próximos passos:
  1. Criar o usuário do admin (a senha não fica no histórico):
       cd $APP_DIR/api && read -rsp 'Senha do admin: ' ADMIN_SENHA && echo && ADMIN_SENHA="\$ADMIN_SENHA" node scripts/criar-admin.js SEU_EMAIL
  2. E-mail (só produção): preencha SMTP_USER, SMTP_PASS e EMAIL_REMETENTE em $ENV_API e rode: pm2 restart $PM2_NOME
  3. Abrir https://$DOMINIO/admin → Loja e preencher os dados da loja e os e-mails que recebem os pedidos.
FIM
