-- Código do pedido mostrado ao cliente (não revela o volume de vendas, ao contrário de pedidos.numero,
-- que continua sequencial e só aparece para a equipe).
-- Formato: RF-DDMM-XXX — dia/mês do pedido (horário de Brasília) + 3 caracteres de um alfabeto sem
-- símbolos ambíguos (sem 0/O, 1/I/L, 2/Z, 5/S). Único em toda a tabela.
ALTER TABLE pedidos ADD COLUMN codigo_publico TEXT;

-- Preenche os pedidos já existentes com a data em que foram feitos.
DO $$
DECLARE
  alfabeto CONSTANT TEXT := 'ABCDEFGHJKMNPQRTUVWXY346789';
  p RECORD;
  candidato TEXT;
BEGIN
  FOR p IN SELECT id, criado_em FROM pedidos WHERE codigo_publico IS NULL ORDER BY id LOOP
    LOOP
      candidato := 'RF-' || to_char(p.criado_em AT TIME ZONE 'America/Sao_Paulo', 'DDMM') || '-'
        || substr(alfabeto, 1 + floor(random() * 27)::int, 1)
        || substr(alfabeto, 1 + floor(random() * 27)::int, 1)
        || substr(alfabeto, 1 + floor(random() * 27)::int, 1);
      EXIT WHEN NOT EXISTS (SELECT 1 FROM pedidos WHERE codigo_publico = candidato);
    END LOOP;
    UPDATE pedidos SET codigo_publico = candidato WHERE id = p.id;
  END LOOP;
END $$;

ALTER TABLE pedidos ALTER COLUMN codigo_publico SET NOT NULL;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_codigo_publico_key UNIQUE (codigo_publico);
