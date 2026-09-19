-- RFS-K3 e o grupo pote-dobravel usam os números exatos do exemplo de
-- GET /api/produtos no kickoff (preco_atacado/preco_revenda/qtd_por_caixa).
-- RFS-K6 e RFS-SUP-* não têm exemplo no kickoff: preco_atacado foi
-- estimado aplicando a mesma faixa de margem do K3/POTE (~29-30%) sobre
-- o preco_revenda que já veio do config.json do protótipo. CONFIRMAR
-- com o cliente antes de ir pra produção.

INSERT INTO produtos
  (sku, grupo_exibicao, nome, descricao, imagem, cor, cor_hex,
   preco_atacado, preco_revenda_sugerido, qtd_por_caixa, unidade,
   limite_caixas, estoque_caixas, ordem_exibicao)
VALUES
  ('RFS-K3', NULL, 'Kit 3 rolos',
   'Saquinhos higiênicos, 15 sacos por rolo. Blister com gancho para gôndola.',
   '/produtos/rfs-k3.jpg', NULL, NULL,
   8.40, 11.90, 24, 'kit', 8, 50, 10),

  ('RFS-K6', NULL, 'Kit 6 rolos',
   'Formato família. Mesmo rolo do kit 3, embalagem com 6 unidades.',
   '/produtos/rfs-k6.jpg', NULL, NULL,
   13.30, 18.90, 12, 'kit', 6, 30, 20),

  ('RFS-SUP-VERDE', 'suporte-osso', 'Suporte + 2 rolos',
   'Dispenser em formato de osso com mosquetão para a coleira, acompanha 2 rolos.',
   '/produtos/rfs-sup2-verde.jpg', 'Verde', '#3EAE49',
   9.00, 12.90, 24, 'unidade', 8, 20, 30),

  ('RFS-SUP-AZUL', 'suporte-osso', 'Suporte + 2 rolos',
   'Dispenser em formato de osso com mosquetão para a coleira, acompanha 2 rolos.',
   '/produtos/rfs-sup2-azul.jpg', 'Azul', '#2B3F9E',
   9.00, 12.90, 24, 'unidade', 8, 20, 30),

  ('RFS-SUP-ROSA', 'suporte-osso', 'Suporte + 2 rolos',
   'Dispenser em formato de osso com mosquetão para a coleira, acompanha 2 rolos.',
   '/produtos/rfs-sup2-rosa.jpg', 'Rosa', '#E8408C',
   9.00, 12.90, 24, 'unidade', 8, 20, 30),

  ('RFS-POTE-PRETO', 'pote-dobravel', 'Pote dobrável com mosquetão',
   'Silicone retrátil, borda rígida, mosquetão para coleira ou mochila.',
   '/produtos/rfs-pote-preto.jpg', 'Preto', '#25272B',
   11.50, 16.90, 20, 'unidade', 6, 20, 40),

  ('RFS-POTE-AZUL', 'pote-dobravel', 'Pote dobrável com mosquetão',
   'Silicone retrátil, borda rígida, mosquetão para coleira ou mochila.',
   '/produtos/rfs-pote-azul.jpg', 'Azul', '#1155DD',
   11.50, 16.90, 20, 'unidade', 6, 20, 40),

  ('RFS-POTE-VERMELHO', 'pote-dobravel', 'Pote dobrável com mosquetão',
   'Silicone retrátil, borda rígida, mosquetão para coleira ou mochila.',
   '/produtos/rfs-pote-vermelho.jpg', 'Vermelho', '#E01F26',
   11.50, 16.90, 20, 'unidade', 6, 20, 40),

  ('RFS-POTE-ROSA', 'pote-dobravel', 'Pote dobrável com mosquetão',
   'Silicone retrátil, borda rígida, mosquetão para coleira ou mochila.',
   '/produtos/rfs-pote-rosa.jpg', 'Rosa', '#F31C8D',
   11.50, 16.90, 20, 'unidade', 6, 20, 40);
