-- Clientes e ciclo Solicitação → Pedido (decisão do usuário, 2026-10-23):
--   * o que chega pelo site é uma SOLICITAÇÃO (status 'novo'); vira PEDIDO quando o vendedor confirma
--     (status 'confirmado'/'faturado'); 'cancelado' também significa "não convertido";
--   * confirmar exige cliente vinculado ("tem que ter lastro") — venda sem cadastro usa "Venda balcão";
--   * vendas fora do site são lançadas no admin como pedido (origem 'admin');
--   * vendedor (da Rufus) fica no cliente (carteira) e no pedido (quem fechou), texto livre;
--   * pedidos já confirmados em produção são vinculados manualmente pelo admin.

CREATE TABLE clientes (
  id                  SERIAL PRIMARY KEY,
  tipo                TEXT NOT NULL DEFAULT 'PJ' CHECK (tipo IN ('PF', 'PJ')),
  nome                TEXT NOT NULL CHECK (btrim(nome) <> ''),   -- nome (PF) ou razão social (PJ)
  nome_fantasia       TEXT NOT NULL DEFAULT '',
  documento           TEXT NOT NULL DEFAULT '',                   -- CPF ou CNPJ, só dígitos
  inscricao_estadual  TEXT NOT NULL DEFAULT '',                   -- número ou "ISENTO"
  comprador           TEXT NOT NULL DEFAULT '',                   -- pessoa que compra no cliente
  whatsapp            TEXT NOT NULL DEFAULT '',                   -- do comprador, só dígitos
  email               TEXT NOT NULL DEFAULT '',                   -- do comprador
  cidade              TEXT NOT NULL DEFAULT '',
  uf                  TEXT NOT NULL DEFAULT '',
  endereco            TEXT NOT NULL DEFAULT '',
  vendedor            TEXT NOT NULL DEFAULT '',                   -- vendedor da Rufus responsável (carteira)
  observacoes         TEXT NOT NULL DEFAULT '',
  ativo               BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX clientes_documento_key ON clientes (documento) WHERE documento <> '';
CREATE INDEX clientes_whatsapp_idx ON clientes (whatsapp) WHERE whatsapp <> '';
CREATE INDEX clientes_email_idx ON clientes (lower(email)) WHERE email <> '';

INSERT INTO clientes (tipo, nome, observacoes)
VALUES ('PF', 'Venda balcão', 'Cliente genérico para vendas sem cadastro.');

ALTER TABLE pedidos
  ADD COLUMN cliente_id INTEGER REFERENCES clientes(id),
  ADD COLUMN vendedor   TEXT NOT NULL DEFAULT '',
  ADD COLUMN origem     TEXT NOT NULL DEFAULT 'site' CHECK (origem IN ('site', 'admin'));
CREATE INDEX pedidos_cliente_id_idx ON pedidos (cliente_id) WHERE cliente_id IS NOT NULL;
