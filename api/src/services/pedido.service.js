import { pool } from '../db.js';

export class ErroPedido extends Error {
  constructor(status, codigo, mensagem) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
  }
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizarWhatsapp(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

function validarContato(contato) {
  if (!contato || typeof contato !== 'object') {
    throw new ErroPedido(400, 'DADOS_INVALIDOS', 'Contato é obrigatório');
  }

  const nome = String(contato.nome ?? '').trim();
  if (nome.length < 3) {
    throw new ErroPedido(400, 'DADOS_INVALIDOS', 'Nome deve ter pelo menos 3 caracteres');
  }

  const email = String(contato.email ?? '').trim();
  if (!EMAIL_REGEX.test(email)) {
    throw new ErroPedido(400, 'DADOS_INVALIDOS', 'E-mail inválido');
  }

  const whatsapp = normalizarWhatsapp(contato.whatsapp);
  if (whatsapp.length < 10) {
    throw new ErroPedido(400, 'DADOS_INVALIDOS', 'WhatsApp inválido');
  }

  if (!['whatsapp', 'email'].includes(contato.canalPreferido)) {
    throw new ErroPedido(400, 'DADOS_INVALIDOS', 'canalPreferido deve ser "whatsapp" ou "email"');
  }

  return { nome, email, whatsapp, canalPreferido: contato.canalPreferido };
}

function validarItens(itens) {
  if (!Array.isArray(itens) || itens.length === 0) {
    throw new ErroPedido(400, 'DADOS_INVALIDOS', 'Itens são obrigatórios');
  }

  return itens.map((item) => {
    const sku = String(item?.sku ?? '').trim();
    const quantidadeCaixas = Number(item?.quantidadeCaixas);
    if (!sku || !Number.isInteger(quantidadeCaixas) || quantidadeCaixas <= 0) {
      throw new ErroPedido(
        400,
        'DADOS_INVALIDOS',
        'Item inválido: sku e quantidadeCaixas (inteiro positivo) são obrigatórios',
      );
    }
    return { sku, quantidadeCaixas };
  });
}

async function buscarPedidoExistente(idempotencyKey) {
  const { rows } = await pool.query(
    'SELECT numero, valor_total FROM pedidos WHERE idempotency_key = $1',
    [idempotencyKey],
  );
  return rows[0] ?? null;
}

async function enfileirarNotificacoes(client, pedidoId, contato) {
  const emailsInternos = (process.env.EMAILS_INTERNOS || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  for (const destino of emailsInternos) {
    await client.query(
      `INSERT INTO notificacoes (pedido_id, canal, tipo, destino) VALUES ($1, 'email', 'interno', $2)`,
      [pedidoId, destino],
    );
  }

  if (process.env.WHATSAPP_GRUPO) {
    await client.query(
      `INSERT INTO notificacoes (pedido_id, canal, tipo, destino) VALUES ($1, 'whatsapp', 'grupo', $2)`,
      [pedidoId, process.env.WHATSAPP_GRUPO],
    );
  }

  const destinoCliente = contato.canalPreferido === 'email' ? contato.email : contato.whatsapp;
  await client.query(
    `INSERT INTO notificacoes (pedido_id, canal, tipo, destino) VALUES ($1, $2, 'cliente', $3)`,
    [pedidoId, contato.canalPreferido, destinoCliente],
  );
}

export async function criarPedido({ idempotencyKey, contato, itens }) {
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    throw new ErroPedido(400, 'DADOS_INVALIDOS', 'idempotencyKey é obrigatório');
  }

  const existente = await buscarPedidoExistente(idempotencyKey);
  if (existente) {
    return { numero: existente.numero, valorTotal: Number(existente.valor_total), reaproveitado: true };
  }

  const contatoValido = validarContato(contato);
  const itensValidos = validarItens(itens);

  const skus = itensValidos.map((i) => i.sku);
  const { rows: produtos } = await pool.query(
    `SELECT sku, nome, cor, imagem, unidade, ativo, estoque_caixas, limite_caixas,
            preco_atacado, preco_caixa
       FROM produtos
      WHERE sku = ANY($1)`,
    [skus],
  );
  const produtoPorSku = new Map(produtos.map((p) => [p.sku, p]));

  for (const item of itensValidos) {
    const produto = produtoPorSku.get(item.sku);
    if (!produto) {
      throw new ErroPedido(422, 'ITEM_INVALIDO', `Item ${item.sku} não encontrado`);
    }
    if (!produto.ativo) {
      throw new ErroPedido(422, 'ITEM_INATIVO', `Item ${item.sku} está inativo`);
    }
    if (produto.estoque_caixas <= 0) {
      throw new ErroPedido(422, 'ITEM_SEM_ESTOQUE', `Item ${item.sku} está sem estoque`);
    }
    if (item.quantidadeCaixas > produto.limite_caixas) {
      throw new ErroPedido(
        422,
        'ITEM_ACIMA_DO_LIMITE',
        `Item ${item.sku} excede o limite de ${produto.limite_caixas} caixas`,
      );
    }
  }

  const valorTotal = Number(
    itensValidos
      .reduce((total, item) => total + Number(produtoPorSku.get(item.sku).preco_caixa) * item.quantidadeCaixas, 0)
      .toFixed(2),
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ano = new Date().getFullYear();
    const { rows: numeroRows } = await client.query('SELECT proximo_numero_pedido($1) AS numero', [ano]);
    const numero = numeroRows[0].numero;

    const { rows: pedidoRows } = await client.query(
      `INSERT INTO pedidos
         (numero, idempotency_key, contato_nome, contato_email, contato_whatsapp,
          canal_preferido, valor_total)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        numero,
        idempotencyKey,
        contatoValido.nome,
        contatoValido.email,
        contatoValido.whatsapp,
        contatoValido.canalPreferido,
        valorTotal,
      ],
    );
    const pedidoId = pedidoRows[0].id;

    for (const item of itensValidos) {
      const produto = produtoPorSku.get(item.sku);
      await client.query(
        `INSERT INTO pedido_itens
           (pedido_id, sku, quantidade_caixas, nome_snapshot, cor_snapshot,
            imagem_snapshot, unidade_snapshot, preco_atacado_snapshot, preco_caixa_snapshot)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          pedidoId,
          item.sku,
          item.quantidadeCaixas,
          produto.nome,
          produto.cor,
          produto.imagem,
          produto.unidade,
          produto.preco_atacado,
          produto.preco_caixa,
        ],
      );
    }

    await enfileirarNotificacoes(client, pedidoId, contatoValido);

    await client.query('COMMIT');

    return { numero, valorTotal, reaproveitado: false };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505' && err.constraint === 'pedidos_idempotency_key_key') {
      const jaExiste = await buscarPedidoExistente(idempotencyKey);
      if (jaExiste) {
        return { numero: jaExiste.numero, valorTotal: Number(jaExiste.valor_total), reaproveitado: true };
      }
    }
    throw err;
  } finally {
    client.release();
  }
}
