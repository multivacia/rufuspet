// Estoque por SKU com custo por compra (lote) e consumo PEPS (primeiro que entra, primeiro que sai).
// Ver migrations/008_estoque_peps.sql para as regras de negócio.
import { pool, withTransaction } from '../db.js';

export class ErroEstoque extends Error {
  constructor(mensagem, { campo, status = 400, codigo = 'DADOS_INVALIDOS', faltas } = {}) {
    super(mensagem);
    this.campo = campo;
    this.status = status;
    this.codigo = codigo;
    this.faltas = faltas;
  }
}

// Status em que o pedido tem a mercadoria comprometida (baixada do estoque).
const STATUS_COM_BAIXA = new Set(['confirmado', 'faturado']);

export function statusComBaixa(status) {
  return STATUS_COM_BAIXA.has(status);
}

/** Quantidade inteira de 1 a 999.999 (aceita "12"). */
export function lerQuantidade(bruto, campo = 'quantidade') {
  const texto = String(bruto ?? '').trim();
  if (!/^\d+$/.test(texto)) throw new ErroEstoque('Quantidade deve ser um número inteiro', { campo });
  const n = Number(texto);
  if (n < 1 || n > 999999) throw new ErroEstoque('Quantidade deve ser de 1 a 999.999', { campo });
  return n;
}

/** Custo unitário em reais, até 4 casas: aceita 1.5, "1,50", "1.234,5678". */
export function lerCusto(bruto, campo = 'custoUnitario') {
  let texto = typeof bruto === 'number' ? String(bruto) : String(bruto ?? '').trim();
  if (texto.includes(',')) texto = texto.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,4})?$/.test(texto)) throw new ErroEstoque('Custo inválido (ex.: 4,35)', { campo });
  const valor = Number(texto);
  if (valor > 100000) throw new ErroEstoque('Custo muito alto', { campo });
  return valor.toFixed(4);
}

/** Data AAAA-MM-DD válida, não futura (horário de Brasília). Vazio = hoje. */
export function lerData(bruto, hoje = hojeBrasilia()) {
  const texto = String(bruto ?? '').trim();
  if (texto === '') return hoje;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) throw new ErroEstoque('Data inválida', { campo: 'data' });
  const d = new Date(`${texto}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== texto) {
    throw new ErroEstoque('Data inválida', { campo: 'data' });
  }
  if (texto > hoje) throw new ErroEstoque('Data não pode ser futura', { campo: 'data' });
  return texto;
}

export function hojeBrasilia(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);
}

function texto(bruto, max = 300) {
  return String(bruto ?? '').trim().slice(0, max);
}

async function exigirProduto(client, sku) {
  const { rows } = await client.query('SELECT sku FROM produtos WHERE sku = $1', [sku]);
  if (rows.length === 0) throw new ErroEstoque('Produto não encontrado', { campo: 'sku', status: 404, codigo: 'NAO_ENCONTRADO' });
}

/**
 * Consome `quantidade` do SKU pelos lotes mais antigos. Os lotes do SKU já devem estar travados
 * (FOR UPDATE) pela transação. Devolve [{ loteId, quantidade, custoUnitario }].
 */
function planejarConsumo(lotes, quantidade) {
  const consumos = [];
  let falta = quantidade;
  for (const lote of lotes) {
    if (falta === 0) break;
    const usar = Math.min(falta, lote.quantidade_restante);
    if (usar > 0) {
      consumos.push({ loteId: lote.id, quantidade: usar, custoUnitario: lote.custo_unitario });
      falta -= usar;
    }
  }
  return consumos;
}

async function travarLotes(client, skus) {
  // Ordem fixa por SKU para evitar deadlock entre transações concorrentes.
  const { rows } = await client.query(
    `SELECT id, sku, quantidade_restante, custo_unitario
       FROM estoque_lotes
      WHERE sku = ANY($1) AND quantidade_restante > 0
      ORDER BY sku, data_entrada, id
      FOR UPDATE`,
    [[...new Set(skus)].sort()],
  );
  const porSku = new Map();
  for (const l of rows) {
    if (!porSku.has(l.sku)) porSku.set(l.sku, []);
    porSku.get(l.sku).push(l);
  }
  return porSku;
}

function saldoDe(lotes = []) {
  return lotes.reduce((s, l) => s + l.quantidade_restante, 0);
}

async function gravarSaida(client, { sku, quantidade, tipo, pedidoId = null, motivo = '', criadoPor = '' }, lotes) {
  const consumos = planejarConsumo(lotes, quantidade);
  const custoTotal = consumos.reduce((s, c) => s + c.quantidade * Number(c.custoUnitario), 0);
  const { rows } = await client.query(
    `INSERT INTO estoque_movimentos (sku, tipo, quantidade, custo_total, pedido_id, motivo, criado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [sku, tipo, -quantidade, custoTotal.toFixed(4), pedidoId, motivo, criadoPor],
  );
  const movimentoId = rows[0].id;
  for (const c of consumos) {
    await client.query('UPDATE estoque_lotes SET quantidade_restante = quantidade_restante - $2 WHERE id = $1', [c.loteId, c.quantidade]);
    await client.query(
      'INSERT INTO estoque_consumos (movimento_id, lote_id, quantidade, custo_unitario) VALUES ($1, $2, $3, $4)',
      [movimentoId, c.loteId, c.quantidade, c.custoUnitario],
    );
  }
  return { movimentoId, custoTotal };
}

