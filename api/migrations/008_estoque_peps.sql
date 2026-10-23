-- Controle de estoque no admin (decisão do usuário, 2026-10-23):
--   * saldo por SKU, só no admin (o site público não mostra nem limita);
--   * cada compra (entrada) guarda o próprio custo unitário — vira um lote;
--   * saídas consomem os lotes mais antigos primeiro (PEPS), e o custo da venda é o desses lotes;
--   * a baixa do pedido acontece quando o admin o passa para confirmado/faturado, bloqueada se faltar saldo;
--     voltar para novo/cancelado estorna para os mesmos lotes;
--   * pedidos anteriores a esta migration começam sem baixa.

-- Lote = uma compra/entrada. O saldo do SKU é a soma de quantidade_restante.
CREATE TABLE estoque_lotes (
  id                   SERIAL PRIMARY KEY,
  sku                  TEXT NOT NULL REFERENCES produtos(sku),
  data_entrada         DATE NOT NULL,
  quantidade_inicial   INTEGER NOT NULL CHECK (quantidade_inicial > 0),
  quantidade_restante  INTEGER NOT NULL CHECK (quantidade_restante >= 0),
  custo_unitario       NUMERIC(12,4) NOT NULL CHECK (custo_unitario >= 0),
  observacao           TEXT NOT NULL DEFAULT '',
  criado_por           TEXT NOT NULL DEFAULT '',
  criado_em            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (quantidade_restante <= quantidade_inicial)
);
-- Ordem PEPS: data da compra, depois ordem de lançamento.
CREATE INDEX estoque_lotes_peps_idx ON estoque_lotes (sku, data_entrada, id) WHERE quantidade_restante > 0;

-- Histórico. quantidade com sinal: entrada/estorno > 0, saídas < 0. custo_total sempre positivo.
CREATE TABLE estoque_movimentos (
  id           SERIAL PRIMARY KEY,
  sku          TEXT NOT NULL REFERENCES produtos(sku),
  tipo         TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida_pedido', 'estorno_pedido', 'baixa_manual', 'entrada_excluida')),
  quantidade   INTEGER NOT NULL CHECK (quantidade <> 0),
  custo_total  NUMERIC(14,4) NOT NULL DEFAULT 0,
  lote_id      INTEGER REFERENCES estoque_lotes(id) ON DELETE SET NULL,
  pedido_id    INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
  motivo       TEXT NOT NULL DEFAULT '',
  criado_por   TEXT NOT NULL DEFAULT '',
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX estoque_movimentos_sku_idx ON estoque_movimentos (sku, criado_em DESC);
CREATE INDEX estoque_movimentos_pedido_idx ON estoque_movimentos (pedido_id) WHERE pedido_id IS NOT NULL;

-- Quanto cada saída tirou de cada lote (permite custo exato da venda e estorno para o mesmo lote).
CREATE TABLE estoque_consumos (
  id              SERIAL PRIMARY KEY,
  movimento_id    INTEGER NOT NULL REFERENCES estoque_movimentos(id) ON DELETE CASCADE,
  lote_id         INTEGER NOT NULL REFERENCES estoque_lotes(id),
  quantidade      INTEGER NOT NULL CHECK (quantidade > 0),
  custo_unitario  NUMERIC(12,4) NOT NULL,
  estornado       BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX estoque_consumos_movimento_idx ON estoque_consumos (movimento_id);
CREATE INDEX estoque_consumos_lote_idx ON estoque_consumos (lote_id);

-- Marca de baixa do pedido (NULL = sem baixa; vale também para todos os pedidos já existentes).
ALTER TABLE pedidos ADD COLUMN estoque_baixado_em TIMESTAMPTZ;
