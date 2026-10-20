-- Valor mínimo do pedido (R$), editável no admin (tela "Loja"). 0 = sem mínimo.
-- Exibido no site e validado pela API ao criar o pedido.
ALTER TABLE loja_config
  ADD COLUMN pedido_minimo NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (pedido_minimo >= 0);
