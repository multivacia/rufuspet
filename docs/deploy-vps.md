# Deploy no VPS (Ubuntu)

O VPS já tem Node 20+, PostgreSQL, nginx, PM2 e certbot, e roda **outros sistemas (SGP)**.
O Rufus usa recursos próprios e não altera os demais. Há dois ambientes, publicados automaticamente
pelo GitHub Actions (seção [Deploy automático](#deploy-automático)):

| Recurso | Produção (branch `main`) | Homologação (branch `develop`) |
|---|---|---|
| Endereço | `rufuspet.com.br` e `www` | `dev.rufuspet.com.br` (com usuário e senha) |
| Pasta | `/opt/rufuspet` | `/opt/rufuspet-dev` |
| Processo PM2 | `rufus-api` (porta 3100, só local) | `rufus-api-dev` (porta 3101, só local) |
| Banco / usuário PostgreSQL | `rufus` / `rufus` | `rufus_dev` / `rufus_dev` |
| Site nginx | `/etc/nginx/sites-available/rufuspet` | `/etc/nginx/sites-available/rufuspet-dev` |
| Pedidos em TXT | `/var/lib/rufuspet/pedidos` | `/var/lib/rufuspet-dev/pedidos` |
| Backups (30 mais recentes) | `~rufus/backups/rufuspet` | `~rufus/backups/rufuspet-dev` |
| E-mail | Gmail (SMTP) | desligado (`SMTP_HOST` vazio) |

Senhas dos bancos são geradas no servidor e ficam só em `api/.env` de cada pasta.
Depois do `preparar-usuario.sh`, pastas e processos PM2 pertencem ao usuário **`rufus`** (sem senha, sem sudo).

## Antes: DNS

No Registro.br, registros **A** de `rufuspet.com.br`, `www.rufuspet.com.br` e `dev.rufuspet.com.br` para o IP do VPS.
Sem isso o site funciona pelo nginx, mas o HTTPS não é emitido (e o login do admin exige HTTPS).

## Primeira instalação

```bash
curl -fsSLo /tmp/instalar.sh https://raw.githubusercontent.com/multivacia/rufuspet/main/deploy/instalar.sh
bash /tmp/instalar.sh
```

O script confere pré-requisitos, clona o código, cria banco e `api/.env`, aplica migrations, gera o site,
sobe `rufus-api` no PM2, cria o site no nginx (testa com `nginx -t` antes de recarregar; se falhar, remove
o arquivo do Rufus e não altera mais nada) e, se o DNS já apontar para o servidor, emite o HTTPS.
Pode ser executado de novo se parar no meio.

Depois:

1. **Admin** (a senha não fica no histórico):
   ```bash
   cd /opt/rufuspet/api && read -rsp 'Senha do admin: ' ADMIN_SENHA && echo && ADMIN_SENHA="$ADMIN_SENHA" node scripts/criar-admin.js SEU_EMAIL
   ```
2. **E-mail:** em `/opt/rufuspet/api/.env` preencha `SMTP_USER`, `SMTP_PASS` (senha de app do Gmail) e
   `EMAIL_REMETENTE="Rufus Pedidos <sua-conta@gmail.com>"`; depois `pm2 restart rufus-api`.
3. **HTTPS** (se o DNS ainda não apontava na instalação):
   `sudo certbot --nginx -d rufuspet.com.br -d www.rufuspet.com.br --redirect`
4. Em `https://rufuspet.com.br/admin` → **Loja**: dados da loja e e-mails que recebem os pedidos.

## Deploy automático

Fluxo (`.github/workflows/ci-cd.yml`):

1. **PR para `develop` ou `main`** → CI: testes da API (Postgres em container), testes e build do site.
2. **Push/merge em `develop`** → CI verde → publica em `dev.rufuspet.com.br`.
3. **Merge em `main`** → CI verde → publica em `rufuspet.com.br`.

Com CI vermelho nada é publicado. Cada publicação faz o mesmo que o `atualizar.sh`: backup do banco,
código (só fast-forward), dependências, migrations, build, restart e confere o `/health`
(se a API não responder, o job fica vermelho). Histórico em GitHub → **Actions** e → **Environments**.

### Como o GitHub entra no VPS

Uma chave SSH só para isso, no usuário `rufus`, presa em `authorized_keys` a
`command="/usr/local/bin/rufus-deploy",restrict`: ela não abre shell nem túnel; só executa
`rufus-deploy dev` ou `rufus-deploy prod`. O `rufus-deploy` (dono root) fixa pasta, branch e processo de cada ambiente.

### Configuração (uma vez)

1. **DNS:** registro A de `dev.rufuspet.com.br` para o IP do VPS.
2. **Homologação**, com o seu usuário de sempre (pede usuário e senha de acesso ao site; anote):
   ```bash
   curl -fsSLo /tmp/instalar.sh https://raw.githubusercontent.com/multivacia/rufuspet/develop/deploy/instalar.sh
   AMBIENTE=homologacao bash /tmp/instalar.sh
   ```
   Banco novo: só as migrations (com os produtos de exemplo da `002_seed.sql`). Crie o admin da homologação
   como no passo 1 da primeira instalação, trocando a pasta por `/opt/rufuspet-dev/api`.
3. **Usuário de deploy** (cria `rufus`, transfere os dois ambientes para ele com poucos segundos de API fora do ar,
   gera a chave e testa um deploy da homologação):
   ```bash
   bash /opt/rufuspet-dev/deploy/preparar-usuario.sh
   ```
   Se o SSH não usa a porta 22: `SSH_PORTA=2222 bash ...`.
4. **GitHub** → Settings → Secrets and variables → Actions → *New repository secret*: cadastre
   `VPS_HOST`, `VPS_PORTA`, `VPS_USUARIO`, `VPS_KNOWN_HOSTS` e `VPS_SSH_CHAVE` com os valores que o script mostrou.
   Enquanto `VPS_HOST` não estiver cadastrado, o job de deploy só avisa e não publica.
   A chave privada não fica no servidor: se perder, apague a linha `rufus-deploy` de
   `/home/rufus/.ssh/authorized_keys` e rode o script de novo.

### Atualizar à mão (se o Actions estiver fora)

```bash
sudo -u rufus -H rufus-deploy prod   # ou dev
```

Se o fast-forward falhar (ex.: alguém deu force-push na branch), o deploy para antes de mexer no código
publicado; corrija a branch no GitHub e rode de novo.

### Voltar uma versão

Reverta o commit no GitHub (PR de revert) e faça o merge: o deploy publica a versão anterior.
Migrations não são desfeitas; se a versão revertida mudou o banco, restaure o backup (abaixo) com ajuda.

## E-mails que não chegaram

No admin → **Pedidos**, pedidos com falha de envio mostram **"⚠ e-mail falhou"**. Abra o pedido (**+**): a seção
**E-mails** mostra cada envio e o motivo do erro. Depois de corrigir o `.env` (e `sudo -u rufus -H pm2 restart rufus-api --update-env`),
clique em **Reenviar e-mails**. Se o SMTP não estiver configurado (ex.: `SMTP_USER`/`SMTP_PASS` vazios), o admin mostra
um aviso no topo e o reenvio informa o motivo, em vez de tentar enviar sem login (erro 530 do Gmail).

## Consultas úteis

- Logs: `sudo -u rufus -H pm2 logs rufus-api --lines 100` (homologação: `rufus-api-dev`)
- Processos: `sudo -u rufus -H pm2 ls`
- Pedidos recebidos: `ls -lt /var/lib/rufuspet/pedidos | head`
- Restaurar backup: `gunzip -c ARQUIVO.sql.gz | psql "$(sudo grep ^DATABASE_URL= /opt/rufuspet/api/.env | cut -d= -f2-)"`
  (em banco vazio; peça ajuda antes de restaurar em produção).
