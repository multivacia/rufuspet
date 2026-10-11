// Testes de integração: API real contra um PostgreSQL de teste.
// Requer DATABASE_URL_TESTE apontando para um banco descartável (é TRUNCADO a cada execução).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const urlTeste = process.env.DATABASE_URL_TESTE;
const pastaPedidos = await fs.mkdtemp(path.join(os.tmpdir(), 'rufus-pedidos-'));
let servidor;
let base;
let pool;

before(async () => {
  if (!urlTeste) return;
  process.env.DATABASE_URL = urlTeste;
  process.env.JWT_SECRET = 'segredo-de-teste';
  process.env.PEDIDOS_PASTA = pastaPedidos;
  process.env.EMAILS_INTERNOS = 'loja@exemplo.com';
  process.env.PEDIDOS_LIMITE_POR_HORA = '1000';
  delete process.env.SMTP_HOST;
  execFileSync('node', ['migrations/run.js'], { env: process.env, stdio: 'pipe' });
  ({ pool } = await import('../src/db.js'));
  const { app } = await import('../src/app.js');
  await new Promise((ok) => {
    servidor = app.listen(0, ok);
  });
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
  servidor?.close();
  await pool?.end();
  await fs.rm(pastaPedidos, { recursive: true, force: true });
});

beforeEach(async () => {
  if (!urlTeste) return;
  await pool.query('TRUNCATE pedidos, admin_usuarios RESTART IDENTITY CASCADE');
  await pool.query(`DROP SEQUENCE IF EXISTS pedidos_seq_${new Date().getFullYear()}`);
  await pool.query("UPDATE produtos SET ativo = true, preco_unitario = CASE WHEN sku LIKE 'RFS-POTE%' THEN 16.90 WHEN sku LIKE 'RFS-SUP%' THEN 12.90 WHEN sku = 'RFS-K6' THEN 18.90 ELSE 11.90 END");
});

const opcoes = { skip: urlTeste ? false : 'defina DATABASE_URL_TESTE para rodar' };

function pedidoValido(extra = {}) {
  return {
    idempotencyKey: randomUUID(),
    cliente: { razaoSocial: 'Pet Shop Teste Ltda', nomeFantasia: 'Pet Feliz', cnpj: '11.222.333/0001-81', cidade: 'Campinas', uf: 'SP' },
    contato: { nome: 'Maria', email: 'maria@exemplo.com', whatsapp: '(11) 98765-4321', canalPreferido: 'whatsapp' },
    itens: [
      { sku: 'RFS-K3', quantidade: 2 },
      { sku: 'RFS-SUP-ROSA', quantidade: 1 },
      { sku: 'RFS-POTE-AZUL', quantidade: 12 },
    ],
    observacoes: 'Ligar depois das 14h.',
    aceite: true,
    ...extra,
  };
}

async function post(caminho, corpo, headers = {}) {
  const r = await fetch(base + caminho, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(corpo) });
  return { status: r.status, corpo: await r.json(), headers: r.headers };
}

async function esperarArquivo(arquivo) {
  for (let i = 0; i < 50; i++) {
    try {
      return await fs.readFile(arquivo, 'utf8');
    } catch {
      await new Promise((ok) => setTimeout(ok, 20));
    }
  }
  throw new Error(`arquivo não apareceu: ${arquivo}`);
}

test('GET /api/produtos agrupa variantes, traz preço unitário e omite inativos', opcoes, async () => {
  await pool.query("UPDATE produtos SET ativo = false WHERE sku = 'RFS-POTE-ROSA'");
  const produtos = await (await fetch(`${base}/api/produtos`)).json();
  assert.equal(produtos.length, 4);
  const pote = produtos.find((p) => p.grupo === 'pote-dobravel');
  assert.equal(pote.precoUnitario, 16.9);
  assert.deepEqual(pote.variantes.map((v) => v.cor), ['Azul', 'Preto', 'Vermelho']);
  assert.equal(produtos.find((p) => p.sku === 'RFS-K3').precoUnitario, 11.9);
  assert.ok(!('estoque' in pote) && !('precoCaixa' in pote));
});

