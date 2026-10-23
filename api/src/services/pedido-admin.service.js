// Pedido no admin: edição livre (cliente, vendedor, itens, preço, status, observações) e lançamento manual
// de vendas fora do site. Regras (decisão do usuário, 2026-10-23):
//   * sem travas por status — itens e preços editáveis a qualquer momento;
//   * confirmado/faturado exige cliente vinculado ("tem que ter lastro");
//   * quantidade de pedido com baixa não pode passar do disponível = saldo + o que o próprio pedido já baixou
//     (solicitações não reservam estoque); editar itens de pedido com baixa estorna e baixa de novo (PEPS);
//   * pedido mínimo do site não se aplica ao admin.
import { randomUUID } from 'node:crypto';
import { withTransaction } from '../db.js';
import { calcularTotal, QUANTIDADE_MAXIMA } from './regras-pedido.js';
import { baixarPedido, estornarPedido, statusComBaixa } from './estoque.service.js';
import { inserirItens, inserirPedido } from './pedido.service.js';

export const STATUS_PEDIDO = ['novo', 'confirmado', 'faturado', 'cancelado'];

export class ErroPedidoAdmin extends Error {
  constructor(mensagem, { campo, status = 400, codigo = 'DADOS_INVALIDOS' } = {}) {
    super(mensagem);
    this.campo = campo;
    this.status = status;
    this.codigo = codigo;
  }
}

/** Preço em reais com até 2 casas: 11.9, "11,90", "1.234,50". */
export function lerPreco(bruto) {
  let t = typeof bruto === 'number' ? String(bruto) : String(bruto ?? '').trim();
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) throw new ErroPedidoAdmin('Preço unitário inválido', { campo: 'itens' });
  const v = Number(t);
  if (!(v > 0) || v >= 100000) throw new ErroPedidoAdmin('Preço unitário inválido', { campo: 'itens' });
  return v.toFixed(2);
}

/**
 * Itens do admin: [{ sku, quantidade, precoUnitario? }]. Sem preço = preço atual do catálogo.
 * Aceita produto inativo (venda negociada). SKU repetido é recusado (evita dois preços para o mesmo item).
 */
async function lerItens(client, bruto) {
  if (!Array.isArray(bruto) || bruto.length === 0) throw new ErroPedidoAdmin('O pedido precisa de pelo menos um item', { campo: 'itens' });
  if (bruto.length > 50) throw new ErroPedidoAdmin('Itens demais no pedido', { campo: 'itens' });
  const vistos = new Set();
  const itens = bruto.map((i) => {
    const sku = String(i?.sku ?? '').trim();
    const quantidade = Number(String(i?.quantidade ?? '').trim());
    if (!sku) throw new ErroPedidoAdmin('Selecione o produto de cada item', { campo: 'itens' });
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > QUANTIDADE_MAXIMA) {
      throw new ErroPedidoAdmin(`Quantidade deve ser de 1 a ${QUANTIDADE_MAXIMA}`, { campo: 'itens' });
    }
    if (vistos.has(sku)) throw new ErroPedidoAdmin(`Produto ${sku} repetido no pedido`, { campo: 'itens' });
    vistos.add(sku);
    const semPreco = i?.precoUnitario === undefined || i?.precoUnitario === null || String(i.precoUnitario).trim() === '';
    return { sku, quantidade, preco: semPreco ? null : lerPreco(i.precoUnitario) };
  });
  const { rows } = await client.query('SELECT sku, nome, cor, imagem, unidade, preco_unitario FROM produtos WHERE sku = ANY($1)', [
    itens.map((i) => i.sku),
  ]);
  const porSku = new Map(rows.map((p) => [p.sku, p]));
  return itens.map((i) => {
    const produto = porSku.get(i.sku);
    if (!produto) throw new ErroPedidoAdmin(`Produto ${i.sku} não encontrado`, { campo: 'itens', status: 422, codigo: 'ITEM_INVALIDO' });
    return { produto, quantidade: i.quantidade, precoUnitario: i.preco ?? produto.preco_unitario };
  });
}

async function lerClienteId(client, bruto) {
  if (bruto === null || bruto === '') return null;
  const id = Number.parseInt(bruto, 10);
  if (!Number.isInteger(id) || id <= 0) throw new ErroPedidoAdmin('Cliente inválido', { campo: 'clienteId' });
  const { rows } = await client.query('SELECT * FROM clientes WHERE id = $1', [id]);
  if (!rows[0]) throw new ErroPedidoAdmin('Cliente não encontrado', { campo: 'clienteId', status: 404, codigo: 'NAO_ENCONTRADO' });
  return rows[0];
}

function lerVendedor(bruto) {
  const v = String(bruto ?? '').trim().replace(/\s+/g, ' ');
  if (v.length > 80) throw new ErroPedidoAdmin('Vendedor muito longo (máx. 80)', { campo: 'vendedor' });
  return v;
}

function exigirCliente(status, clienteId) {
  if (statusComBaixa(status) && clienteId == null) {
    throw new ErroPedidoAdmin('Vincule um cliente antes de confirmar (pode ser "Venda balcão").', {
      campo: 'clienteId',
      status: 422,
      codigo: 'CLIENTE_OBRIGATORIO',
    });
  }
}

