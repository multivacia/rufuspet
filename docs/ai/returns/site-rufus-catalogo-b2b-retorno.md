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

## Atualização 2026-10-18 — merge no main e preparação do deploy no VPS
- Usuário validou o site e autorizou subir para `main` e publicar no VPS.
- PR #1 (`feat/vitrine-unitaria-sem-estoque` → `main`) criado e mesclado: merge `13f8569` (main estava em `68e469e`,
  sem divergência).
- Diagnóstico do VPS (somente leitura, executado pelo usuário): Ubuntu 22.04, Node 22, PostgreSQL 18, nginx 1.18,
  PM2 7, certbot; **já hospeda o SGP em produção** (`sgp-api` no PM2, site nginx `sgp.multivacia.com`, `/opt/sgp`);
  portas 3000/3100 livres; IP 143.95.222.99; `rufuspet.com.br` sem DNS. Sudo com senha.
- Decisão: instalação nova e isolada do SGP (pasta, porta 3100, banco/usuário, processo PM2 e site nginx próprios).
- Criados `deploy/instalar.sh`, `deploy/atualizar.sh`, `deploy/nginx-rufuspet.conf`, `docs/deploy-vps.md`;
  `criar-admin.js` aceita `ADMIN_SENHA` (senha fora do histórico).
- Validação: instalação executada num VPS simulado (PM2 real, PostgreSQL de teste; sudo/nginx/certbot simulados):
  banco + `.env` (600) criados, migrations 001–005, build, API saudável, site nginx gerado; corrigido aborto quando o
  DNS não resolve; 2ª execução retoma sem refazer; `atualizar.sh` com backup (agora com permissão 600), migrations e
  restart ok; admin via `ADMIN_SENHA` ok; pedido gerou TXT. nginx/certbot reais **não** testados aqui.
- Pendente: DNS no Registro.br; execução no VPS pelo usuário (sem acesso SSH a partir desta sessão).

## Atualização 2026-10-20 — deploy concluído e WhatsApp (opção 1, links wa.me)
- VPS: `instalar.sh` executado pelo usuário; `rufus-api` online (porta 3100) ao lado do `sgp-api` (inalterado);
  HTTPS emitido para `rufuspet.com.br` e `www` (certbot). DNS no Registro.br: A `@` e `www` → 143.95.222.99
  (CNAME duplicado do `www` removido). Pendente do usuário: criar admin, SMTP no `.env` do VPS, dados da Loja.
- WhatsApp: pesquisadas as opções (links wa.me; API oficial Meta Cloud/BSPs com custo por mensagem e modelos
  aprovados; libs não oficiais com risco de banimento). Usuário escolheu a opção 1, na branch `develop`
  (criada a partir do `main` `982b6ed`).
- Implementado: `web/src/lib/whatsapp.js` (normaliza número com 55, monta link e mensagens);
  confirmação com botão "Enviar pedido pelo WhatsApp" (itens e total na mensagem; só aparece se a Loja tiver
  WhatsApp); admin → Pedidos com "Falar no WhatsApp" por pedido (mensagem com primeiro nome, número e total);
  rodapé usa o mesmo utilitário; `LojaProvider` passou a envolver também o admin.
- Validação: `web npm test` 4/4 (novo); build ok; E2E Playwright: links `wa.me/5511977207655` (loja) e
  `wa.me/5511987654321` (cliente) com mensagens corretas; sem erros JS.
- Envio automático de WhatsApp (API oficial) continua não implementado; notificações `whatsapp` seguem `pendente`.

## Atualização 2026-10-20 — pedido mínimo
- Pedido do usuário: mensagem de valor do pedido mínimo, parametrizado no /admin junto com os dados da loja.
- Decisão técnica (informada ao usuário): além da mensagem, o mínimo é **validado na API** (backend é a fonte da
  regra) e o envio fica desabilitado no site; `0` = sem mínimo.
- `migrations/006_pedido_minimo.sql`; `loja.service.js` (`pedidoMinimo` público; aceita 150, "150,00", "1.250,50";
  recusa negativo, texto, 3 casas, > 1.000.000); `pedido.service.js` → 422 `PEDIDO_MINIMO` com quanto falta.
