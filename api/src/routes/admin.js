import { Router } from 'express';
import { pool } from '../db.js';
import { autenticar } from '../services/admin.service.js';
import { autenticarAdmin, COOKIE_ADMIN } from '../middleware/auth.js';
import { adminLoginRateLimit } from '../middleware/ratelimit.js';
import { ErroLoja, atualizarLoja, buscarLoja } from '../services/loja.service.js';
import { normalizarCodigo } from '../services/regras-pedido.js';
import { ErroEmail, reenviarEmails, situacaoEmail } from '../services/notificacao.service.js';
import multer from 'multer';
import {
  ErroFoto,
  MAX_BYTES_UPLOAD,
  adicionarFoto,
  alterarLegenda,
  excluirFoto,
  listarFotos,
  reordenarFotos,
  trocarFotoPrincipal,
} from '../services/fotos.service.js';

export const adminRouter = Router();

const CAMPOS_PRODUTO_EDITAVEIS = ['preco_unitario', 'ativo'];

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

adminRouter.get('/admin/me', autenticarAdmin, (req, res) => {
  res.json({ email: req.admin.email });
});

adminRouter.post('/admin/logout', autenticarAdmin, (req, res) => {
  res.clearCookie(COOKIE_ADMIN);
  res.json({ ok: true });
});

