import { pool } from '../db.js';
import {
  ErroPedido,
  calcularTotal,
  validarCliente,
  validarContato,
  validarItens,
  validarObservacoes,
} from './regras-pedido.js';

export { ErroPedido };

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function buscarPedidoExistente(idempotencyKey) {
  const { rows } = await pool.query(
    'SELECT id, numero, valor_total FROM pedidos WHERE idempotency_key = $1',
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

export async function criarPedido({ idempotencyKey, cliente, contato, itens, observacoes, aceite }) {
  if (typeof idempotencyKey !== 'string' || !UUID_REGEX.test(idempotencyKey)) {
    throw new ErroPedido(400, 'DADOS_INVALIDOS', 'idempotencyKey é obrigatório');
  }

  const existente = await buscarPedidoExistente(idempotencyKey);
  if (existente) {
    return { id: existente.id, numero: existente.numero, valorTotal: Number(existente.valor_total), reaproveitado: true };
  }

  const itensValidos = validarItens(itens);
  const clienteValido = validarCliente(cliente);
  const contatoValido = validarContato(contato);
  const observacoesValidas = validarObservacoes(observacoes);
  if (aceite !== true) {
    throw new ErroPedido(400, 'DADOS_INVALIDOS', 'É necessário autorizar o contato', 'aceite');
  }

  const { rows: produtos } = await pool.query(
    `SELECT sku, nome, cor, imagem, unidade, ativo, preco_unitario FROM produtos WHERE sku = ANY($1)`,
    [itensValidos.map((i) => i.sku)],
  );
  const produtoPorSku = new Map(produtos.map((p) => [p.sku, p]));

  const linhas = itensValidos.map((item) => {
    const produto = produtoPorSku.get(item.sku);
    if (!produto) throw new ErroPedido(422, 'ITEM_INVALIDO', `Item ${item.sku} não encontrado`);
    if (!produto.ativo) throw new ErroPedido(422, 'ITEM_INATIVO', `${produto.nome} não está mais disponível`);
    return { ...item, produto, precoUnitario: produto.preco_unitario };
  });
  const valorTotal = calcularTotal(linhas);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ano = new Date().getFullYear();
    const { rows: numeroRows } = await client.query('SELECT proximo_numero_pedido($1) AS numero', [ano]);
    const numero = numeroRows[0].numero;

    const { rows: pedidoRows } = await client.query(
      `INSERT INTO pedidos
         (numero, idempotency_key, razao_social, nome_fantasia, cnpj, cidade, uf,
          contato_nome, contato_email, contato_whatsapp, canal_preferido, valor_total, observacoes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      [
        numero,
        idempotencyKey,
        clienteValido.razaoSocial,
        clienteValido.nomeFantasia,
        clienteValido.cnpj,
        clienteValido.cidade,
        clienteValido.uf,
        contatoValido.nome,
        contatoValido.email,
        contatoValido.whatsapp,
        contatoValido.canalPreferido,
        valorTotal,
        observacoesValidas || null,
      ],
    );
    const pedidoId = pedidoRows[0].id;

    for (const { produto, quantidade } of linhas) {
      await client.query(
        `INSERT INTO pedido_itens
           (pedido_id, sku, quantidade, nome_snapshot, cor_snapshot,
            imagem_snapshot, unidade_snapshot, preco_unitario_snapshot)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [pedidoId, produto.sku, quantidade, produto.nome, produto.cor, produto.imagem, produto.unidade, produto.preco_unitario],
      );
    }

    await enfileirarNotificacoes(client, pedidoId, contatoValido);

    await client.query('COMMIT');

    return { id: pedidoId, numero, valorTotal, reaproveitado: false };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505' && err.constraint === 'pedidos_idempotency_key_key') {
      const jaExiste = await buscarPedidoExistente(idempotencyKey);
      if (jaExiste) {
        return { id: jaExiste.id, numero: jaExiste.numero, valorTotal: Number(jaExiste.valor_total), reaproveitado: true };
      }
    }
    throw err;
  } finally {
    client.release();
  }
}
