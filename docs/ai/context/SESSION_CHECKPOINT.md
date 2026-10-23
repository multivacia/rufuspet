# Checkpoint — Rufus (rufuspet.com.br)

**Atualizado:** 2026-10-23 · **TASK_ID:** `site-rufus-catalogo-b2b` · histórico completo em
`docs/ai/returns/site-rufus-catalogo-b2b-retorno.md`.

## Estado atual
- Repositório `multivacia/rufuspet` (público). Fluxo: trabalhar na **`develop`**, PR → **`main`** com aprovação
  explícita do usuário, deploy no VPS a partir do `main`.
- `main` = `35b65f3` (PR #7). Em produção no VPS (o usuário roda o deploy; esta sessão não tem SSH).
- `develop` à frente do `main`: **estoque PEPS** (008–009) e **clientes + ciclo solicitação → pedido** (010), validados, sem PR ainda.
- Stack: `api/` Node 20+/Express + PostgreSQL (migrations SQL 001–010, runner próprio); `web/` React 19 + Vite.
  Testes: `cd api && DATABASE_URL_TESTE=... npm test` (40) · `cd web && npm test` (7).

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

## Estoque (develop, 2026-10-23)
- Só no admin; custo por compra (lote), saídas PEPS; baixa ao passar pedido para confirmado/faturado (bloqueada sem
  saldo), estorno ao voltar para novo/cancelado; baixa manual com motivo. Detalhes: `docs/rufus-data-model.md` (Migration 008).
- Compra: produto, quantidade, custo unitário, data, fornecedor (texto livre, opcional, com sugestão),
  nota fiscal/documento (opcional), observação. Sem campo de origem.
- Sem alerta de estoque baixo (decisão do usuário, por enquanto).
- Próxima ideia do usuário: aba de frete/custo de importação para calcular o custo unitário (ainda não especificada).

## Clientes e pedidos (develop, 2026-10-23)
- Site gera **solicitação** (`novo`); vira pedido ao confirmar no admin. Confirmar exige cliente (ou "Venda balcão").
- Histórico do cliente = pedidos confirmados/faturados vinculados (base única). Venda fora do site: Novo pedido no admin.
- Cliente: tipo, nome/razão social, fantasia, CPF/CNPJ (único), IE, comprador responsável, WhatsApp, e-mail, cidade/UF,
  endereço, vendedor, observações, ativo. Vendedor também no pedido (herda do cliente). Texto livre.
- Admin edita pedido sem travas; estoque limita ao disponível (saldo + baixa do próprio pedido); solicitações não reservam.
- Pedidos confirmados antes da 010 ficam sem cliente: usuário vincula manualmente após o deploy.

## E-mail em produção (confirmado pelo usuário em 2026-10-23)
- Remetente e contato da Loja = `vendas@rufuspet.com.br` (`.env` do VPS + admin → Loja); confirmação ao cliente com
  Reply-To vendas@. Aviso interno vai para os e-mails particulares do usuário e da esposa (admin → E-mails internos).
- SMTP configurado e entregando sem cair em spam.

## Pendências conhecidas
- Envio automático de WhatsApp (API oficial Meta) não implementado — notificações `whatsapp` ficam `pendente`.
- Retry automático de e-mail não implementado (só reenvio manual pelo admin).
- Nomes/descrições dos produtos vêm do seed antigo e nunca foram confirmados pelo cliente.
- VPS pede reboot (atualizações do Ubuntu): checar `systemctl is-enabled pm2-deploy` antes; reinício afeta o SGP.

## Preferências do usuário
- Português; respostas curtas; em diagnóstico, mandar só o próximo comando (não a sequência inteira).
- Novas tarefas: fechar a solução com o usuário (regras, modelo, telas, decisões técnicas) e só implementar após o
  "ok" dele — não começar a codificar logo depois das perguntas.
- Segredos (senhas, senha de app) nunca no chat — o usuário digita no servidor.
