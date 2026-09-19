import { Router } from 'express';
import { pool } from '../db.js';
import { autenticar } from '../services/admin.service.js';
import { autenticarAdmin, COOKIE_ADMIN } from '../middleware/auth.js';
import { adminLoginRateLimit } from '../middleware/ratelimit.js';

export const adminRouter = Router();

const CAMPOS_PRODUTO_EDITAVEIS = [
  'preco_atacado',
  'preco_revenda_sugerido',
  'estoque_caixas',
  'limite_caixas',
  'ativo',
];

const STATUS_PEDIDO_VALIDOS = ['novo', 'confirmado', 'faturado', 'cancelado'];

function montarUpdate(body, camposPermitidos) {
  const updates = {};
  for (const campo of camposPermitidos) {
    if (Object.prototype.hasOwnProperty.call(body ?? {}, campo)) {
      updates[campo] = body[campo];
    }
  }
  return updates;
}

adminRouter.post('/admin/login', adminLoginRateLimit, async (req, res, next) => {
  try {
    const { email, senha } = req.body ?? {};
    if (!email || !senha) {
      return res.status(400).json({ erro: { codigo: 'DADOS_INVALIDOS', mensagem: 'E-mail e senha são obrigatórios' } });
    }

    const token = await autenticar(email, senha);
    if (!token) {
      return res.status(401).json({ erro: { codigo: 'CREDENCIAIS_INVALIDAS', mensagem: 'E-mail ou senha inválidos' } });
    }

    res.cookie(COOKIE_ADMIN, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/admin/logout', autenticarAdmin, (req, res) => {
  res.clearCookie(COOKIE_ADMIN);
  res.json({ ok: true });
});

adminRouter.get('/admin/produtos', autenticarAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM produtos ORDER BY ordem_exibicao, sku');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/admin/produtos/:sku', autenticarAdmin, async (req, res, next) => {
  try {
    const updates = montarUpdate(req.body, CAMPOS_PRODUTO_EDITAVEIS);
    const campos = Object.keys(updates);
    if (campos.length === 0) {
      return res.status(400).json({ erro: { codigo: 'DADOS_INVALIDOS', mensagem: 'Nenhum campo editável informado' } });
    }

    const sets = campos.map((campo, i) => `${campo} = $${i + 2}`).join(', ');
    const valores = campos.map((campo) => updates[campo]);

    const { rows } = await pool.query(
      `UPDATE produtos SET ${sets}, atualizado_em = now() WHERE sku = $1 RETURNING *`,
      [req.params.sku, ...valores],
    );

    if (rows.length === 0) {
      return res.status(404).json({ erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Produto não encontrado' } });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/admin/pedidos', autenticarAdmin, async (req, res, next) => {
  try {
    const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
    const porPagina = Math.min(50, Math.max(1, parseInt(req.query.porPagina, 10) || 20));
    const offset = (pagina - 1) * porPagina;

    const { rows: pedidos } = await pool.query(
      'SELECT * FROM pedidos ORDER BY criado_em DESC LIMIT $1 OFFSET $2',
      [porPagina, offset],
    );
    const { rows: totalRows } = await pool.query('SELECT count(*)::int AS total FROM pedidos');

    const ids = pedidos.map((p) => p.id);
    const { rows: itens } = ids.length
      ? await pool.query('SELECT * FROM pedido_itens WHERE pedido_id = ANY($1) ORDER BY id', [ids])
      : { rows: [] };

    const itensPorPedido = new Map();
    for (const item of itens) {
      if (!itensPorPedido.has(item.pedido_id)) itensPorPedido.set(item.pedido_id, []);
      itensPorPedido.get(item.pedido_id).push(item);
    }

    res.json({
      pagina,
      porPagina,
      total: totalRows[0].total,
      pedidos: pedidos.map((p) => ({ ...p, itens: itensPorPedido.get(p.id) ?? [] })),
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/admin/pedidos/:id', autenticarAdmin, async (req, res, next) => {
  try {
    if (
      Object.prototype.hasOwnProperty.call(req.body ?? {}, 'status') &&
      !STATUS_PEDIDO_VALIDOS.includes(req.body.status)
    ) {
      return res.status(400).json({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: `status deve ser um de: ${STATUS_PEDIDO_VALIDOS.join(', ')}` },
      });
    }

    const updates = montarUpdate(req.body, ['status', 'observacoes']);
    const campos = Object.keys(updates);
    if (campos.length === 0) {
      return res.status(400).json({ erro: { codigo: 'DADOS_INVALIDOS', mensagem: 'Nenhum campo editável informado' } });
    }

    const sets = campos.map((campo, i) => `${campo} = $${i + 2}`).join(', ');
    const valores = campos.map((campo) => updates[campo]);

    const { rows } = await pool.query(
      `UPDATE pedidos SET ${sets}, atualizado_em = now() WHERE id = $1 RETURNING *`,
      [req.params.id, ...valores],
    );

    if (rows.length === 0) {
      return res.status(404).json({ erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Pedido não encontrado' } });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});
