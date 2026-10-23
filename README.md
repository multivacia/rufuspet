# Rufus Distribuidora

Plataforma B2B de catálogo e pedidos para petshops. Catálogo público sem
login, checkout anônimo, pedido cai por e-mail e WhatsApp — sem pagamento
online.

## Stack

- API: Node 20 + Express + PostgreSQL 15 (`pg`, sem ORM), migrations SQL
  versionadas com runner próprio
- Web: React 19 + Vite + Tailwind CSS 4
- Deploy: VPS Ubuntu, nginx + PM2 + certbot — ver `docs/deploy-vps.md` (scripts em `deploy/`)

## Rodando localmente

```bash
cd api && cp .env.example .env  # preencha DATABASE_URL e JWT_SECRET
npm install
npm run migrate
npm run dev   # http://localhost:3000

cd ../web
npm install
npm run dev   # http://localhost:5173
```

## Como funciona

- **Vitrine** (`/`): produtos com foto, cor e preço por unidade; o lojista monta o pedido.
- **Pedido** (`/pedido`): revisão dos itens + dados do cliente. Obrigatórios: **nome** e **pelo menos um contato**
  (WhatsApp ou e-mail). Dados do comprador (nome/razão social, CPF/CNPJ, cidade/UF) são opcionais — vale pessoa física ou empresa;
  se informados, são validados.
  Sem pagamento online; o site não mostra nem limita estoque (controle só no admin).
- **API** grava o pedido no PostgreSQL, gera o número `RFS-<ano>-<sequencial>` e, em seguida,
  grava um **TXT** do pedido em `PEDIDOS_PASTA` e envia e-mail (HTML + texto) para os destinatários definidos no admin → **Loja** (ou `EMAILS_INTERNOS`
  do `.env`, se vazio), quando há SMTP;
  o cliente recebe confirmação por e-mail quando escolhe e-mail como contato preferido.
- **Admin** (`/admin`): login, preço unitário e ativo/inativo dos produtos, lista de pedidos com status, situação dos
  e-mails de cada pedido e botão **Reenviar e-mails**,
  e **Loja**: dados do rodapé e dos e-mails (razão social, CNPJ, telefone, WhatsApp etc.), e-mails que recebem
  os pedidos e **pedido mínimo** (0 = sem mínimo; pedidos abaixo são recusados pela API).
- **Estoque** (admin → Estoque): entradas (compras) com custo unitário e data, baixa manual com motivo, histórico.
  Custo **PEPS**: cada venda consome as compras mais antigas. O pedido baixa o estoque ao passar para
  `confirmado`/`faturado` (bloqueado se faltar saldo) e estorna ao voltar para `novo`/`cancelado`; o detalhe do pedido
  mostra custo e margem. Ver `docs/rufus-data-model.md`, seção "Migration 008".
- **WhatsApp (links wa.me, sem API):** na confirmação, o cliente pode enviar o pedido pelo WhatsApp da loja
  (número do admin → Loja), com itens e total já escritos; no admin → Pedidos, "Falar no WhatsApp" abre conversa
  com o cliente. Nada é enviado automaticamente: a pessoa confirma no próprio WhatsApp.
- O site pode ser instalado no celular (PWA).

## Configuração

- `api/.env` (modelo `api/.env.example`): banco, JWT, pasta dos TXT, SMTP, e-mails internos.
- Dados do rodapé: no admin → **Loja** (gravados no banco; não há `.env` no `web`).
- Criar o primeiro usuário do admin: `cd api && node scripts/criar-admin.js <email> <senha>`.

## Testes

Web (utilitários, sem banco): `cd web && npm test`.


```bash
cd api
DATABASE_URL_TESTE=postgres://usuario:senha@localhost:5432/rufus_teste npm test
```

O banco de teste é truncado a cada execução — use um banco descartável. Sem `DATABASE_URL_TESTE`,
só os testes de regra (sem banco) rodam.

## Status

Etapas 1–7 do kickoff concluídas. Etapa 8 (2026-10-11): venda por unidade, sem estoque, dados da
empresa no pedido, TXT do pedido, vitrine/pedido redesenhados, PWA (ver `docs/rufus-data-model.md`,
seção "Migration 003"). Controle de estoque PEPS no admin (2026-10-23, migration 008).
Pendente: envio de WhatsApp, retry/contingência das notificações.