// ---------------------------------------------------------------- consultas

export async function listarSaldos(client = pool) {
  const { rows } = await client.query(
    `SELECT p.sku, p.nome, p.cor, p.ativo, p.preco_unitario,
            COALESCE(sum(l.quantidade_restante), 0)::int AS saldo,
            COALESCE(sum(l.quantidade_restante * l.custo_unitario), 0) AS custo_estoque,
            (SELECT custo_unitario FROM estoque_lotes x
              WHERE x.sku = p.sku AND x.quantidade_restante > 0
              ORDER BY x.data_entrada, x.id LIMIT 1) AS proximo_custo
       FROM produtos p
       LEFT JOIN estoque_lotes l ON l.sku = p.sku AND l.quantidade_restante > 0
      GROUP BY p.sku
      ORDER BY p.ordem_exibicao, p.sku`,
  );
  return rows.map((r) => ({
    sku: r.sku,
    nome: r.nome,
    cor: r.cor,
    ativo: r.ativo,
    precoUnitario: Number(r.preco_unitario),
    saldo: r.saldo,
    custoEstoque: Number(Number(r.custo_estoque).toFixed(2)),
    custoMedio: r.saldo > 0 ? Number((Number(r.custo_estoque) / r.saldo).toFixed(4)) : null,
    proximoCusto: r.proximo_custo == null ? null : Number(r.proximo_custo),
  }));
}

export async function listarLotes({ sku, somenteComSaldo = false } = {}, client = pool) {
  const params = [];
  const filtros = [];
  if (sku) {
    params.push(sku);
    filtros.push(`l.sku = $${params.length}`);
  }
  if (somenteComSaldo) filtros.push('l.quantidade_restante > 0');
  const { rows } = await client.query(
    `SELECT l.*, p.nome, p.cor,
            EXISTS (SELECT 1 FROM estoque_consumos c WHERE c.lote_id = l.id) AS teve_consumo
       FROM estoque_lotes l JOIN produtos p ON p.sku = l.sku
      ${filtros.length ? `WHERE ${filtros.join(' AND ')}` : ''}
      ORDER BY l.data_entrada DESC, l.id DESC
      LIMIT 200`,
    params,
  );
  return rows.map((l) => ({
    id: l.id,
    sku: l.sku,
    nome: l.nome,
    cor: l.cor,
    dataEntrada: l.data_entrada instanceof Date ? l.data_entrada.toISOString().slice(0, 10) : String(l.data_entrada),
    quantidadeInicial: l.quantidade_inicial,
    quantidadeRestante: l.quantidade_restante,
    custoUnitario: Number(l.custo_unitario),
    fornecedor: l.fornecedor,
    documento: l.documento,
    observacao: l.observacao,
    criadoPor: l.criado_por,
    criadoEm: l.criado_em,
    podeExcluir: !l.teve_consumo && l.quantidade_restante === l.quantidade_inicial,
  }));
}

export async function listarMovimentos({ sku, limite = 100 } = {}, client = pool) {
  const params = [Math.min(500, Math.max(1, limite))];
  let filtro = '';
  if (sku) {
    params.push(sku);
    filtro = 'WHERE m.sku = $2';
  }
  const { rows } = await client.query(
    `SELECT m.*, p.nome, p.cor, pe.codigo_publico, pe.numero, l.fornecedor, l.documento
       FROM estoque_movimentos m
       JOIN produtos p ON p.sku = m.sku
       LEFT JOIN pedidos pe ON pe.id = m.pedido_id
       LEFT JOIN estoque_lotes l ON l.id = m.lote_id
      ${filtro}
      ORDER BY m.criado_em DESC, m.id DESC
      LIMIT $1`,
    params,
  );
  return rows.map((m) => ({
    id: m.id,
    sku: m.sku,
    nome: m.nome,
    cor: m.cor,
    tipo: m.tipo,
    quantidade: m.quantidade,
    custoTotal: Number(Number(m.custo_total).toFixed(2)),
    loteId: m.lote_id,
    pedidoId: m.pedido_id,
    pedidoCodigo: m.codigo_publico,
    pedidoNumero: m.numero,
    fornecedor: m.fornecedor ?? '',
    documento: m.documento ?? '',
    motivo: m.motivo,
    criadoPor: m.criado_por,
    criadoEm: m.criado_em,
  }));
}