- Web: mínimo no hero e na nota do catálogo; barra do pedido mostra quanto falta; página do pedido com aviso
  (amarelo/verde) e botão desabilitado com "Faltam R$ X"; campo "Pedido mínimo (R$)" na tela Loja.
- Validação: API `npm test` 20/20 (novo teste do mínimo); web `npm test` 4/4; build ok; E2E Playwright: valor
  inválido recusado no admin; mínimo R$ 150,00 exibido; 1 un. (R$ 11,90) bloqueado com "Faltam R$ 138,10";
  13 un. (R$ 154,70) liberado e enviado; POST direto na API abaixo do mínimo → 422. Sem erros JS.
- Observação cosmética: o texto "Adicionado ✓" quebrava linha no botão do card em telas largas — corrigido (ver abaixo).
- Branch `develop` (não publicada no VPS; `main` inalterado).

## Atualização 2026-10-20 — botão "Adicionado ✓" do card
- Causa: com 4 colunas (≥ 861px) o botão ficava com ~112px; "Adicionado ✓" precisa de ~120px e quebrava em 2 linhas.
- Correção (só CSS, `web/src/loja.css`): seletor de quantidade do card mais compacto, botão sem quebra de texto
  e com base de 120px; sem espaço, o botão desce para a linha de baixo com largura total (não "pula" ao trocar
  o texto).
- Validação: medição com Playwright antes/depois do clique em 390, 700, 860, 1024, 1180, 1280 e 1440px: altura
  43px, sem transbordo; na mesma linha da quantidade exceto em 1024px (botão abaixo, largura total). Build ok.

## Atualização 2026-10-20 — publicação no VPS (WhatsApp + pedido mínimo)
- PR #3 (`develop` → `main`) mesclado: `44edfd2` (fast-forward possível, sem divergência).
- VPS (executado pelo usuário): `deploy/atualizar.sh` → backup `~/backups/rufuspet/rufus-20261019-232452.sql.gz`,
  `main` 982b6ed → 44edfd2 (fast-forward), `aplicada: 006_pedido_minimo.sql`, build ok, `rufus-api` reiniciado,
  `/health` `{"ok":true,"db":true}`; `sgp-api` seguiu online.
- Observação: o VPS indica "System restart required" (atualizações do Ubuntu). Reiniciar afeta também o SGP;
  antes, confirmar que o PM2 sobe sozinho no boot (`systemctl is-enabled pm2-deploy`).
- Pendente do usuário: preencher WhatsApp e pedido mínimo no admin → Loja de produção e testar um pedido.

## Atualização 2026-10-20 — 403 no site após atualizar.sh (defeito corrigido)
- Sintoma: `https://rufuspet.com.br` respondeu 403 Forbidden (nginx) após o `atualizar.sh`.
- Causa (defeito introduzido nesta atividade): `atualizar.sh` fazia `umask 077` para proteger o backup e não
  restaurava; `npm run build` gerou `web/dist` legível só pelo `deploy` (`index.html` 600, `assets/` 700), e o
  nginx (www-data) não conseguia ler.
- Correção imediata (usuário, no VPS): `chmod -R a+rX /opt/rufuspet/web/dist`.
- Correção do script: `umask 022` no início de `atualizar.sh` e `instalar.sh`; `umask 077` só no subshell do
  backup; `chmod -R a+rX web/dist` após o build.
- Validação no VPS simulado, rodando a partir de um shell com `umask 077`: script antigo → `index.html -rw-------`,
  `assets drwx------` (reproduz o 403); script novo → `-rw-r--r--` / `drwxr-xr-x`; backup segue `-rw-------`.
- Pendente: levar a correção ao `main` (PR) para a próxima atualização do VPS usar o script corrigido.

## Atualização 2026-10-20 — consulta como PF (dados da empresa opcionais)
- Pedido do usuário: clientes querem consultar como PF sem divulgar dados da empresa. Sugestões apresentadas
  (cotação sem envio, cotação com contato mínimo, sinais de confiança/LGPD); decisão do usuário: manter um único
  fluxo com **apenas nome e contato obrigatórios** (o vendedor sempre entra em contato).
