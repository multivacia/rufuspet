import { Router } from 'express';
import { pool } from '../db.js';
import { buscarLoja } from '../services/loja.service.js';

export const catalogoRouter = Router();

catalogoRouter.get('/produtos', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT sku, grupo_exibicao, nome, descricao, imagem, cor, cor_hex, preco_unitario, unidade
        FROM produtos
       WHERE ativo = true
       ORDER BY ordem_exibicao, sku
    `);

    const grupos = new Map();

    for (const row of rows) {
      const chave = row.grupo_exibicao ?? row.sku;
      const precoUnitario = Number(row.preco_unitario);

      if (!grupos.has(chave)) {
        grupos.set(chave, {
          grupo: row.grupo_exibicao,
          nome: row.nome,
          descricao: row.descricao,
          precoUnitario,
          unidade: row.unidade,
          ...(row.grupo_exibicao ? { variantes: [] } : { sku: row.sku, imagem: row.imagem, variantes: null }),
        });
      } else if (grupos.get(chave).precoUnitario !== precoUnitario) {
        console.warn(`catalogo: preço divergente no grupo "${chave}" — sku ${row.sku} usa o preço da primeira variante`);
      }

      if (row.grupo_exibicao) {
        grupos.get(chave).variantes.push({ sku: row.sku, cor: row.cor, hex: row.cor_hex, imagem: row.imagem });
      }
    }

    res.json(Array.from(grupos.values()));
  } catch (err) {
    next(err);
  }
});

catalogoRouter.get('/loja', async (req, res, next) => {
  try {
    res.json(await buscarLoja());
  } catch (err) {
    next(err);
  }
});
