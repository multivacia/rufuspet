-- Dados da loja exibidos no rodapé do site e nos e-mails, editáveis pelo admin (tela "Loja").
-- Tabela de uma linha só (id = 1). Campos vazios não aparecem no site.
CREATE TABLE loja_config (
  id             SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  nome           TEXT NOT NULL DEFAULT 'Rufus',
  razao_social   TEXT NOT NULL DEFAULT '',
  cnpj           TEXT NOT NULL DEFAULT '',
  telefone       TEXT NOT NULL DEFAULT '',
  whatsapp       TEXT NOT NULL DEFAULT '',
  email_contato  TEXT NOT NULL DEFAULT '',
  endereco       TEXT NOT NULL DEFAULT '',
  horario        TEXT NOT NULL DEFAULT '',
  instagram      TEXT NOT NULL DEFAULT '',
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO loja_config (id) VALUES (1);