const tem = (obj, campo) => Object.prototype.hasOwnProperty.call(obj ?? {}, campo);

/**
 * PATCH do admin. Campos aceitos: status, observacoes, clienteId, vendedor, itens.
 * Tudo numa transação: ou aplica tudo (com estoque coerente) ou nada.
 */
export async function atualizarPedidoAdmin(pedidoId, body, criadoPor = '') {
  const b = body ?? {};
  const campos = ['status', 'observacoes', 'clienteId', 'vendedor', 'itens'].filter((c) => tem(b, c));
  if (campos.length === 0) throw new ErroPedidoAdmin('Nenhum campo editável informado');
  if (tem(b, 'status') && !STATUS_PEDIDO.includes(b.status)) {
    throw new ErroPedidoAdmin(`status deve ser um de: ${STATUS_PEDIDO.join(', ')}`, { campo: 'status' });
  }

  return withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM pedidos WHERE id = $1 FOR UPDATE', [pedidoId]);
    const pedido = rows[0];
    if (!pedido) return null;

    const sets = {};
    let clienteId = pedido.cliente_id;
    if (tem(b, 'clienteId')) {
      const cliente = await lerClienteId(client, b.clienteId);
      clienteId = cliente?.id ?? null;
      sets.cliente_id = clienteId;
      // Pedido herda o vendedor da carteira do cliente, se ainda não tem um e não veio outro.
      if (cliente && !tem(b, 'vendedor') && !pedido.vendedor && cliente.vendedor) sets.vendedor = cliente.vendedor;
    }
    if (tem(b, 'vendedor')) sets.vendedor = lerVendedor(b.vendedor);
    if (tem(b, 'observacoes')) sets.observacoes = String(b.observacoes ?? '').slice(0, 1000);
    const status = tem(b, 'status') ? b.status : pedido.status;
    if (tem(b, 'status')) sets.status = status;
    exigirCliente(status, clienteId);

    const linhas = tem(b, 'itens') ? await lerItens(client, b.itens) : null;
    const baixado = pedido.estoque_baixado_em != null;
    const precisaBaixa = statusComBaixa(status);

    // Estorna antes de trocar os itens: assim a nova baixa enxerga saldo + o que este pedido tinha baixado.
    if (baixado && (linhas || !precisaBaixa)) await estornarPedido(client, pedidoId, criadoPor);
    if (linhas) {
      await client.query('DELETE FROM pedido_itens WHERE pedido_id = $1', [pedidoId]);
      await inserirItens(client, pedidoId, linhas);
      sets.valor_total = calcularTotal(linhas);
    }
    if (precisaBaixa && (!baixado || linhas)) await baixarPedido(client, pedidoId, criadoPor);

    const chaves = Object.keys(sets);
    const { rows: atualizados } = await client.query(
      `UPDATE pedidos SET ${chaves.map((c, i) => `${c} = $${i + 2}`).join(', ')}${chaves.length ? ', ' : ''}atualizado_em = now()
        WHERE id = $1 RETURNING *`,
      [pedidoId, ...chaves.map((c) => sets[c])],
    );
    return atualizados[0];
  });
}

/** Venda fora do site: nasce confirmada (com baixa) ou como solicitação. Sem e-mails/TXT. */
export async function criarPedidoAdmin(body, criadoPor = '') {
  const b = body ?? {};
  const status = b.status ?? 'confirmado';
  if (!['novo', 'confirmado', 'faturado'].includes(status)) throw new ErroPedidoAdmin('Status inicial inválido', { campo: 'status' });

  return withTransaction(async (client) => {
    const cliente = await lerClienteId(client, b.clienteId ?? null);
    if (!cliente) throw new ErroPedidoAdmin('Selecione o cliente (pode ser "Venda balcão")', { campo: 'clienteId' });
    const linhas = await lerItens(client, b.itens);
    const vendedor = tem(b, 'vendedor') && String(b.vendedor ?? '').trim() ? lerVendedor(b.vendedor) : cliente.vendedor;

    const { id } = await inserirPedido(client, {
      idempotencyKey: randomUUID(),
      cliente: {
        razaoSocial: cliente.nome,
        nomeFantasia: cliente.nome_fantasia,
        cnpj: cliente.documento,
        cidade: cliente.cidade,
        uf: cliente.uf,
      },
      contato: {
        nome: cliente.comprador || cliente.nome,
        email: cliente.email,
        whatsapp: cliente.whatsapp,
        canalPreferido: cliente.whatsapp || !cliente.email ? 'whatsapp' : 'email',
      },
      valorTotal: calcularTotal(linhas),
      observacoes: String(b.observacoes ?? '').trim().slice(0, 1000) || null,
      linhas,
      clienteId: cliente.id,
      vendedor,
      origem: 'admin',
      status,
    });
    if (statusComBaixa(status)) await baixarPedido(client, id, criadoPor);
    const { rows } = await client.query('SELECT * FROM pedidos WHERE id = $1', [id]);
    return rows[0];
  });
}
