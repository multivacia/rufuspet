# Rufus — Data model

> **Nota de origem**: este documento não veio do cliente — o arquivo
> `docs/rufus-data-model.md` citado no kickoff nunca foi entregue. Ele foi
> desenhado a partir das regras de negócio descritas em
> `rufus-kickoff-claude-code.md` (formato de `GET /api/produtos`, regras do
> `POST /api/pedidos`, serviço de notificação, admin) e dos dois exemplos de
> produto que o próprio kickoff já trazia (RFS-K3 e o grupo
> `pote-dobravel`), que foram usados como dado real de seed. Se o cliente
> mandar um data model oficial depois, ele passa a valer e este arquivo é
> ajustado para bater com ele — até lá, **este é** a fonte da verdade do
> schema, e `001_schema.sql` o transcreve sem alterar.

5 tabelas. Sem ORM — SQL puro, runner próprio em `api/migrations/run.js`.

## `produtos`

Uma linha por SKU vendável — inclusive cada variante de cor tem sua
própria linha. `grupo_exibicao` é o que agrupa variantes na resposta de
`GET /api/produtos` (ver `rotas/catalogo.js`, ainda não implementado);
produto sem variante tem `grupo_exibicao NULL`.

`preco_caixa` e `margem_pct` são colunas geradas (`GENERATED ALWAYS AS
... STORED`) para não deixar o valor calculado divergir do que gerou ele
— é exatamente o que o gate da Etapa 2 confere.

```sql
CREATE TABLE produtos (
  sku                     TEXT PRIMARY KEY,
  grupo_exibicao          TEXT,
  nome                    TEXT NOT NULL,
  descricao               TEXT NOT NULL DEFAULT '',
  imagem                  TEXT NOT NULL,
  cor                     TEXT,
  cor_hex                 TEXT,
  preco_atacado           NUMERIC(10,2) NOT NULL CHECK (preco_atacado > 0),
  preco_revenda_sugerido  NUMERIC(10,2) NOT NULL CHECK (preco_revenda_sugerido > 0),
  qtd_por_caixa           INTEGER NOT NULL CHECK (qtd_por_caixa > 0),
  unidade                 TEXT NOT NULL CHECK (unidade IN ('kit', 'unidade')),
  preco_caixa             NUMERIC(10,2) GENERATED ALWAYS AS
                            (round(preco_atacado * qtd_por_caixa, 2)) STORED,
  margem_pct              NUMERIC(5,2) GENERATED ALWAYS AS
                            (round(((preco_revenda_sugerido - preco_atacado)
                              / preco_revenda_sugerido) * 100, 2)) STORED,
  limite_caixas           INTEGER NOT NULL CHECK (limite_caixas > 0),
  estoque_caixas          INTEGER NOT NULL DEFAULT 0 CHECK (estoque_caixas >= 0),
  ativo                   BOOLEAN NOT NULL DEFAULT TRUE,
  ordem_exibicao          INTEGER NOT NULL DEFAULT 0,
  criado_em               TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX produtos_grupo_exibicao_idx ON produtos (grupo_exibicao);
CREATE INDEX produtos_ativo_estoque_idx ON produtos (ativo, estoque_caixas);
```

`PATCH /api/admin/produtos/:id` só deve tocar em `preco_atacado`,
`preco_revenda_sugerido`, `estoque_caixas`, `limite_caixas` (o kickoff
chama de `limite_percentual` mas a regra descrita — "rejeite item com
`quantidadeCaixas > limite_caixas`" — é claramente sobre limite de
caixas, não percentual; tratado como o mesmo campo) e `ativo`.

## `pedidos`

Cabeçalho do pedido. `idempotency_key` é o que garante o passo 1 do
`POST /api/pedidos` ("se já existe, retorne 200 com o pedido criado").
`numero` vem de `proximo_numero_pedido()` (ver seção Numeração), nunca
de `random()`.

