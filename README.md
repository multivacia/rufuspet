# Rufus — catálogo B2B com pedido

Site para pet shops verem os produtos Rufus, montarem um pedido e enviarem. Cada pedido é gravado como
arquivo TXT no servidor (e, opcionalmente, enviado por e-mail); um vendedor entra em contato para fechar
pagamento e entrega. Não há pagamento online nem controle de estoque.

Pode ser instalado no celular como app (PWA): no Chrome/Android, menu → "Instalar app"; no iPhone, Safari → Compartilhar → "Adicionar à Tela de Início".

## Como funciona

- **Site:** Next.js gerado como arquivos estáticos (`npm run build` → pasta `out/`). Não precisa de Node no servidor.
- **Pedido:** `public/api/pedido.php` valida os dados, recalcula o total com os preços de `public/api/catalogo.json`
  (o valor enviado pelo navegador é ignorado), grava o TXT e, se ligado, envia e-mail via `mail()` do PHP.
- Requer PHP 8.1 ou superior (selecionável no cPanel da HostGator em "MultiPHP Manager").

## Configuração

São dois arquivos, porque o site é gerado antes e o PHP roda depois, no servidor:

| Arquivo | Quando é lido | O que contém |
|---|---|---|
| `.env.local` / `.env.production` (modelo: `.env.example`) | no build | Dados do rodapé e nome da loja (`LOJA_*`) |
| `rufus.env` (modelo: `rufus.env.example`) | a cada pedido, no servidor | Pasta dos TXT, e-mail de destino, liga/desliga e-mail |

Mudou `LOJA_*` → rode o build e reenvie `out/`. Mudou `rufus.env` → vale no próximo pedido.

## Produtos e preços

Edite `public/api/catalogo.json` (preços em centavos) e as fotos em `public/produtos/`, depois rode o build e reenvie.

## Rodar localmente

```bash
npm install
cp .env.example .env.local
cp rufus.env.example rufus.env
npm run dev:api   # terminal 1: PHP do pedido em localhost:8000
npm run dev       # terminal 2: site em localhost:3000
```

Para testar exatamente como ficará na HostGator: `npm run build && npm run preview` (http://localhost:8080).
Os pedidos de teste ficam em `rufus-pedidos/` na raiz do projeto.

## Publicar na HostGator

1. Gere o site: `npm run build`.
2. No cPanel → Gerenciador de Arquivos, envie **o conteúdo** da pasta `out/` para `public_html/`
   (inclusive os arquivos ocultos `.htaccess` e `api/.htaccess`; ative "Mostrar arquivos ocultos").
3. Crie `rufus.env` na pasta **acima** do `public_html` (ex.: `/home/SEU_USUARIO/rufus.env`), a partir de `rufus.env.example`.
4. Os pedidos aparecem em `/home/SEU_USUARIO/rufus-pedidos/` (criada automaticamente, fora do acesso público).
5. Para ligar o e-mail: crie a conta `pedidos@seudominio.com.br` no cPanel e ajuste `PEDIDOS_ENVIAR_EMAIL=true`
   e `PEDIDOS_EMAIL_REMETENTE` no `rufus.env`.

## Scripts

`npm run dev` · `npm run dev:api` · `npm run build` · `npm run preview` · `npm run lint` · `npm run typecheck` · `npm test` (PHP)
