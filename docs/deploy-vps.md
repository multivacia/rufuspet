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
| Fotos enviadas pelo admin | `/opt/rufuspet/api/uploads` (servidas pela API em `/api/uploads/`) |
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

Faz backup do banco e das fotos (`~/backups/rufuspet`), atualiza o código (só fast-forward), instala dependências,
aplica migrations, gera o site e reinicia `rufus-api`.

## E-mails que não chegaram

No admin → **Pedidos**, pedidos com falha de envio mostram **"⚠ e-mail falhou"**. Abra o pedido (**+**): a seção
**E-mails** mostra cada envio e o motivo do erro. Depois de corrigir o `.env` (e `pm2 restart rufus-api --update-env`),
clique em **Reenviar e-mails**. Se o SMTP não estiver configurado (ex.: `SMTP_USER`/`SMTP_PASS` vazios), o admin mostra
um aviso no topo e o reenvio informa o motivo, em vez de tentar enviar sem login (erro 530 do Gmail).

## Consultas úteis

- Logs: `pm2 logs rufus-api --lines 100`
- Pedidos recebidos: `ls -lt /var/lib/rufuspet/pedidos | head`
- Restaurar fotos: `mkdir -p /opt/rufuspet/api/uploads && tar -xzf ARQUIVO-fotos.tar.gz -C /opt/rufuspet/api/uploads`
- Restaurar backup: `gunzip -c ARQUIVO.sql.gz | psql "$(grep ^DATABASE_URL= /opt/rufuspet/api/.env | cut -d= -f2-)"`
  (em banco vazio; peça ajuda antes de restaurar em produção).