- API (`regras-pedido.js`): `validarCliente` com todos os campos opcionais (CNPJ/UF validados se preenchidos);
  `validarContato` exige nome e pelo menos WhatsApp ou e-mail; canal preferido se ajusta ao contato informado.
  Sem migration (colunas NOT NULL recebem texto vazio). E-mail/TXT mostram "—" para campos vazios; assunto usa o
  nome do contato quando não há empresa; Reply-To só se houver e-mail.
- Web: formulário "Seus dados" (nome*, WhatsApp, e-mail, "informe pelo menos um") + "Dados da empresa (opcional)";
  admin → Pedidos mostra "Não informada" e omite separadores vazios; mensagem de WhatsApp usa "Nome:" quando não há
  empresa (corrigido durante o teste: saía "Empresa: <nome da pessoa>").
- Validação: API `npm test` 24/24 (novos: empresa opcional, contato mínimo/ajuste de canal, pedido só com nome+WhatsApp,
  e-mail sem dados da empresa); web `npm test` 5/5; build ok; E2E Playwright: sem contato → erro no campo WhatsApp;
  só nome + WhatsApp → pedido RFS-2026-0038 enviado e exibido no admin como "Não informada"; sem erros JS.
- Ajuste de teste: a pasta de TXT de teste é limpa a cada teste (numeração reinicia por teste; em produção não reinicia).
- Branch `develop` (não publicada; `main` e VPS sem esta mudança).

## Atualização 2026-10-20 — pessoa física (Nome/Razão social, CPF/CNPJ)
- Pedido do usuário: rótulos "Nome / Razão social" e "CPF / CNPJ" para atender pessoas físicas.
- API: `cpfValido`, `documentoValido` (CPF 11 dígitos ou CNPJ 14) e `formatarDocumento`; mensagem "CPF ou CNPJ
  inválido"; mesma coluna `pedidos.cnpj` (sem migration). E-mail/TXT com rótulos "Nome/Razão social" e "CPF/CNPJ".
- Web: máscara que formata CPF até 11 dígitos e CNPJ a partir do 12º; seção "Dados para o pedido (opcional —
  pessoa física ou empresa…)"; campo de contato renomeado para "Seu nome"; admin → Pedidos com coluna
  "Cliente (nome/razão social)" e documento formatado conforme o tipo.
- Validação: API `npm test` 28/28 (novos: CPF, documento CPF/CNPJ, pedido PF via API, e-mail PF); web `npm test`
  6/6 (máscara); build ok; E2E Playwright: máscara 11.222.333/0001-81 e 529.982.247-25 ao digitar; pedido PF
  RFS-2026-0039 exibido no admin com CPF formatado; sem erros JS.
- Branch `develop` (não publicada; `main` e VPS sem esta mudança nem a anterior de dados opcionais).

## Atualização 2026-10-20 — código público do pedido (RF-DDMM-XXX)
- Pedido do usuário: o número sequencial por ano revela o volume de vendas ao cliente; manter a sequência só
  dentro do app. Opções apresentadas; escolhida `RF-DDMM-XXX` (ex.: RF-2010-K7Q).
- `migrations/007_codigo_publico.sql` (coluna única + preenchimento dos pedidos existentes pela data de criação);
  `regras-pedido.js` (`gerarCodigoPublico`, `normalizarCodigo`, alfabeto sem ambíguos); `pedido.service.js` sorteia com
  `crypto.randomInt` e repete em caso de colisão (savepoint); `POST /api/pedidos` passa a responder `codigo` em vez de
  `numero`; e-mail/TXT: cliente vê só o código, equipe vê número + código; admin: busca por código/número/nome.
- Web: confirmação "Código do pedido"; WhatsApp (cliente→loja e admin→cliente) com o código; admin → Pedidos mostra
  número e código e tem campo de busca.