adminRouter.get('/admin/produtos', autenticarAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.*, coalesce(p.grupo_exibicao, p.sku) AS chave_fotos,
             (SELECT count(*)::int FROM produto_fotos f WHERE f.chave = coalesce(p.grupo_exibicao, p.sku)) AS fotos_extras
        FROM produtos p
       ORDER BY p.ordem_exibicao, p.sku
    `);
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
    if ('preco_unitario' in updates && !(Number(updates.preco_unitario) > 0 && Number(updates.preco_unitario) < 100000)) {
      return res.status(400).json({ erro: { codigo: 'DADOS_INVALIDOS', mensagem: 'Preço unitário inválido' } });
    }
    if ('ativo' in updates && typeof updates.ativo !== 'boolean') {
      return res.status(400).json({ erro: { codigo: 'DADOS_INVALIDOS', mensagem: 'ativo deve ser verdadeiro ou falso' } });
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

    // Busca por código do cliente (ignora hífen/espaço/caixa), número interno, nome ou razão social.
    const busca = String(req.query.busca ?? '').trim().slice(0, 100);
    const filtro = busca
      ? `WHERE regexp_replace(codigo_publico, '[^A-Z0-9]', '', 'g') LIKE '%' || $3 || '%'
            OR numero ILIKE '%' || $4 || '%'
            OR contato_nome ILIKE '%' || $4 || '%'
            OR razao_social ILIKE '%' || $4 || '%'
            OR nome_fantasia ILIKE '%' || $4 || '%'`
      : '';
    const paramsBusca = busca ? [normalizarCodigo(busca) || '#', busca.replace(/[%_\\]/g, '\\$&')] : [];

    const { rows: pedidos } = await pool.query(
      `SELECT * FROM pedidos ${filtro} ORDER BY criado_em DESC LIMIT $1 OFFSET $2`,
      [porPagina, offset, ...paramsBusca],
    );
    const { rows: totalRows } = await pool.query(
      `SELECT count(*)::int AS total FROM pedidos ${filtro.replaceAll('$3', '$1').replaceAll('$4', '$2')}`,
      paramsBusca,
    );

    const ids = pedidos.map((p) => p.id);
    const { rows: itens } = ids.length
      ? await pool.query('SELECT * FROM pedido_itens WHERE pedido_id = ANY($1) ORDER BY id', [ids])
      : { rows: [] };

    const { rows: emails } = ids.length
      ? await pool.query(
          `SELECT id, pedido_id, tipo, destino, status, tentativas, ultimo_erro, enviado_em
             FROM notificacoes WHERE pedido_id = ANY($1) AND canal = 'email' ORDER BY id`,
          [ids],
        )
      : { rows: [] };
    const emailsPorPedido = new Map();
    for (const e of emails) {
      if (!emailsPorPedido.has(e.pedido_id)) emailsPorPedido.set(e.pedido_id, []);
      emailsPorPedido.get(e.pedido_id).push(e);
    }

    const itensPorPedido = new Map();
    for (const item of itens) {
      if (!itensPorPedido.has(item.pedido_id)) itensPorPedido.set(item.pedido_id, []);
      itensPorPedido.get(item.pedido_id).push(item);
    }

    res.json({
      pagina,
      porPagina,
      total: totalRows[0].total,
      emailConfigurado: situacaoEmail().configurado,
      pedidos: pedidos.map((p) => ({ ...p, itens: itensPorPedido.get(p.id) ?? [], emails: emailsPorPedido.get(p.id) ?? [] })),
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

adminRouter.get('/admin/loja', autenticarAdmin, async (req, res, next) => {
  try {
    res.json(await buscarLoja({ incluirPrivados: true }));
  } catch (err) {
    next(err);
  }
});

adminRouter.put('/admin/loja', autenticarAdmin, async (req, res, next) => {
  try {
    res.json(await atualizarLoja(req.body));
  } catch (err) {
    if (err instanceof ErroLoja) {
      return res.status(400).json({ erro: { codigo: 'DADOS_INVALIDOS', mensagem: err.message, campo: err.campo } });
    }
    next(err);
  }
});

adminRouter.post('/admin/pedidos/:id/reenviar-emails', autenticarAdmin, async (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ erro: { codigo: 'DADOS_INVALIDOS', mensagem: 'Pedido inválido' } });
    }
    const emails = await reenviarEmails(id);
    if (!emails) return res.status(404).json({ erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Pedido não encontrado' } });
    res.json({ emails });
  } catch (err) {
    if (err instanceof ErroEmail) {
      return res.status(409).json({ erro: { codigo: 'EMAIL_NAO_CONFIGURADO', mensagem: err.message } });
    }
    next(err);
  }
});

// ---- Fotos do produto -------------------------------------------------------
// :chave = grupo_exibicao (produto com cores) ou sku (produto sem variantes).

const receberFoto = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES_UPLOAD, files: 1 } }).single('foto');

function comFoto(handler) {
  return (req, res, next) => {
    receberFoto(req, res, async (err) => {
      if (err instanceof multer.MulterError) {
        const grande = err.code === 'LIMIT_FILE_SIZE';
        return res.status(grande ? 413 : 400).json({
          erro: { codigo: grande ? 'ARQUIVO_GRANDE' : 'DADOS_INVALIDOS', mensagem: grande ? 'Foto acima de 10 MB' : 'Envio inválido' },
        });
      }
      if (err) return next(err);
      if (!req.file) {
        return res.status(400).json({ erro: { codigo: 'DADOS_INVALIDOS', mensagem: 'Envie a foto no campo "foto"' } });
      }
      try {
        await handler(req, res);
      } catch (erro) {
        responderErroFoto(erro, res, next);
      }
    });
  };
}

function responderErroFoto(err, res, next) {
  if (err instanceof ErroFoto) {
    return res.status(err.status).json({ erro: { codigo: err.codigo, mensagem: err.message } });
  }
  next(err);
}

function rotaFoto(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (err) {
      responderErroFoto(err, res, next);
    }
  };
}

function idFoto(req) {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) throw new ErroFoto('Foto inválida');
  return id;
}

adminRouter.get('/admin/produtos/:chave/fotos', autenticarAdmin, rotaFoto(async (req, res) => {
  res.json(await listarFotos(req.params.chave));
}));

adminRouter.post('/admin/produtos/:chave/fotos', autenticarAdmin, comFoto(async (req, res) => {
  res.status(201).json(await adicionarFoto(req.params.chave, req.file.buffer, req.body?.legenda));
}));

adminRouter.put('/admin/produtos/:chave/fotos/ordem', autenticarAdmin, rotaFoto(async (req, res) => {
  res.json(await reordenarFotos(req.params.chave, req.body?.ids));
}));

adminRouter.patch('/admin/fotos/:id', autenticarAdmin, rotaFoto(async (req, res) => {
  res.json(await alterarLegenda(idFoto(req), req.body?.legenda));
}));

adminRouter.delete('/admin/fotos/:id', autenticarAdmin, rotaFoto(async (req, res) => {
  await excluirFoto(idFoto(req));
  res.json({ ok: true });
}));

adminRouter.put('/admin/produtos/:sku/imagem', autenticarAdmin, comFoto(async (req, res) => {
  res.json(await trocarFotoPrincipal(req.params.sku, req.file.buffer));
}));
