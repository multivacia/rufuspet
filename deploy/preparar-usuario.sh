#!/usr/bin/env bash
# Prepara o deploy automático (GitHub Actions) no VPS. Rodar UMA vez, como o usuário que hoje
# administra o Rufus (o mesmo que rodou instalar.sh; o sudo pede senha quando precisa),
# DEPOIS de instalar a homologação (AMBIENTE=homologacao bash instalar.sh):
#
#   bash /opt/rufuspet-dev/deploy/preparar-usuario.sh
#
# O que faz:
#   1. Cria o usuário "rufus" (sem senha, sem sudo), dono das instalações do Rufus e dos processos PM2.
#   2. Instala /usr/local/bin/rufus-deploy (dono root), o único comando que a chave de deploy executa.
#   3. Gera a chave SSH do GitHub Actions, presa a esse comando (sem shell, sem túnel), e mostra
#      os valores para os Secrets do GitHub.
#   4. Transfere produção e homologação para o usuário rufus: pastas, pedidos e backups
#      (cópia; os originais ficam) e processos PM2. A API fica fora do ar por poucos segundos.
#   5. Configura o PM2 do rufus para subir junto com o servidor.
# Não mexe em outros sistemas do servidor (ex.: SGP). Pode ser rodado de novo: pula o que já foi feito.
set -euo pipefail

USUARIO="${USUARIO:-rufus}"
SSH_PORTA="${SSH_PORTA:-22}"
ORIGEM="$(cd "$(dirname "$0")" && pwd)"
# nome PM2 | pasta da aplicação | pasta de dados (pedidos)
APPS=(
  "rufus-api|/opt/rufuspet|/var/lib/rufuspet"
  "rufus-api-dev|/opt/rufuspet-dev|/var/lib/rufuspet-dev"
)

passo() { printf '\n==> %s\n' "$*"; }
falha() { printf '\nERRO: %s\n' "$*" >&2; exit 1; }
como_rufus() { sudo -u "$USUARIO" -H env PATH=/usr/local/bin:/usr/bin:/bin bash -c "$1"; }

passo "Pré-requisitos"
[ "$(id -un)" != "$USUARIO" ] || falha "rode com o seu usuário administrador, não com $USUARIO"
for cmd in sudo flock ssh-keygen curl pm2; do
  command -v "$cmd" >/dev/null || falha "comando '$cmd' não encontrado"
done
sudo -v
[ -d /opt/rufuspet-dev ] || falha "homologação não instalada; rode antes: AMBIENTE=homologacao bash $ORIGEM/instalar.sh"
echo "ok"

passo "Usuário $USUARIO"
if id "$USUARIO" >/dev/null 2>&1; then
  echo "já existe"
else
  sudo adduser --disabled-password --gecos "Rufus (deploy)" "$USUARIO"
fi
HOME_RUFUS="$(getent passwd "$USUARIO" | cut -d: -f6)"
for cmd in git node npm pm2 pg_dump curl flock; do
  como_rufus "command -v $cmd >/dev/null" \
    || falha "o usuário $USUARIO não encontra '$cmd' em /usr/local/bin:/usr/bin:/bin (Node instalado via nvm? instale globalmente)"
done
echo "ok (node $(como_rufus 'node -v'), pm2 $(como_rufus 'pm2 -v' | tail -1))"

passo "Comando de deploy"
sudo install -o root -g root -m 755 "$ORIGEM/rufus-deploy" /usr/local/bin/rufus-deploy
echo "/usr/local/bin/rufus-deploy"

passo "Chave SSH do GitHub Actions"
AUTH_KEYS="$HOME_RUFUS/.ssh/authorized_keys"
CHAVE_NOVA=""
if sudo test -s "$AUTH_KEYS" && sudo grep -q 'rufus-deploy' "$AUTH_KEYS"; then
  echo "já configurada em $AUTH_KEYS (para trocar, apague a linha e rode de novo)"
else
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  ssh-keygen -q -t ed25519 -N "" -C "github-actions-rufuspet" -f "$TMP/chave"
  sudo install -d -o "$USUARIO" -g "$USUARIO" -m 700 "$HOME_RUFUS/.ssh"
  printf 'command="/usr/local/bin/rufus-deploy",restrict %s\n' "$(cat "$TMP/chave.pub")" \
    | sudo tee -a "$AUTH_KEYS" >/dev/null
  sudo chown "$USUARIO": "$AUTH_KEYS"
  sudo chmod 600 "$AUTH_KEYS"
  CHAVE_NOVA="$(cat "$TMP/chave")"
  echo "chave criada e autorizada só para rufus-deploy"