- Validação: API `npm test` 31/31 (novos: formato/fuso/normalização, código na resposta sem número, unicidade e busca,
  e-mail cliente sem número interno); web `npm test` 6/6; build ok; migration 007 aplicada em banco com 7 pedidos:
  todos preenchidos, distintos, no padrão e com a data correta; E2E: confirmação RF-2010-TW7, resposta da API sem
  `numero`, página sem "RFS-", busca "rf 2010 tw7" encontra o pedido; WhatsApp do admin com o código; sem erros JS.
- Branch `develop` (não publicada; `main` e VPS sem esta mudança). No deploy: `atualizar.sh` aplica a migration 007.

## Atualização 2026-10-21 — publicação no VPS (PRs #5 e #6)
- PR #5 (dados da empresa opcionais + pessoa física) e PR #6 (código público RF-DDMM-XXX) mesclados no `main`
  (`31f5ffd`, `5deb5e2`).
- VPS (executado pelo usuário): `git pull --ff-only` (6b8e18a → 5deb5e2, já com o `atualizar.sh` corrigido) e
  `atualizar.sh` → backup `~/backups/rufuspet/rufus-20261021-021525.sql.gz`, `aplicada: 007_codigo_publico.sql`,
  build ok, `rufus-api` reiniciado, `/health` ok; `sgp-api` online. Sem 403 desta vez (correção de permissões ativa).
- Pendente do usuário: conferir em produção a confirmação com "Código do pedido: RF-…", códigos dos pedidos antigos
  e busca no admin.

## Atualização 2026-10-23 — e-mail não chegou em produção + botão "Reenviar e-mails"
- Sintoma: pedido RF-2310-WHV gravado em produção, sem e-mail. Diagnóstico (consulta no VPS pelo usuário): as
  notificações internas falharam com `530-5.7.0 Authentication Required` — o `.env` do VPS tinha `SMTP_HOST` (deixado
  pelo instalador) mas `SMTP_USER`/`SMTP_PASS` vazios, e a API tentava enviar sem login. Orientado preencher o `.env`,
  reiniciar e reenviar.
- Pedido do usuário: botão de reenviar e-mail.
- API: `situacaoEmail()` (configurado só com usuário e senha, salvo SMTP local; `SMTP_HOST=json` para teste), sem
  tentar enviar quando não configurado (log com o motivo); `reenviarEmails()` recria o aviso interno para os
  destinatários atuais e reenvia a confirmação ao cliente (se preferiu e-mail), de forma síncrona;
  `POST /api/admin/pedidos/:id/reenviar-emails` (409 com o motivo se SMTP não configurado); `GET /api/admin/pedidos`
  traz `emails` de cada pedido e `emailConfigurado`. Limite de login do admin configurável (`ADMIN_LOGIN_LIMITE`).
- Web (admin → Pedidos): alerta "⚠ e-mail falhou" na linha, seção "E-mails" no detalhe (destino, tipo, situação,
  erro/data), botão "Reenviar e-mails" com resultado, aviso no topo quando o SMTP não está configurado.
- Incidente durante o desenvolvimento: uma substituição de trecho removeu sem querer `htmlPedido`/`montarEmail` do
  `notificacao.service.js`; detectado pelos testes (import falhou), arquivo restaurado do Git e a mudança reaplicada
  só no trecho certo (diff final só com acréscimos).
- Validação: API `npm test` 32/32 (novo: reenvio — sem SMTP 409, Gmail sem usuário 409, envio com destinatários atuais
  e cliente, falha com erro registrado, 404/401); web `npm test` 6/6; build ok; E2E: com SMTP inalcançável o pedido
  RF-2310-NDQ aparece com "⚠ e-mail falhou" e o erro; após reiniciar com SMTP funcionando, "Reenviar e-mails" →
  "✓ 2 e-mail(s) enviado(s)" e os dois e-mails chegaram ao servidor SMTP de teste; sem erros JS.
- Branch `develop` (não publicada).

