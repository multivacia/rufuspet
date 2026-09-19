# Rufus Distribuidora

Plataforma B2B de catálogo e pedidos para petshops. Catálogo público sem
login, checkout anônimo, pedido cai por e-mail e WhatsApp — sem pagamento
online.

## Stack

- API: Node 20 + Express + PostgreSQL 15 (`pg`, sem ORM), migrations SQL
  versionadas com runner próprio
- Web: React 19 + Vite + Tailwind CSS 4
- Deploy: VPS Ubuntu, nginx + PM2 + certbot

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

## Status

Etapa 1 do kickoff concluída: scaffold dos dois projetos, `db.js` e
`/health`. As próximas etapas (migrations a partir do data model, rotas de
catálogo/pedidos/admin, port do protótipo aprovado) dependem de
`docs/rufus-data-model.md` e `docs/prototipo-v6.html`, ainda não
recebidos neste repositório.
