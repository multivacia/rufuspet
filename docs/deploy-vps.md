# Deploy no VPS (Ubuntu)

O VPS já tem Node 20+, PostgreSQL, nginx, PM2 e certbot, e roda **outros sistemas (SGP)**.
O Rufus usa recursos próprios e não altera os demais:

| Recurso | Rufus |
|---|---|
| Pasta | `/opt/rufuspet` |
| Processo PM2 | `rufus-api` (porta 3100, só local) |
| Banco / usuário PostgreSQL | `rufus` / `rufus` (senha gerada no servidor, só em `api/.env`) |
| Site nginx | `/etc/nginx/sites-available/rufuspet` (`rufuspet.com.br` e `www`) |
| Pedidos em TXT | `/var/lib/rufuspet/pedidos` |
| Backups | `~/backups/rufuspet` |

## Antes: DNS

No Registro.br, registros **A** de `rufuspet.com.br` e `www.rufuspet.com.br` para o IP do VPS.
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

## Atualizar (novas versões do `main`)

```bash
bash /opt/rufuspet/deploy/atualizar.sh
```

Faz backup do banco (`~/backups/rufuspet`), atualiza o código (só fast-forward), instala dependências,
aplica migrations, gera o site e reinicia `rufus-api`.

## Consultas úteis

- Logs: `pm2 logs rufus-api --lines 100`
- Pedidos recebidos: `ls -lt /var/lib/rufuspet/pedidos | head`
- Restaurar backup: `gunzip -c ARQUIVO.sql.gz | psql "$(grep ^DATABASE_URL= /opt/rufuspet/api/.env | cut -d= -f2-)"`
  (em banco vazio; peça ajuda antes de restaurar em produção).