## Atualização 2026-10-23 — PR #7 publicado no main, DBeaver e encerramento desta sessão
- PR #7 (reenviar e-mails) mesclado: `35b65f3`. Deploy no VPS a cargo do usuário.
- Fornecida consulta SQL de pedidos + situação dos e-mails; DBeaver configurado via túnel SSH (porta 22022) com
  usuário de leitura `rufus_leitura`; conferido que o PostgreSQL escuta só em 127.0.0.1/::1 (não exposto).
- Contexto da sessão perto do limite: criado `docs/ai/context/SESSION_CHECKPOINT.md` para continuar em novo chat.

## Atualização 2026-10-23 — e-mail profissional em produção
- Usuário criou `vendas@rufuspet.com.br` e configurou no `.env` do VPS (remetente) e no admin → Loja (contato exibido e
  Reply-To da confirmação ao cliente). Aviso interno segue para os e-mails particulares dele e da esposa.
- Confirmado pelo usuário: envio funcionando e sem cair em spam. Pendência de SMTP do VPS encerrada.
- Nenhuma mudança de código. Próximo passo pedido: aba de controle de estoque no /admin.

## Atualização 2026-10-23 — controle de estoque no admin (PEPS)
- Decisões do usuário: baixa ao confirmar no admin; site público não mostra nem limita estoque; histórico de
  movimentos + custo de cada compra; venda usa o custo das compras mais antigas ainda em estoque (PEPS); confirmação
  bloqueada sem saldo; sem alerta de estoque baixo por enquanto.
- Decisões técnicas (informadas ao usuário): correção para mais = nova entrada com custo; para menos = baixa manual
  com motivo (PEPS); entrada excluível só se nada dela foi consumido; pedidos anteriores à migration começam sem baixa;
  `confirmado` ↔ `faturado` não mexe no estoque; `novo`/`cancelado` estorna para os mesmos lotes.
- `migrations/008_estoque_peps.sql` (lotes, movimentos, consumos, `pedidos.estoque_baixado_em`);
  `services/estoque.service.js`; `PATCH /api/admin/pedidos/:id` passa a aplicar baixa/estorno na mesma transação
  (409 `ESTOQUE_INSUFICIENTE` com `faltas`); `GET /api/admin/pedidos` traz `custo_estoque`; rotas `/api/admin/estoque/*`.
- Web: aba **Estoque** (saldos, próximo custo PEPS, custo médio, valor em estoque e total; formulários de entrada e
  baixa manual com campo inválido marcado; compras com restante e "excluir"; movimentos com pedido/motivo/usuário;
  filtro por produto); Pedidos: erro de estoque na própria linha e "Estoque: baixado em … · custo · margem (%)" no detalhe.
- Validação: API `npm test` 35/35 (2× seguidas; novos: PEPS com compra lançada fora de ordem, custo 10×2+5×3,
  confirmado→faturado sem nova baixa, cancelar estorna, reconfirmar; bloqueio sem baixa parcial; baixa manual,
  exclusão de entrada e validações); web `npm test` 7/7 (novo: `brlCusto`); build ok; migration 001–008 em banco limpo.
  E2E Playwright (API + Vite + PostgreSQL 16): custo "abc" recusado com campo marcado; duas compras K3 → saldo 20,
  valor R$ 50,00; pedido K3×15 + K6×1 sem K6 → "Estoque insuficiente — Kit 6 rolos: pedido 1, saldo 0" e status segue
  `novo`; após entrada de K6, confirmação ok com custo R$ 39,00 e margem R$ 158,40 (80,2%); baixa manual K3×2; cancelar
  devolveu K3=18 e K6=2; mobile 390px sem rolagem horizontal da página. Erros de console só os 400/409 esperados.
- Corrigido durante o teste: separador "·" sobrando em movimentos sem motivo; valores quebrando linha no celular
  (tabelas agora rolam na horizontal).
- Branch `develop` (não publicada). No deploy: `atualizar.sh` aplica a migration 008 (só cria tabelas e uma coluna,
  não altera dados existentes).

## Git
Commit e push na branch `feat/vitrine-unitaria-sem-estoque`; `main` intocada.

Uso/tokens disponíveis: INDISPONÍVEL — a sessão não fornece métrica confiável.
