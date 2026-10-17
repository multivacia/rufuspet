# Rodar o site no Windows (local)

Pré-requisitos: **Node.js 20 ou superior**, **PostgreSQL** e **Git**. Confira no PowerShell:

```powershell
node -v
git --version
psql --version
```

Se `psql` não for reconhecido, use o caminho completo, por exemplo
`& "C:\Program Files\PostgreSQL\16\bin\psql.exe"` (troque `16` pela sua versão).

## 1. Baixar o código

```powershell
cd $HOME\Documents
git clone -b feat/vitrine-unitaria-sem-estoque https://github.com/multivacia/rufuspet.git
cd rufuspet
```

## 2. Criar o banco

Vai pedir a senha do usuário `postgres` definida na instalação do PostgreSQL.

```powershell
psql -U postgres -c "CREATE USER rufus WITH PASSWORD 'rufus';"
psql -U postgres -c "CREATE DATABASE rufus OWNER rufus;"
```

(Também dá para criar pelo pgAdmin: usuário `rufus`, senha `rufus`, banco `rufus` com dono `rufus`.)

## 3. API

```powershell
cd api
copy .env.example .env
notepad .env
```

No Bloco de Notas, deixe estas linhas assim e salve:

```
DATABASE_URL=postgres://rufus:rufus@localhost:5432/rufus
JWT_SECRET=troque-por-uma-frase-longa-qualquer
PORT=3000
NODE_ENV=development
PEDIDOS_PASTA=./pedidos
EMAILS_INTERNOS=seu-email@exemplo.com
```

> `NODE_ENV=development` é necessário enquanto o site roda sem HTTPS: em `production` o
> cookie do admin só funciona com HTTPS e o login não "pega".

Instale, crie as tabelas e o usuário do admin, e suba a API:

```powershell
npm install
npm run migrate
node scripts/criar-admin.js seu-email@exemplo.com SUA_SENHA
npm run dev
```

Deve aparecer `rufus-api ouvindo na porta 3000`. **Deixe esse PowerShell aberto.**

## 4. Site

Abra **outro** PowerShell:

```powershell
cd $HOME\Documents\rufuspet\web
copy .env.example .env
npm install
npm run dev
```

Abra no navegador:

- Loja: http://localhost:5173
- Admin: http://localhost:5173/admin (e-mail e senha do passo 3)

Os pedidos aparecem no admin e também como arquivo TXT em `rufuspet\api\pedidos\`.

## Ver no celular (mesma rede Wi-Fi)

No PowerShell do site, pare com `Ctrl+C` e rode `npm run dev -- --host`. O Vite mostra um endereço
`Network: http://192.168.x.x:5173` — abra no celular. Se não abrir, permita o Node no Firewall do Windows.

## Problemas comuns

| Mensagem | O que fazer |
|---|---|
| `password authentication failed for user "rufus"` | Senha/usuário do passo 2 diferente do `DATABASE_URL` no `api\.env`. |
| `ECONNREFUSED ...:5432` | PostgreSQL parado: abra "Serviços" do Windows e inicie `postgresql-x64-NN`. |
| `port 5432` diferente | Ajuste a porta no `DATABASE_URL` (veja no pgAdmin a porta do servidor). |
| Site abre mas "Não foi possível carregar os produtos" | A API (passo 3) não está rodando. |
| `npm install` falha no `bcrypt` | Confirme Node 20+ 64 bits (`node -p process.arch` deve mostrar `x64`). |

Para parar: `Ctrl+C` nos dois PowerShell. Para rodar de novo outro dia: `npm run dev` em `api` e em `web`.
