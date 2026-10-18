-- Destinatários do aviso de novo pedido, editáveis no admin (tela "Loja").
-- Vários endereços separados por vírgula. Vazio = usa EMAILS_INTERNOS do .env da API.
-- Não é exposto em GET /api/loja (público).
ALTER TABLE loja_config ADD COLUMN emails_internos TEXT NOT NULL DEFAULT '';
