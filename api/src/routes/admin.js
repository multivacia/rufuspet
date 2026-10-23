import { Router } from 'express';
import { pool } from '../db.js';
import { autenticar } from '../services/admin.service.js';
import { autenticarAdmin, COOKIE_ADMIN } from '../middleware/auth.js';
import { adminLoginRateLimit } from '../middleware/ratelimit.js';
import { ErroLoja, atualizarLoja, buscarLoja } from '../services/loja.service.js';
import { normalizarCodigo } from '../services/regras-pedido.js';
import { ErroEmail, reenviarEmails, situacaoEmail } from '../services/notificacao.service.js';
import {
  ErroEstoque,
  custoDosPedidos,
  excluirEntrada,
  listarFornecedores,
  listarLotes,
  listarMovimentos,
  listarSaldos,
  registrarBaixaManual,
  registrarEntrada,
} from '../services/estoque.service.js';
import {
  ErroCliente,
  atualizarCliente,
  buscarCliente,
  criarCliente,
  listarClientes,
  listarVendedores,
  sugerirClientesParaPedido,
} from '../services/clientes.service.js';
import { ErroPedidoAdmin, atualizarPedidoAdmin, criarPedidoAdmin } from '../services/pedido-admin.service.js';

export const adminRouter = Router();

const CAMPOS_PRODUTO_EDITAVEIS = ['preco_unitario', 'ativo'];

// Fases da tela de Pedidos: 'novo' é a solicitação do site; confirmado/faturado é o pedido de verdade.
const FASES = {
  solicitacoes: ['novo'],
  pedidos: ['confirmado', 'faturado'],
  cancelados: ['cancelado'],
};

function responderErroEstoque(res, err) {
  return res.status(err.status).json({
    erro: { codigo: err.codigo, mensagem: err.message, campo: err.campo, faltas: err.faltas },
  });
}

/** Erros de regra (estoque, cliente, pedido) → resposta JSON; outros seguem para o handler geral. */
function erroDeRegra(res, err) {
  if (err instanceof ErroEstoque) return responderErroEstoque(res, err);
  if (err instanceof ErroCliente || err instanceof ErroPedidoAdmin) {
    return res.status(err.status).json({ erro: { codigo: err.codigo, mensagem: err.message, campo: err.campo } });
  }
  return null;
}

