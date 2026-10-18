-- Decisão do cliente (2026-10-11):
--   * o pet shop compra por UNIDADE, pelo preço do catálogo (R$ 11,90 / 18,90 / 12,90 / 16,90);
--     não há venda por caixa nem preço de atacado/revenda sugerida;
--   * não há controle de estoque nem limite por pedido no site;
--   * o pedido identifica a empresa (razão social, CNPJ, cidade/UF).
-- Ver docs/rufus-data-model.md, seção "Migration 003".

-- produtos: preço unitário único; saem colunas de caixa, margem e estoque.
ALTER TABLE produtos ADD COLUMN preco_unitario NUMERIC(10,2);
UPDATE produtos SET preco_unitario = preco_revenda_sugerido;
ALTER TABLE produtos
  ALTER COLUMN preco_unitario SET NOT NULL,
  ADD CONSTRAINT produtos_preco_unitario_check CHECK (preco_unitario > 0);

DROP INDEX IF EXISTS produtos_ativo_estoque_idx;
ALTER TABLE produtos
  DROP COLUMN preco_caixa,
  DROP COLUMN margem_pct,
  DROP COLUMN preco_atacado,
  DROP COLUMN preco_revenda_sugerido,
  DROP COLUMN qtd_por_caixa,
  DROP COLUMN limite_caixas,
  DROP COLUMN estoque_caixas;
CREATE INDEX produtos_ativo_idx ON produtos (ativo);

-- Fotos atualizadas enviadas pelo cliente.
UPDATE produtos SET imagem = '/produtos/' || lower(sku) || '.webp';

-- pedido_itens: quantidade em unidades e snapshot do preço unitário.
-- O RENAME mantém a coluna gerada valor_item = preço × quantidade apontando para os novos nomes.
ALTER TABLE pedido_itens RENAME COLUMN quantidade_caixas TO quantidade;
ALTER TABLE pedido_itens RENAME COLUMN preco_caixa_snapshot TO preco_unitario_snapshot;
ALTER TABLE pedido_itens DROP COLUMN preco_atacado_snapshot;
ALTER TABLE pedido_itens RENAME CONSTRAINT pedido_itens_quantidade_caixas_check TO pedido_itens_quantidade_check;

-- pedidos: dados da empresa compradora.
ALTER TABLE pedidos
  ADD COLUMN razao_social  TEXT NOT NULL DEFAULT '',
  ADD COLUMN nome_fantasia TEXT NOT NULL DEFAULT '',
  ADD COLUMN cnpj          TEXT NOT NULL DEFAULT '',
  ADD COLUMN cidade        TEXT NOT NULL DEFAULT '',
  ADD COLUMN uf            TEXT NOT NULL DEFAULT '';
ALTER TABLE pedidos
  ALTER COLUMN razao_social DROP DEFAULT,
  ALTER COLUMN cnpj DROP DEFAULT,
  ALTER COLUMN cidade DROP DEFAULT,
  ALTER COLUMN uf DROP DEFAULT;