fi
PERMITIDOS="$(sudo sshd -T 2>/dev/null | awk '$1=="allowusers"{ $1=""; print }')"
if [ -n "$PERMITIDOS" ] && ! grep -qw "$USUARIO" <<<"$PERMITIDOS"; then
  echo "ATENÇÃO: o sshd só aceita os usuários:$PERMITIDOS"
  echo "Inclua $USUARIO em AllowUsers (/etc/ssh/sshd_config) e rode: sudo systemctl reload ssh"
fi

passo "Transferindo as instalações para $USUARIO"
for app in "${APPS[@]}"; do
  IFS='|' read -r NOME DIR DADOS <<<"$app"
  [ -d "$DIR" ] || { echo "$NOME: $DIR não existe, pulando"; continue; }
  if como_rufus "pm2 describe $NOME >/dev/null 2>&1"; then
    echo "$NOME: já roda como $USUARIO"
    continue
  fi
  sudo chown -R "$USUARIO": "$DIR"
  [ -d "$DADOS" ] && sudo chown -R "$USUARIO": "$DADOS"
  BKP="$HOME/backups/$(basename "$DIR")"
  if [ -d "$BKP" ]; then
    sudo install -d -o "$USUARIO" -g "$USUARIO" -m 700 "$HOME_RUFUS/backups" "$HOME_RUFUS/backups/$(basename "$DIR")"
    sudo cp -a "$BKP/." "$HOME_RUFUS/backups/$(basename "$DIR")/"
    sudo chown -R "$USUARIO": "$HOME_RUFUS/backups"
  fi
  pm2 describe "$NOME" >/dev/null 2>&1 && pm2 delete "$NOME" >/dev/null
  como_rufus "cd $DIR/api && pm2 start src/server.js --name $NOME --time >/dev/null"
  PORTA="$(sudo grep -E '^PORT=' "$DIR/api/.env" | cut -d= -f2)"
  OK=""
  for _ in $(seq 1 15); do
    curl -fsS "http://127.0.0.1:$PORTA/health" >/dev/null 2>&1 && { OK=1; break; }
    sleep 1
  done
  [ -n "$OK" ] || falha "$NOME não respondeu na porta $PORTA; veja: sudo -u $USUARIO -H pm2 logs $NOME --lines 50"
  echo "$NOME: rodando como $USUARIO (porta $PORTA)"
done
pm2 save >/dev/null   # tira os processos do Rufus da lista de reinício do seu usuário
como_rufus "pm2 save >/dev/null"

passo "PM2 do $USUARIO subindo junto com o servidor"
sudo env PATH="/usr/local/bin:/usr/bin:/bin" "$(command -v pm2)" startup systemd -u "$USUARIO" --hp "$HOME_RUFUS" >/dev/null
echo "ok (pm2-$USUARIO.service)"

passo "Teste do comando de deploy"
como_rufus "rufus-deploy dev" >/dev/null || falha "o deploy de teste da homologação falhou; rode: sudo -u $USUARIO -H rufus-deploy dev"
echo "homologação atualizada pelo rufus-deploy: ok"

passo "Pronto. Cadastre no GitHub (Settings → Secrets and variables → Actions → New repository secret):"
IP="$(curl -fsS -4 ifconfig.me || echo IP_DO_VPS)"
HOST_KH="$IP"; [ "$SSH_PORTA" = 22 ] || HOST_KH="[$IP]:$SSH_PORTA"
cat <<FIM

VPS_HOST = $IP
VPS_PORTA = $SSH_PORTA
VPS_USUARIO = $USUARIO
VPS_KNOWN_HOSTS =
$(for f in /etc/ssh/ssh_host_*_key.pub; do echo "$HOST_KH $(cut -d' ' -f1,2 "$f")"; done)
FIM
if [ -n "$CHAVE_NOVA" ]; then
  cat <<FIM
VPS_SSH_CHAVE = (copie tudo, inclusive as linhas BEGIN/END; ela não fica salva no servidor)
$CHAVE_NOVA
FIM
else
  echo "VPS_SSH_CHAVE = (a cadastrada antes; para gerar outra, apague a linha rufus-deploy de $AUTH_KEYS e rode de novo)"
fi
