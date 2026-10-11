# Retorno — site-rufus-catalogo-b2b

- **TASK_ID:** site-rufus-catalogo-b2b
- **Data/hora:** 2026-10-11
- **Objetivo:** criar do zero o site B2B da Rufus: catálogo com fotos e preços, montagem de pedido e registro do pedido para a loja; o vendedor fecha a venda por telefone.
- **Status final:** MVP concluído e validado localmente, adaptado para HostGator. Repositório remoto ainda não criado (GitHub negou a criação em `multivacia`).
- **Branch:** main (repositório local novo, sem remoto)
- **SHA inicial:** — (repositório criado nesta atividade; 1º commit 01078db)
- **SHA final:** ver `git log -1`

## O que foi feito
### Etapa 1
- Next.js 15 + TypeScript; catálogo com 4 produtos (kit 3 rolos R$ 11,90; kit 6 rolos R$ 18,90; kit porta-saquinhos + 2 rolos R$ 12,90 em verde/azul/rosa; pote dobrável R$ 16,90 em preto/azul/vermelho/rosa). Foto troca com a cor.
- Pedido no navegador (localStorage), revisão, formulário do lojista (razão social, fantasia, CNPJ com validação, responsável, telefone, e-mail, cidade/UF, observações, aceite LGPD), página de sucesso, PWA.
- Rodapé lido de variáveis de ambiente (`LOJA_*`).

### Etapa 2 — HostGator + TXT (commit 9585b9c)
- Decisão do usuário: hospedagem HostGator com domínio .com.br próprio; por enquanto pedido em TXT, e-mail depois.
- Site exportado como estático (`output: "export"`, pasta `out/`).
- Rota Node (`/api/pedido`, nodemailer, zod) substituída por `public/api/pedido.php` + `_pedido.php`:
  validação, total recalculado com `catalogo.json`, número `RF-AAAAMMDD-XXXX`, TXT gravado fora do `public_html`,
  e-mail opcional via `mail()` (desligado), honeypot, limite 5 pedidos/10 min por IP.
- Catálogo único em `public/api/catalogo.json`, usado pelo site e pelo PHP.
- Configuração do servidor em `rufus.env` (fora do `public_html`); `.htaccess` bloqueia `_*.php` e ocultos, força HTTPS.
- Testes migrados para PHP (`tests/pedido_test.php`).

## Arquivos (estado final)
`src/` (app, componentes, lib), `public/api/{pedido.php,_pedido.php,catalogo.json,.htaccess}`, `public/.htaccess`,
`public/produtos/*.webp`, `public/icones/*`, `tests/pedido_test.php`, `.env.example`, `rufus.env.example`, `README.md`, configs.
Removidos na etapa 2: `src/app/api/pedido/route.ts`, `src/lib/email.ts`, `tests/pedido.test.ts`, `vitest.config.mts`.
Locais, não versionados: `.env.local`, `rufus.env` (destino `gustavoramosalmeida@gmail.com`), `rufus-pedidos/`.

## Migrations
Nenhuma (não há banco).

## Decisões
- Preço por unidade para o lojista, sem pedido mínimo (não informado pelo usuário).
- HostGator compartilhada não roda Node: site estático + PHP. Requer PHP ≥ 8.1.
- TXT sempre é gravado (serve de backup quando o e-mail for ligado).
- E-mail de destino fica só em `rufus.env`, fora do repositório.

## Validação executada
- `npm test` (PHP) → 10/10 ok
- `npx tsc --noEmit` → OK (antes do build acusou tipos antigos em `.next/` da rota removida; resolvido após build)
- `npm run lint` → sem avisos ou erros
- `npm run build` → OK, exporta `out/` com `api/*.php` e `.htaccess`
- E2E Playwright/Chromium contra `php -S -t out` (igual à hospedagem): 3 itens com cores → CNPJ inválido recusado → envio ok → sucesso → carrinho limpo → TXT gravado com total R$ 239,50; sem erros JS em desktop e mobile.
- `GET /api/pedido.php` → 405; POST com cliente vazio → 400 indicando o campo.
- Corrigido durante a validação: alinhamento do TXT com rótulos acentuados (padding multibyte compatível com PHP 8.1).

## Pendências e riscos
- Criar o repositório `multivacia/rufus-loja` (o app do Claude não tem permissão de criação na organização) e fazer push.
- Publicar na HostGator conforme README; conferir versão do PHP e se o `.htaccess` com `Require all denied` é aceito.
- Ligar e-mail depois (conta do domínio como remetente).
- Substituir dados fictícios do rodapé; logo recriado em CSS/SVG.
- Ambiente da sessão é temporário: sem push, o trabalho se perde se a sessão expirar.

## Próximo passo recomendado
Usuário cria o repositório vazio no GitHub → push → publicar na HostGator.

## Git
Commits locais 01078db e 9585b9c + commit deste retorno; sem push (sem remoto).

Uso/tokens disponíveis: INDISPONÍVEL — a sessão não fornece métrica confiável.
