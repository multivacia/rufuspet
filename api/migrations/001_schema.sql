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

CREATE TABLE admin_usuarios (
  id           SERIAL PRIMARY KEY,
  email        TEXT NOT NULL UNIQUE,
  senha_hash   TEXT NOT NULL,
  ativo        BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION proximo_numero_pedido(p_ano INTEGER)
RETURNS TEXT AS $$
DECLARE
  v_seq TEXT := format('pedidos_seq_%s', p_ano);
  v_val BIGINT;
BEGIN
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I', v_seq);
  EXECUTE format('SELECT nextval(%I)', v_seq) INTO v_val;
  RETURN format('RFS-%s-%s', p_ano, lpad(v_val::text, 4, '0'));
END;
$$ LANGUAGE plpgsql;
