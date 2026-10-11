# Retorno — site-rufus-catalogo-b2b

- **TASK_ID:** site-rufus-catalogo-b2b
- **Data/hora:** 2026-10-11
- **Objetivo:** site B2B da Rufus (catálogo + pedido para pet shops; vendedor fecha por telefone), combinando a
  vitrine/pedido feitos nesta sessão com a API e o admin já existentes em `main`.
- **Status final:** implementado e validado localmente na branch `feat/vitrine-unitaria-sem-estoque`; sem PR e sem merge (aguardando decisão).
- **Repositório:** `multivacia/rufuspet`
- **Branch:** `feat/vitrine-unitaria-sem-estoque` (a partir de `main`)
- **SHA inicial:** `68e469e` (main, "Etapa 7: front admin")
- **SHA final:** ver `git log -1` da branch

## Histórico da atividade
1. Versão própria criada do zero (Next.js → depois site estático + PHP para HostGator compartilhada, pedido em TXT).
   Publicada para preservação na branch `site-estatico-hostgator` (commit `ac4077f`), sem relação com `main`.
2. Ao acessar o repo, descoberta a implementação existente em `main` (API Node/Express + PostgreSQL, React/Vite, admin JWT, etapas 1–7).
3. Decisões do usuário: **combinar** as duas; hospedagem **VPS** (mantém Node + PostgreSQL); **preço por unidade**
   do catálogo; **sem estoque**.

## O que foi feito (esta branch)
### API
- `migrations/003_venda_unitaria_sem_estoque.sql`: `produtos.preco_unitario` (= antigo preço de revenda sugerido),
  remove colunas de caixa/atacado/margem/estoque/limite; `pedido_itens` em unidades com `preco_unitario_snapshot`;
  `pedidos` ganha `razao_social`, `nome_fantasia`, `cnpj`, `cidade`, `uf`; imagens → `.webp`.
- `services/regras-pedido.js` (novo): validação de cliente (CNPJ com dígito verificador, UF), contato, itens
  (1–9999, agrupa SKU repetido), observações; total em centavos.
- `services/pedido.service.js`: usa as regras novas; sem checagem de estoque/limite; idempotência mantida.
- `services/notificacao.service.js` (novo): após o commit grava o TXT do pedido em `PEDIDOS_PASTA` e envia
  e-mails pendentes se `SMTP_HOST` estiver configurado (status/tentativas/erro na tabela `notificacoes`).
- `routes/pedidos.js`: honeypot `website`; dispara TXT/e-mail após responder; erro devolve `campo`.
- `routes/catalogo.js`: `precoUnitario`, sem filtro de estoque.
- `routes/admin.js`: produtos editam só `preco_unitario` (validado) e `ativo` (booleano).
- `app.js` separado de `server.js` (testável); `trust proxy` = 1 (IP real atrás do nginx para o rate limit).
- `middleware/ratelimit.js`: limite de pedidos configurável (`PEDIDOS_LIMITE_POR_HORA`, padrão 10).
- Testes `node:test`: 8 de regra + 6 de integração com PostgreSQL real.

### Web
- Vitrine (`/`), pedido (`/pedido`, revisão + dados da empresa + canal preferido + LGPD) e confirmação
  (`/pedido/enviado`) redesenhados; `/carrinho` e `/checkout` redirecionam para `/pedido`.
- Rodapé lido de `web/.env` (`VITE_LOJA_*`, valores fictícios no `.env.example`).
- Fotos enviadas pelo cliente em `.webp` (substituem os `.jpg` do protótipo); PWA (manifest + ícones).
- CSS da loja em `loja.css`, escopado em `.loja`; CSS público antigo removido de `index.css` (admin preservado).
- Admin: Produtos (SKU, nome, cor, preço unitário, ativo); Pedidos (empresa, CNPJ, cidade/UF, contato, qtd/preço un.);
  campo Observações do admin alargado (estava com 88px).

### Docs
- `README.md` (como funciona, configuração, testes, status) e `docs/rufus-data-model.md` (seção "Migration 003").

## Migrations
- Nova: `003_venda_unitaria_sem_estoque.sql` (sequência real: 001, 002, 003). Aplicada apenas no PostgreSQL 16 local de teste.
  **Destrutiva para colunas de caixa/estoque** — não executar em ambiente compartilhado sem aprovação.

## Decisões
- Preço unitário inicial = preço de revenda sugerido do seed (11,90/18,90/12,90/16,90), conforme o catálogo do cliente.
- Nomes/descrições dos produtos mantidos do seed existente (ex.: "15 sacos por rolo" — veio do kickoff, não confirmado).
- Números de pedido mantidos no formato existente `RFS-<ano>-<seq>`.
- WhatsApp (Twilio) não implementado; notificação fica `pendente`.

## Validação executada
- `cd api && DATABASE_URL_TESTE=... npm test` → 14/14 ok (executado 2× seguidas). Sem banco: 8 ok, 6 pulados.
  Durante o desenvolvimento: 1 falha do próprio teste (sequência anual persistindo entre execuções) — corrigida no teste.
- `npm run migrate` em banco limpo → 001, 002, 003 aplicadas.
- `cd web && npm run build` → ok.
- E2E Playwright/Chromium (API + Vite dev + PostgreSQL): 3 itens com cores → CNPJ inválido recusado com campo marcado →
  envio ok → `RFS-2026-0001`, R$ 239,50 → carrinho limpo → TXT gravado → login admin → produtos e pedido exibidos.
  Único erro de console: o 400 esperado do CNPJ inválido. Desktop e mobile sem erros JS.
- Não há lint configurado no repositório (nem em `api` nem em `web`).

## Pendências e riscos
- Abrir PR para `main` e revisar (aguardando autorização).
- Aplicar a migration 003 no VPS só com aprovação; fazer backup antes.
- Configurar SMTP para ligar o e-mail; definir `PEDIDOS_PASTA` com permissão de escrita no VPS.
- Confirmar nomes/descrições dos produtos e dados reais do rodapé.
- WhatsApp e retry/contingência das notificações ainda não implementados.
- A branch `site-estatico-hostgator` ficou obsoleta (pode ser apagada quando o usuário quiser).

## Git
Commit e push na branch `feat/vitrine-unitaria-sem-estoque`; `main` intocada.

Uso/tokens disponíveis: INDISPONÍVEL — a sessão não fornece métrica confiável.