test('POST /api/pedidos grava pedido com preço do banco, gera número e TXT', opcoes, async () => {
  const r = await post('/api/pedidos', pedidoValido());
  assert.equal(r.status, 201);
  assert.match(r.corpo.numero, /^RFS-\d{4}-0001$/);
  assert.equal(r.corpo.valorTotal, 239.5);

  const { rows: [pedido] } = await pool.query('SELECT * FROM pedidos');
  assert.equal(pedido.cnpj, '11222333000181');
  assert.equal(pedido.razao_social, 'Pet Shop Teste Ltda');
  const { rows: itens } = await pool.query('SELECT sku, quantidade, valor_item FROM pedido_itens ORDER BY id');
  assert.deepEqual(itens.map((i) => [i.sku, i.quantidade, i.valor_item]), [
    ['RFS-K3', 2, '23.80'], ['RFS-SUP-ROSA', 1, '12.90'], ['RFS-POTE-AZUL', 12, '202.80'],
  ]);
  const { rows: notif } = await pool.query('SELECT canal, tipo, status FROM notificacoes ORDER BY id');
  assert.deepEqual(notif.map((n) => [n.canal, n.tipo]), [['email', 'interno'], ['whatsapp', 'cliente']]);

  const txt = await esperarArquivo(path.join(pastaPedidos, `${r.corpo.numero}.txt`));
  for (const trecho of ['11.222.333/0001-81', 'Campinas/SP', 'Pote dobrável com mosquetão — Azul', 'TOTAL (15 unidades): R$ 239,50', 'Ligar depois das 14h.']) {
    assert.ok(txt.replace(/ /g, ' ').includes(trecho), `TXT sem "${trecho}"`);
  }
});

test('mesma idempotencyKey devolve o mesmo pedido sem duplicar', opcoes, async () => {
  const corpo = pedidoValido();
  const a = await post('/api/pedidos', corpo);
  const b = await post('/api/pedidos', corpo);
  assert.equal(a.status, 201);
  assert.equal(b.status, 200);
  assert.equal(b.corpo.numero, a.corpo.numero);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM pedidos');
  assert.equal(rows[0].n, 1);
});

test('pedido inválido responde 400 com o campo; produto inativo ou inexistente 422', opcoes, async () => {
  const cnpj = await post('/api/pedidos', pedidoValido({ cliente: { ...pedidoValido().cliente, cnpj: '11.222.333/0001-82' } }));
  assert.equal(cnpj.status, 400);
  assert.equal(cnpj.corpo.erro.campo, 'cliente.cnpj');
  assert.equal((await post('/api/pedidos', pedidoValido({ aceite: false }))).status, 400);

  await pool.query("UPDATE produtos SET ativo = false WHERE sku = 'RFS-K3'");
  const inativo = await post('/api/pedidos', pedidoValido());
  assert.equal(inativo.status, 422);
  assert.equal(inativo.corpo.erro.codigo, 'ITEM_INATIVO');
  const inexistente = await post('/api/pedidos', pedidoValido({ itens: [{ sku: 'NAO-EXISTE', quantidade: 1 }] }));
  assert.equal(inexistente.status, 422);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM pedidos');
  assert.equal(rows[0].n, 0);
});

test('campo invisível preenchido (robô) não grava pedido', opcoes, async () => {
  const r = await post('/api/pedidos', pedidoValido({ website: 'http://spam' }));
  assert.equal(r.status, 201);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM pedidos');
  assert.equal(rows[0].n, 0);
});

test('admin: login, altera preço unitário e lista pedido com dados da empresa', opcoes, async () => {
  const bcrypt = (await import('bcrypt')).default;
  await pool.query('INSERT INTO admin_usuarios (email, senha_hash) VALUES ($1, $2)', ['admin@rufus.com', await bcrypt.hash('senha-forte', 4)]);
  const login = await post('/api/admin/login', { email: 'admin@rufus.com', senha: 'senha-forte' });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const patch = async (corpo) =>
    fetch(`${base}/api/admin/produtos/RFS-K6`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(corpo) });
  assert.equal((await patch({ preco_unitario: 19.9 })).status, 200);
  assert.equal((await patch({ preco_unitario: -1 })).status, 400);
  assert.equal((await patch({ estoque_caixas: 5 })).status, 400);
  const k6 = (await (await fetch(`${base}/api/produtos`)).json()).find((p) => p.sku === 'RFS-K6');
  assert.equal(k6.precoUnitario, 19.9);

  await post('/api/pedidos', pedidoValido({ itens: [{ sku: 'RFS-K6', quantidade: 2 }] }));
  const lista = await (await fetch(`${base}/api/admin/pedidos`, { headers: { cookie } })).json();
  assert.equal(lista.total, 1);
  assert.equal(lista.pedidos[0].razao_social, 'Pet Shop Teste Ltda');
  assert.equal(lista.pedidos[0].itens[0].preco_unitario_snapshot, '19.90');
  assert.equal(lista.pedidos[0].valor_total, '39.80');

  assert.equal((await fetch(`${base}/api/admin/pedidos`)).status, 401);
});