/** Fornecedores já usados (para sugestão no formulário), mais recentes primeiro. */
export async function listarFornecedores(client = pool) {
  const { rows } = await client.query(
    `SELECT fornecedor FROM estoque_lotes WHERE fornecedor <> ''
      GROUP BY fornecedor ORDER BY max(criado_em) DESC LIMIT 100`,
  );
  return rows.map((r) => r.fornecedor);
}

/** Custo PEPS (consumos não estornados) de cada pedido com baixa. Map pedidoId → reais. */
export async function custoDosPedidos(ids, client = pool) {
  if (!ids.length) return new Map();
  const { rows } = await client.query(
    `SELECT m.pedido_id, sum(c.quantidade * c.custo_unitario) AS custo
       FROM estoque_movimentos m
       JOIN estoque_consumos c ON c.movimento_id = m.id AND NOT c.estornado
      WHERE m.tipo = 'saida_pedido' AND m.pedido_id = ANY($1)
      GROUP BY m.pedido_id`,
    [ids],
  );
  return new Map(rows.map((r) => [r.pedido_id, Number(Number(r.custo).toFixed(2))]));
}

// ---------------------------------------------------------------- lançamentos manuais

export async function registrarEntrada(body, criadoPor = '') {
  const sku = texto(body?.sku, 60);
  const quantidade = lerQuantidade(body?.quantidade);
  const custo = lerCusto(body?.custoUnitario);
  const data = lerData(body?.data);
  const observacao = texto(body?.observacao);
  const fornecedor = texto(body?.fornecedor, 120).replace(/\s+/g, ' ');
  const documento = texto(body?.documento, 60);
  return withTransaction(async (client) => {
    await exigirProduto(client, sku);
    const { rows } = await client.query(
      `INSERT INTO estoque_lotes (sku, data_entrada, quantidade_inicial, quantidade_restante, custo_unitario, observacao, criado_por, fornecedor, documento)
       VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [sku, data, quantidade, custo, observacao, criadoPor, fornecedor, documento],
    );
    const loteId = rows[0].id;
    await client.query(
      `INSERT INTO estoque_movimentos (sku, tipo, quantidade, custo_total, lote_id, motivo, criado_por)
       VALUES ($1, 'entrada', $2, $3, $4, $5, $6)`,
      [sku, quantidade, (quantidade * Number(custo)).toFixed(4), loteId, observacao, criadoPor],
    );
    return { loteId };
  });
}

export async function registrarBaixaManual(body, criadoPor = '') {
  const sku = texto(body?.sku, 60);
  const quantidade = lerQuantidade(body?.quantidade);
  const motivo = texto(body?.motivo);
  if (!motivo) throw new ErroEstoque('Informe o motivo da baixa', { campo: 'motivo' });
  return withTransaction(async (client) => {
    await exigirProduto(client, sku);
    const lotes = (await travarLotes(client, [sku])).get(sku) ?? [];
    const saldo = saldoDe(lotes);
    if (saldo < quantidade) {
      throw new ErroEstoque(`Saldo insuficiente: há ${saldo} un.`, {
        campo: 'quantidade',
        status: 409,
        codigo: 'ESTOQUE_INSUFICIENTE',
        faltas: [{ sku, pedido: quantidade, saldo }],
      });
    }
    const { movimentoId, custoTotal } = await gravarSaida(client, { sku, quantidade, tipo: 'baixa_manual', motivo, criadoPor }, lotes);
    return { movimentoId, custoTotal: Number(custoTotal.toFixed(2)) };
  });
}

/** Exclui uma entrada lançada por engano — só se nada dela foi consumido. */
export async function excluirEntrada(loteId, criadoPor = '') {
  return withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM estoque_lotes WHERE id = $1 FOR UPDATE', [loteId]);
    const lote = rows[0];
    if (!lote) throw new ErroEstoque('Entrada não encontrada', { status: 404, codigo: 'NAO_ENCONTRADO' });
    const { rows: usos } = await client.query('SELECT 1 FROM estoque_consumos WHERE lote_id = $1 LIMIT 1', [loteId]);
    if (usos.length || lote.quantidade_restante !== lote.quantidade_inicial) {
      throw new ErroEstoque('Esta entrada já foi usada em saídas e não pode ser excluída. Use uma baixa manual.', {
        status: 409,
        codigo: 'ENTRADA_EM_USO',
      });
    }
    await client.query(
      `INSERT INTO estoque_movimentos (sku, tipo, quantidade, custo_total, motivo, criado_por)
       VALUES ($1, 'entrada_excluida', $2, $3, $4, $5)`,
      [
        lote.sku,
        -lote.quantidade_inicial,
        (lote.quantidade_inicial * Number(lote.custo_unitario)).toFixed(4),
        `Entrada #${lote.id} de ${String(lote.data_entrada instanceof Date ? lote.data_entrada.toISOString().slice(0, 10) : lote.data_entrada)} excluída`,
        criadoPor,
      ],
    );
    await client.query('DELETE FROM estoque_lotes WHERE id = $1', [loteId]);
    return { ok: true };
  });
}

