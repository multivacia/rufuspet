-- Entrada (compra) com fornecedor e documento como campos próprios (decisão do usuário, 2026-10-23):
-- texto livre e opcionais; origem (importado/nacional) não é registrada — o nome do fornecedor basta.
ALTER TABLE estoque_lotes
  ADD COLUMN fornecedor TEXT NOT NULL DEFAULT '',
  ADD COLUMN documento  TEXT NOT NULL DEFAULT '';