```sql
CREATE TABLE pedidos (
  id                 SERIAL PRIMARY KEY,
  numero             TEXT NOT NULL UNIQUE,
  idempotency_key    UUID NOT NULL UNIQUE,
  contato_nome       TEXT NOT NULL,
  contato_email      TEXT NOT NULL,
  contato_whatsapp   TEXT NOT NULL,
  canal_preferido    TEXT NOT NULL CHECK (canal_preferido IN ('whatsapp', 'email')),
  valor_total        NUMERIC(10,2) NOT NULL CHECK (valor_total >= 0),
  status             TEXT NOT NULL DEFAULT 'novo'
                       CHECK (status IN ('novo', 'confirmado', 'faturado', 'cancelado')),
  observacoes        TEXT,
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`status` inicial `novo`; os demais valores existem para
`PATCH /api/admin/pedidos/:id`, que só deve tocar `status` e
`observacoes`. Ajuste a lista se o cliente pedir outro vocabulário —
isso é rótulo de admin, não regra de negócio travada em teste.

## `pedido_itens`

Um item por SKU pedido. Guarda snapshot do produto no momento da compra
— preço e estoque em `produtos` mudam com o tempo, o pedido não pode.

```sql
CREATE TABLE pedido_itens (
  id                      SERIAL PRIMARY KEY,
  pedido_id               INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  sku                     TEXT NOT NULL REFERENCES produtos(sku),
  quantidade_caixas       INTEGER NOT NULL CHECK (quantidade_caixas > 0),
  nome_snapshot           TEXT NOT NULL,
  cor_snapshot            TEXT,
  imagem_snapshot         TEXT NOT NULL,
  unidade_snapshot        TEXT NOT NULL,
  preco_atacado_snapshot  NUMERIC(10,2) NOT NULL,
  preco_caixa_snapshot    NUMERIC(10,2) NOT NULL,
  valor_item              NUMERIC(10,2) GENERATED ALWAYS AS
                            (round(preco_caixa_snapshot * quantidade_caixas, 2)) STORED,
  criado_em               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX pedido_itens_pedido_id_idx ON pedido_itens (pedido_id);
```

## `notificacoes`

Fila enfileirada na mesma transação do pedido, disparada depois do
commit. 4 registros por pedido: 2 `interno` (e-mail), 1 `grupo`
(whatsapp), 1 `cliente` (canal escolhido pelo contato).

```sql
CREATE TABLE notificacoes (
  id            SERIAL PRIMARY KEY,
  pedido_id     INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  canal         TEXT NOT NULL CHECK (canal IN ('email', 'whatsapp')),
  tipo          TEXT NOT NULL CHECK (tipo IN ('interno', 'grupo', 'cliente')),
  destino       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pendente'
                  CHECK (status IN ('pendente', 'enviado', 'falhou', 'contingencia')),
  tentativas    INTEGER NOT NULL DEFAULT 0,
  ultimo_erro   TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  enviado_em    TIMESTAMPTZ
);

CREATE INDEX notificacoes_pedido_id_idx ON notificacoes (pedido_id);
CREATE INDEX notificacoes_status_idx ON notificacoes (status) WHERE status <> 'enviado';
```

Retry (3 tentativas, 5s/30s/2min) e contingência são lógica do
`notificacao.service.js`, não do schema — a tabela só registra o
resultado de cada tentativa.

## `admin_usuarios`

```sql
CREATE TABLE admin_usuarios (
  id           SERIAL PRIMARY KEY,
  email        TEXT NOT NULL UNIQUE,
  senha_hash   TEXT NOT NULL,
  ativo        BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`senha_hash` é bcrypt cost 12, conforme o kickoff. Sem campo de nome —
o kickoff só menciona login por `{ email, senha }`; se precisar de nome
de exibição no admin, é um ADD COLUMN depois, não bloqueia nada agora.

## Numeração de pedido

O kickoff pede `RFS-<ano>-<sequencial 4 dígitos>` "de uma sequence
Postgres, não use random" — mas uma `SEQUENCE` do Postgres não reseta
sozinha por ano. A migration cria uma função que garante (via nome
dinâmico) uma sequence por ano civil e tira o próximo valor dela:

```sql
CREATE OR REPLACE FUNCTION proximo_numero_pedido(p_ano INTEGER)
RETURNS TEXT AS $$
DECLARE
  v_seq TEXT := format('pedidos_seq_%s', p_ano);
  v_val BIGINT;
BEGIN
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I', v_seq);
  EXECUTE format('SELECT nextval(%L)', v_seq) INTO v_val;
  RETURN format('RFS-%s-%s', p_ano, lpad(v_val::text, 4, '0'));
END;
$$ LANGUAGE plpgsql;
```

`pedido.service.js` chama
`SELECT proximo_numero_pedido(EXTRACT(YEAR FROM now())::int) AS numero`
dentro da mesma transação do `INSERT` — continua sendo uma sequence de
verdade (atômica, sem colisão sob concorrência), só criada sob demanda
por ano em vez de uma fixa no schema.

## Seed (`002_seed.sql`)

Catálogo real do protótipo v6: 2 produtos sem variante (`RFS-K3`,
`RFS-K6`) + 2 grupos com variante (`RFS-SUP-*`, `RFS-POTE-*`) — 9 linhas
no total, batendo com as 9 imagens embutidas no protótipo
(`k3, k6, sup_verde, sup_azul, sup_rosa, pote_preto, pote_azul,
pote_vermelho, pote_rosa`).

Preço e economia de `RFS-K3` e do grupo `pote-dobravel` vieram direto
do exemplo de `GET /api/produtos` no kickoff (`precoAtacado: 8.40`,
`precoRevenda: 11.90`, `qtdPorCaixa: 24` etc. para K3; `precoAtacado:
11.50`, `precoRevenda: 16.90`, `qtdPorCaixa: 20` para o grupo pote) —
não foram inventados. `RFS-K6` e `RFS-SUP` não têm exemplo no kickoff;
usei a mesma margem percentual do K3 (~29%) para o K6 e uma margem
similar (~30%) para o SUP, com `qtd_por_caixa`/`limite_caixas`
plausíveis para o tipo de produto. **Esses dois merecem confirmação do
cliente antes de virar preço real em produção** — sinalizado também no
seed com um comentário SQL.