function idValido(bruto) {
  const id = Number.parseInt(bruto, 10);
  return Number.isInteger(id) && id > 0 && String(id) === String(bruto).trim() ? id : null;
}

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

    // Busca por código do cliente (ignora hífen/espaço/caixa), número interno, nome, razão social ou cliente vinculado.
    const busca = String(req.query.busca ?? '').trim().slice(0, 100);
    const condicoes = [];
    const params = [];
    if (busca) {
      params.push(normalizarCodigo(busca) || '#', busca.replace(/[%_\\]/g, '\\$&'));
      const c = `$${params.length - 1}`;
      const t = `$${params.length}`;
      condicoes.push(`(regexp_replace(p.codigo_publico, '[^A-Z0-9]', '', 'g') LIKE '%' || ${c} || '%'
            OR p.numero ILIKE '%' || ${t} || '%' OR p.contato_nome ILIKE '%' || ${t} || '%'
            OR p.razao_social ILIKE '%' || ${t} || '%' OR p.nome_fantasia ILIKE '%' || ${t} || '%'
            OR cl.nome ILIKE '%' || ${t} || '%' OR cl.nome_fantasia ILIKE '%' || ${t} || '%')`);
    }
    const fase = FASES[req.query.fase];
    if (fase) {
      params.push(fase);
      condicoes.push(`p.status = ANY($${params.length})`);
    }
    const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';

    const { rows: pedidos } = await pool.query(
      `SELECT p.*, cl.nome AS cliente_nome, cl.nome_fantasia AS cliente_nome_fantasia
         FROM pedidos p LEFT JOIN clientes cl ON cl.id = p.cliente_id
        ${where} ORDER BY p.criado_em DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, porPagina, offset],
    );
    const { rows: totalRows } = await pool.query(
      `SELECT count(*)::int AS total FROM pedidos p LEFT JOIN clientes cl ON cl.id = p.cliente_id ${where}`,
      params,
    );
    const { rows: contagem } = await pool.query(
      `SELECT count(*) FILTER (WHERE status = 'novo')::int AS solicitacoes,
              count(*) FILTER (WHERE status IN ('confirmado', 'faturado'))::int AS pedidos,
              count(*) FILTER (WHERE status IN ('confirmado', 'faturado') AND cliente_id IS NULL)::int AS sem_cliente
         FROM pedidos`,
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

    const custos = await custoDosPedidos(pedidos.filter((p) => p.estoque_baixado_em).map((p) => p.id));

    res.json({
      pagina,
      porPagina,
      total: totalRows[0].total,
      emailConfigurado: situacaoEmail().configurado,
      contagem: contagem[0],
      pedidos: pedidos.map((p) => ({
        ...p,
        itens: itensPorPedido.get(p.id) ?? [],
        emails: emailsPorPedido.get(p.id) ?? [],
        custo_estoque: custos.get(p.id) ?? null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/admin/pedidos/:id', autenticarAdmin, async (req, res, next) => {
  try {
    const id = idValido(req.params.id);
    if (!id) return res.status(400).json({ erro: { codigo: 'DADOS_INVALIDOS', mensagem: 'Pedido inválido' } });
    const pedido = await atualizarPedidoAdmin(id, req.body, req.admin.email);
    if (!pedido) return res.status(404).json({ erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Pedido não encontrado' } });
    res.json(pedido);
  } catch (err) {
    if (!erroDeRegra(res, err)) next(err);
  }
});

adminRouter.post('/admin/pedidos', autenticarAdmin, async (req, res, next) => {
  try {
    res.status(201).json(await criarPedidoAdmin(req.body, req.admin.email));
  } catch (err) {
    if (!erroDeRegra(res, err)) next(err);
  }
});

adminRouter.get('/admin/pedidos/:id/sugestoes-clientes', autenticarAdmin, async (req, res, next) => {
  try {
    const id = idValido(req.params.id);
    if (!id) return res.status(400).json({ erro: { codigo: 'DADOS_INVALIDOS', mensagem: 'Pedido inválido' } });
    const clientes = await sugerirClientesParaPedido(id);
    if (!clientes) return res.status(404).json({ erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Pedido não encontrado' } });
    res.json({ clientes });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- clientes

adminRouter.get('/admin/clientes', autenticarAdmin, async (req, res, next) => {
  try {
    const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
    const porPagina = Math.min(100, Math.max(1, parseInt(req.query.porPagina, 10) || 30));
    res.json(await listarClientes({ busca: req.query.busca ?? '', pagina, porPagina }));
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/admin/clientes', autenticarAdmin, async (req, res, next) => {
  try {
    res.status(201).json(await criarCliente(req.body));
  } catch (err) {
    if (!erroDeRegra(res, err)) next(err);
  }
});

adminRouter.get('/admin/clientes/:id', autenticarAdmin, async (req, res, next) => {
  try {
    const id = idValido(req.params.id);
    const ficha = id && (await buscarCliente(id));
    if (!ficha) return res.status(404).json({ erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Cliente não encontrado' } });
    res.json(ficha);
  } catch (err) {
    next(err);
  }
});

adminRouter.put('/admin/clientes/:id', autenticarAdmin, async (req, res, next) => {
  try {
    const id = idValido(req.params.id);
    const cliente = id && (await atualizarCliente(id, req.body));
    if (!cliente) return res.status(404).json({ erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Cliente não encontrado' } });
    res.json(cliente);
  } catch (err) {
    if (!erroDeRegra(res, err)) next(err);
  }
});

adminRouter.get('/admin/vendedores', autenticarAdmin, async (req, res, next) => {
  try {
    res.json({ vendedores: await listarVendedores() });
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

// ---------------------------------------------------------------- estoque

adminRouter.get('/admin/estoque', autenticarAdmin, async (req, res, next) => {
  try {
    res.json({ saldos: await listarSaldos() });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/admin/estoque/lotes', autenticarAdmin, async (req, res, next) => {
  try {
    const sku = String(req.query.sku ?? '').trim() || undefined;
    res.json({ lotes: await listarLotes({ sku, somenteComSaldo: req.query.comSaldo === '1' }) });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/admin/estoque/fornecedores', autenticarAdmin, async (req, res, next) => {
  try {
    res.json({ fornecedores: await listarFornecedores() });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/admin/estoque/movimentos', autenticarAdmin, async (req, res, next) => {
  try {
    const sku = String(req.query.sku ?? '').trim() || undefined;
    const limite = Number.parseInt(req.query.limite, 10) || 100;
    res.json({ movimentos: await listarMovimentos({ sku, limite }) });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/admin/estoque/entradas', autenticarAdmin, async (req, res, next) => {
  try {
    res.status(201).json(await registrarEntrada(req.body, req.admin.email));
  } catch (err) {
    if (!erroDeRegra(res, err)) next(err);
  }
});

adminRouter.delete('/admin/estoque/entradas/:id', autenticarAdmin, async (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ erro: { codigo: 'DADOS_INVALIDOS', mensagem: 'Entrada inválida' } });
    }
    res.json(await excluirEntrada(id, req.admin.email));
  } catch (err) {
    if (!erroDeRegra(res, err)) next(err);
  }
});

adminRouter.post('/admin/estoque/baixas', autenticarAdmin, async (req, res, next) => {
  try {
    res.status(201).json(await registrarBaixaManual(req.body, req.admin.email));
  } catch (err) {
    if (!erroDeRegra(res, err)) next(err);
  }
});
