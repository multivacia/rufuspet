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

## Atualização 2026-10-17 — publicação local (Windows)
- Usuário optou por rodar localmente no próprio computador (Windows, com Node e PostgreSQL já instalados);
  publicação no VPS adiada. Domínio `rufuspet.com.br` confirmado no Registro.br (válido até 19/05/2027).
- Não foi possível consultar DNS/HTTPS do domínio daqui: a política de rede da sessão bloqueia
  `dns.google`, `cloudflare-dns.com`, `rdap.registro.br` e `rufuspet.com.br` (403 no proxy).
- Criado `docs/rodar-local-windows.md` (passo a passo PowerShell).
- Validação: o roteiro foi seguido num clone novo da branch com banco vazio (Linux, PostgreSQL 16):
  `npm install` → `npm run migrate` (001, 002, 003 aplicadas) → `criar-admin.js` → `/health` ok →
  login admin ok (`NODE_ENV=development`) → `npm run build` do site ok. Não testado em Windows de fato.
- Resultado no Windows do usuário (2026-10-18, PostgreSQL 18, Node 20+): migrations 001–003 ok, admin criado
  (bcrypt ok apesar do aviso de install-scripts do npm), API na porta 3000, site na 5174 (5173 ocupada).
  Pedido RFS-2026-0001 enviado, exibido no admin e TXT gravado em `api/pedidos/`. Preço alterado no admin
  (Kit 3 rolos → R$ 1,90, teste do usuário) refletiu no pedido, como esperado.
- Problemas encontrados e resolvidos no caminho: `psql` fora do PATH (usado caminho completo);
  `.env` salvo sem `DATABASE_URL` (regravado via `Set-Content`).
- Observação cosmética: tabela de Pedidos do admin fica apertada em telas médias (colunas quebram linha).

## Atualização 2026-10-18 — e-mail dos pedidos
- Decisão: envio pelo Gmail do usuário (senha de app), só ele recebe (`EMAILS_INTERNOS`), cópia ao cliente mantida
  (enviada quando o cliente escolhe e-mail como contato preferido).
- Validado com servidor SMTP falso local (aiosmtpd): pedido com contato por e-mail → 2 e-mails (interno com
  Reply-To do cliente + confirmação ao cliente), ambos `enviado`; pedido com contato por WhatsApp → 1 e-mail interno
  `enviado` e notificação WhatsApp `pendente`. Envio real pelo Gmail não testado daqui (rede da sessão bloqueia).
- `api/.env.example`: instruções para Gmail. Senha de app configurada só pelo usuário, fora do chat e do Git.
- Envio real pelo Gmail no Windows do usuário: falhou com "self-signed certificate in certificate chain" —
  o Kaspersky Endpoint Security intercepta TLS na porta 465 (raiz "Kaspersky Endpoint Security Personal
  Certification Authority"). Resolvido sem desligar a verificação TLS: `NODE_OPTIONS=--use-system-ca`
  (Node 26 usa o repositório de certificados do Windows). Necessário só nessa máquina, não no VPS.
- Pedido RFS-2026-0004: confirmação ao cliente recebida no Gmail. Observação cosmética: e-mail em texto puro
  perde o alinhamento das colunas em fonte proporcional (candidato a versão HTML).
- Pendente: dados reais do rodapé e confirmação de nomes/descrições dos produtos.

## Atualização 2026-10-18 — dados da loja no admin + e-mail em HTML
- Pedido do usuário: rodapé editável "igual aos preços" e e-mail formatado.
- `migrations/004_dados_da_loja.sql`: tabela `loja_config` (1 linha). `services/loja.service.js`, `GET /api/loja`,
  `GET/PUT /api/admin/loja` (CNPJ/e-mail validados se preenchidos; nome obrigatório).
- Web: `lib/dadosLoja.jsx` (contexto lido da API) usado no rodapé, cabeçalho e confirmação; nova tela admin **Loja**;
  removidos `web/.env.example` e as variáveis `VITE_LOJA_*`; `LOJA_NOME` removido do `api/.env.example`.
- E-mail: versão HTML (cabeçalho com a marca, dados do cliente, tabela de itens, total em destaque, observações,
  rodapé com dados da loja) + texto puro como alternativa; Reply-To da confirmação = e-mail de contato da loja.
- Validação: `npm test` (API) 18/18 ok (4 novos: loja pública/admin/validação; HTML com escape; versão cliente;
  texto puro). Build web ok. E2E Playwright + SMTP falso: CNPJ inválido recusado na tela Loja; dados salvos
  aparecem no rodapé; pedido com contato por e-mail → 2 e-mails `multipart/alternative` (interno com Reply-To do
  cliente; cliente com Reply-To da loja); sem erros JS.
- Infra de teste: o PostgreSQL de teste caiu uma vez (o ambiente restringe periodicamente a pasta temporária);
  movido para `/var/lib/rufus-pg-teste` e a suíte foi repetida com sucesso.

## Atualização 2026-10-18 — e-mail interno parametrizável
- Pedido do usuário: parametrizar o e-mail interno e usá-lo no envio.
- `migrations/005_emails_internos.sql`: `loja_config.emails_internos`. `loja.service.js`: campo privado
  (só no admin), validação (cada endereço, máx. 10, normaliza minúsculas e remove duplicados) e
  `destinatariosInternos()` (admin → fallback `EMAILS_INTERNOS`). `pedido.service.js` passa a usá-lo ao
  enfileirar as notificações internas. Tela Loja do admin com o novo campo.
- Validação: `npm test` 19/19 (novo teste: fallback do .env, validação, privacidade no GET público e uso no
  pedido); build web ok; teste real com SMTP falso: dois destinatários configurados no admin receberam o
  e-mail do pedido RFS-2026-0035 (uma tentativa anterior falhou porque o SMTP falso tinha caído com o ambiente).

## Git
Commit e push na branch `feat/vitrine-unitaria-sem-estoque`; `main` intocada.

Uso/tokens disponíveis: INDISPONÍVEL — a sessão não fornece métrica confiável.
