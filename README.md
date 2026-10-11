# Rufus — catálogo B2B com pedido por e-mail

Site para pet shops verem os produtos Rufus, montarem um pedido e enviarem. O pedido chega por e-mail à
loja; um vendedor entra em contato para fechar pagamento e entrega. Não há pagamento online nem controle de estoque.

Pode ser instalado no celular como app (PWA): no Chrome/Android, menu → "Instalar app"; no iPhone, Safari → Compartilhar → "Adicionar à Tela de Início".

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # ajuste os valores
npm run dev                  # http://localhost:3000
```

Sem SMTP configurado, em desenvolvimento o e-mail do pedido é exibido no terminal em vez de enviado.
Em produção, sem SMTP o envio falha e o cliente vê uma mensagem de erro.

## Configuração (variáveis de ambiente)

Tudo fica em `.env.local` (local) ou no painel da hospedagem (produção). Lista completa e comentada em `.env.example`.

| Variável | Uso |
|---|---|
| `LOJA_*` | Nome, razão social, CNPJ, telefone, WhatsApp, e-mail, endereço, horário e Instagram exibidos no rodapé |
| `PEDIDOS_EMAIL_DESTINO` | Caixa que recebe os pedidos |
| `PEDIDOS_COPIA_CLIENTE` | `true` envia confirmação ao cliente |
| `SMTP_*` | Servidor de envio (ex.: Gmail com senha de app) |

Campos `LOJA_*` vazios são omitidos do rodapé. Mudou variável → reinicie o servidor / faça novo deploy.

## Produtos e preços

Edite `src/lib/catalogo.ts` (preços em centavos) e as fotos em `public/produtos/`.
O servidor recalcula o pedido com esses preços; o valor enviado pelo navegador é ignorado.

## Publicar (Vercel)

1. Importe o repositório em vercel.com (framework detectado: Next.js).
2. Cadastre as variáveis do `.env.example` em Settings → Environment Variables.
3. Deploy. Depois, aponte o domínio em Settings → Domains.

## Scripts

`npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck` · `npm test`
