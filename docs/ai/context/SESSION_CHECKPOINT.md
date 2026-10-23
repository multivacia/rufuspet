# Checkpoint — Rufus (rufuspet.com.br)

**Atualizado:** 2026-10-23 · **TASK_ID:** `site-rufus-catalogo-b2b` · histórico completo em
`docs/ai/returns/site-rufus-catalogo-b2b-retorno.md`.

## Estado atual
- Repositório `multivacia/rufuspet` (público). Fluxo: trabalhar na **`develop`**, PR → **`main`** com aprovação
  explícita do usuário, deploy no VPS a partir do `main`.
- `main` = `35b65f3` (PR #7). Em produção no VPS (o usuário roda o deploy; esta sessão não tem SSH).
- Stack: `api/` Node 20+/Express + PostgreSQL (migrations SQL 001–007, runner próprio); `web/` React 19 + Vite.
  Testes: `cd api && DATABASE_URL_TESTE=... npm test` (32) · `cd web && npm test` (6).

## Produção (VPS Ubuntu 22.04, IP 143.95.222.99, SSH porta 22022, usuário `deploy` com sudo)
- **Compartilha o servidor com o SGP** (`sgp-api` no PM2, site nginx `sgp.multivacia.com`, `/opt/sgp`). Não mexer no SGP.
- Rufus: `/opt/rufuspet`, PM2 `rufus-api` porta 3100, banco/usuário `rufus` (PostgreSQL 18 só em 127.0.0.1),
  nginx `/etc/nginx/sites-available/rufuspet`, HTTPS certbot, TXT dos pedidos em `/var/lib/rufuspet/pedidos`,
  backups em `~/backups/rufuspet`. Usuário de leitura `rufus_leitura` (DBeaver via túnel SSH).
- Deploy: `git -C /opt/rufuspet pull --ff-only && bash /opt/rufuspet/deploy/atualizar.sh` (backup + migrations + build
  + restart). Guia: `docs/deploy-vps.md`. DNS no Registro.br (A `@` e `www` → 143.95.222.99).

## Funcionalidades em produção
Catálogo (4 produtos, preço por unidade, sem estoque) · pedido com só **nome + 1 contato** obrigatórios; dados
opcionais Nome/Razão social e CPF/CNPJ · pedido mínimo (admin) · código público `RF-DDMM-XXX` para o cliente
(número `RFS-<ano>-<seq>` só interno) · e-mail HTML (Gmail SMTP) para destinatários do admin + confirmação ao
cliente · links WhatsApp (wa.me) · admin: produtos, pedidos (busca, situação dos e-mails, **Reenviar e-mails**),
Loja (dados do rodapé, e-mails internos, pedido mínimo).

## Pendências conhecidas
- Confirmar no VPS que `SMTP_USER`/`SMTP_PASS`/`EMAIL_REMETENTE` estão preenchidos em `/opt/rufuspet/api/.env`
  e reenviar pelo admin os e-mails dos pedidos que falharam (ex.: RF-2310-WHV e o pedido de cliente sem e-mail).
- Envio automático de WhatsApp (API oficial Meta) não implementado — notificações `whatsapp` ficam `pendente`.
- Retry automático de e-mail não implementado (só reenvio manual pelo admin).
- Nomes/descrições dos produtos vêm do seed antigo e nunca foram confirmados pelo cliente.
- VPS pede reboot (atualizações do Ubuntu): checar `systemctl is-enabled pm2-deploy` antes; reinício afeta o SGP.

## Preferências do usuário
- Português; respostas curtas; em diagnóstico, mandar só o próximo comando (não a sequência inteira).
- Segredos (senhas, senha de app) nunca no chat — o usuário digita no servidor.
