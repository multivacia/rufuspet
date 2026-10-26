-- Fotos extras do produto (a principal continua em produtos.imagem, por SKU/cor).
-- As extras valem para o produto inteiro, independente da cor:
-- chave = grupo_exibicao quando o produto tem variantes, senão o próprio sku.
-- Numerada 011 para não colidir com 008–010 do develop (o runner controla por nome).
CREATE TABLE produto_fotos (
  id         SERIAL PRIMARY KEY,
  chave      TEXT NOT NULL,
  arquivo    TEXT NOT NULL UNIQUE,
  legenda    TEXT NOT NULL DEFAULT '' CHECK (char_length(legenda) <= 60),
  ordem      INTEGER NOT NULL DEFAULT 0,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX produto_fotos_chave_idx ON produto_fotos (chave, ordem);
