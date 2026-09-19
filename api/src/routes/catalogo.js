import { Router } from 'express';
import { pool } from '../db.js';

export const catalogoRouter = Router();

const CAMPOS_COMPARTILHADOS = ['precoAtacado', 'precoRevenda', 'qtdPorCaixa', 'unidade'];

catalogoRouter.get('/produtos', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT sku, grupo_exibicao, nome, descricao, imagem, cor, cor_hex,
             preco_atacado, preco_revenda_sugerido, qtd_por_caixa, unidade,
             preco_caixa, margem_pct, limite_caixas
        FROM produtos
       WHERE ativo = true AND estoque_caixas > 0
       ORDER BY ordem_exibicao, sku
    `);

    const grupos = new Map();

    for (const row of rows) {
      const chave = row.grupo_exibicao ?? row.sku;
      const camposPreco = {
        precoAtacado: Number(row.preco_atacado),
        precoRevenda: Number(row.preco_revenda_sugerido),
        qtdPorCaixa: row.qtd_por_caixa,
        unidade: row.unidade,
      };

      if (!grupos.has(chave)) {
        grupos.set(chave, {
          grupo: row.grupo_exibicao,
          nome: row.nome,
          descricao: row.descricao,
          ...camposPreco,
          precoCaixa: Number(row.preco_caixa),
          margemPct: Number(row.margem_pct),
          ...(row.grupo_exibicao
            ? { variantes: [] }
            : { sku: row.sku, imagem: row.imagem, limiteCaixas: row.limite_caixas, variantes: null }),
        });
      } else if (row.grupo_exibicao) {
        const atual = grupos.get(chave);
        const divergiu = CAMPOS_COMPARTILHADOS.some((campo) => atual[campo] !== camposPreco[campo]);
        if (divergiu) {
          console.warn(
            `catalogo: preco/qtd divergente no grupo "${chave}" — sku ${row.sku} usa os valores da primeira variante do grupo`,
          );
        }
      }

      if (row.grupo_exibicao) {
        grupos.get(chave).variantes.push({
          sku: row.sku,
          cor: row.cor,
          hex: row.cor_hex,
          imagem: row.imagem,
          limiteCaixas: row.limite_caixas,
        });
      }
    }

    res.json(Array.from(grupos.values()));
  } catch (err) {
    next(err);
  }
});