// ---------------------------------------------------------------- pedidos

/**
 * Baixa os itens do pedido (status → confirmado/faturado). Tudo ou nada: se algum SKU não tem
 * saldo, lança ErroEstoque 409 com a lista do que falta. `client` deve estar em transação e o
 * pedido travado.
 */
export async function baixarPedido(client, pedidoId, criadoPor = '') {
  const { rows: itens } = await client.query(
    `SELECT sku, sum(quantidade)::int AS quantidade, min(nome_snapshot) AS nome, min(cor_snapshot) AS cor
       FROM pedido_itens WHERE pedido_id = $1 GROUP BY sku ORDER BY sku`,
    [pedidoId],
  );
  const lotesPorSku = await travarLotes(client, itens.map((i) => i.sku));
  const faltas = itens
    .map((i) => ({ sku: i.sku, nome: i.nome, cor: i.cor, pedido: i.quantidade, saldo: saldoDe(lotesPorSku.get(i.sku)) }))
    .filter((f) => f.saldo < f.pedido);
  if (faltas.length) {
    const lista = faltas.map((f) => `${f.nome}${f.cor ? ` ${f.cor}` : ''}: pedido ${f.pedido}, saldo ${f.saldo}`).join('; ');
    throw new ErroEstoque(`Estoque insuficiente — ${lista}`, { status: 409, codigo: 'ESTOQUE_INSUFICIENTE', faltas });
  }
  for (const item of itens) {
    await gravarSaida(
      client,
      { sku: item.sku, quantidade: item.quantidade, tipo: 'saida_pedido', pedidoId, criadoPor },
      lotesPorSku.get(item.sku),
    );
  }
  await client.query('UPDATE pedidos SET estoque_baixado_em = now() WHERE id = $1', [pedidoId]);
}

/** Devolve aos mesmos lotes tudo que a baixa do pedido consumiu (status → novo/cancelado). */
export async function estornarPedido(client, pedidoId, criadoPor = '') {
  const { rows: consumos } = await client.query(
    `SELECT c.id, c.lote_id, c.quantidade, c.custo_unitario, m.sku
       FROM estoque_consumos c
       JOIN estoque_movimentos m ON m.id = c.movimento_id
      WHERE m.pedido_id = $1 AND m.tipo = 'saida_pedido' AND NOT c.estornado
      ORDER BY m.sku, c.lote_id
      FOR UPDATE OF c`,
    [pedidoId],
  );
  const porSku = new Map();
  for (const c of consumos) {
    await client.query('UPDATE estoque_lotes SET quantidade_restante = quantidade_restante + $2 WHERE id = $1', [c.lote_id, c.quantidade]);
    await client.query('UPDATE estoque_consumos SET estornado = TRUE WHERE id = $1', [c.id]);
    const acc = porSku.get(c.sku) ?? { quantidade: 0, custo: 0 };
    acc.quantidade += c.quantidade;
    acc.custo += c.quantidade * Number(c.custo_unitario);
    porSku.set(c.sku, acc);
  }
  for (const [sku, acc] of porSku) {
    await client.query(
      `INSERT INTO estoque_movimentos (sku, tipo, quantidade, custo_total, pedido_id, criado_por)
       VALUES ($1, 'estorno_pedido', $2, $3, $4, $5)`,
      [sku, acc.quantidade, acc.custo.toFixed(4), pedidoId, criadoPor],
    );
  }
  await client.query('UPDATE pedidos SET estoque_baixado_em = NULL WHERE id = $1', [pedidoId]);
}
