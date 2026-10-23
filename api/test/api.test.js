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
  process.env.ADMIN_LOGIN_LIMITE = '1000';
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
  await pool.query('TRUNCATE pedidos, admin_usuarios, estoque_lotes RESTART IDENTITY CASCADE');
  await pool.query("DELETE FROM clientes WHERE nome <> 'Venda balcão'");
  await pool.query("UPDATE loja_config SET nome = 'Rufus', razao_social = '', cnpj = '', telefone = '', whatsapp = '', email_contato = '', endereco = '', horario = '', instagram = '', emails_internos = '', pedido_minimo = 0");
  await pool.query(`DROP SEQUENCE IF EXISTS pedidos_seq_${new Date().getFullYear()}`);
  // A numeração reinicia a cada teste; TXT de um teste anterior com o mesmo número não pode ser reaproveitado.
  for (const arquivo of await fs.readdir(pastaPedidos)) await fs.unlink(path.join(pastaPedidos, arquivo));
  await pool.query("UPDATE produtos SET ativo = true, preco_unitario = CASE WHEN sku LIKE 'RFS-POTE%' THEN 16.90 WHEN sku LIKE 'RFS-SUP%' THEN 12.90 WHEN sku = 'RFS-K6' THEN 18.90 ELSE 11.90 END");
});

// RF-DDMM-XXX, alfabeto sem 0/O, 1/I/L, 2/Z, 5/S.
const CODIGO_REGEX = /^RF-\d{4}-[ABCDEFGHJKMNPQRTUVWXY346789]{3}$/;

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
  assert.match(r.corpo.codigo, CODIGO_REGEX);
  assert.ok(!('numero' in r.corpo), 'o número sequencial não pode ir para o navegador');
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

  const { rows: [{ numero }] } = await pool.query('SELECT numero FROM pedidos');
  assert.match(numero, /^RFS-\d{4}-0001$/);
  const txt = await esperarArquivo(path.join(pastaPedidos, `${numero}.txt`));
  assert.ok(txt.includes(`(código do cliente: ${r.corpo.codigo})`));
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
  assert.equal(b.corpo.codigo, a.corpo.codigo);
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

test('pedido só com nome e WhatsApp é aceito; sem nenhum contato é recusado', opcoes, async () => {
  const minimo = pedidoValido({ cliente: undefined, contato: { nome: 'João Pet', whatsapp: '(11) 97720-7655', canalPreferido: 'email' } });
  const r = await post('/api/pedidos', minimo);
  assert.equal(r.status, 201);
  const { rows: [pedido] } = await pool.query('SELECT * FROM pedidos');
  assert.deepEqual(
    [pedido.razao_social, pedido.cnpj, pedido.cidade, pedido.uf, pedido.contato_email, pedido.canal_preferido],
    ['', '', '', '', '', 'whatsapp'],
  );
  const { rows: [{ numero: numeroInterno }] } = await pool.query('SELECT numero FROM pedidos');
  const txt = await esperarArquivo(path.join(pastaPedidos, `${numeroInterno}.txt`));
  assert.match(txt, /Nome\/Razão social:\s+—/);
  assert.match(txt, /CPF\/CNPJ:\s+—/);
  const { rows: notif } = await pool.query("SELECT canal, destino FROM notificacoes WHERE tipo = 'cliente'");
  assert.deepEqual(notif, [{ canal: 'whatsapp', destino: '11977207655' }]);

  const semContato = await post('/api/pedidos', pedidoValido({ contato: { nome: 'João Pet', canalPreferido: 'whatsapp' } }));
  assert.equal(semContato.status, 400);
  assert.equal(semContato.corpo.erro.campo, 'contato.whatsapp');
});

test('pessoa física: pedido com CPF é aceito e guardado só com dígitos', opcoes, async () => {
  const r = await post('/api/pedidos', pedidoValido({ cliente: { razaoSocial: 'Maria Silva', cnpj: '529.982.247-25' } }));
  assert.equal(r.status, 201);
  const { rows: [pedido] } = await pool.query('SELECT razao_social, cnpj FROM pedidos');
  assert.deepEqual(pedido, { razao_social: 'Maria Silva', cnpj: '52998224725' });
  const ruim = await post('/api/pedidos', pedidoValido({ cliente: { cnpj: '529.982.247-26' } }));
  assert.equal(ruim.status, 400);
  assert.equal(ruim.corpo.erro.mensagem, 'CPF ou CNPJ inválido');
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

async function loginAdmin() {
  const bcrypt = (await import('bcrypt')).default;
  await pool.query('INSERT INTO admin_usuarios (email, senha_hash) VALUES ($1, $2)', ['admin@rufus.com', await bcrypt.hash('senha-forte', 4)]);
  const login = await post('/api/admin/login', { email: 'admin@rufus.com', senha: 'senha-forte' });
  return login.headers.get('set-cookie').split(';')[0];
}

test('dados da loja: público lê, admin altera e valida', opcoes, async () => {
  assert.deepEqual(await (await fetch(`${base}/api/loja`)).json(), {
    nome: 'Rufus', razaoSocial: '', cnpj: '', telefone: '', whatsapp: '', emailContato: '', endereco: '', horario: '', instagram: '',
    pedidoMinimo: 0,
  });
  const put = (corpo, cookie) =>
    fetch(`${base}/api/admin/loja`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(corpo) });
  assert.equal((await put({ telefone: '1' })).status, 401);

  const cookie = await loginAdmin();
  const ok = await put({ razaoSocial: 'Rufus Distribuidora Ltda', cnpj: '11.222.333/0001-81', telefone: ' (11) 4000-0000 ', instagram: '@rufuspet' }, cookie);
  assert.equal(ok.status, 200);
  const loja = await (await fetch(`${base}/api/loja`)).json();
  assert.equal(loja.telefone, '(11) 4000-0000');
  assert.equal(loja.cnpj, '11.222.333/0001-81');
  assert.equal(loja.nome, 'Rufus');

  for (const [corpo, campo] of [[{ cnpj: '123' }, 'cnpj'], [{ emailContato: 'x' }, 'emailContato'], [{ nome: '' }, 'nome'], [{ endereco: 'x'.repeat(201) }, 'endereco']]) {
    const r = await put(corpo, cookie);
    assert.equal(r.status, 400, JSON.stringify(corpo));
    assert.equal((await r.json()).erro.campo, campo);
  }
  assert.equal((await put({ cnpj: '' }, cookie)).status, 200); // vazio é permitido (não aparece no site)
});

test('e-mails internos: editáveis no admin, privados e usados no aviso do pedido', opcoes, async () => {
  const cookie = await loginAdmin();
  const put = (corpo) =>
    fetch(`${base}/api/admin/loja`, { method: 'PUT', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(corpo) });

  // Vazio no admin → usa EMAILS_INTERNOS do .env
  await post('/api/pedidos', pedidoValido());
  let { rows } = await pool.query("SELECT destino FROM notificacoes WHERE tipo = 'interno' ORDER BY id");
  assert.deepEqual(rows.map((r) => r.destino), ['loja@exemplo.com']);

  const invalido = await put({ emailsInternos: 'ok@x.com, ruim' });
  assert.equal(invalido.status, 400);
  assert.equal((await invalido.json()).erro.campo, 'emailsInternos');

  const ok = await put({ emailsInternos: 'Vendas@Rufus.com; dono@rufus.com\n vendas@rufus.com' });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).emailsInternos, 'vendas@rufus.com, dono@rufus.com');
  assert.equal((await (await fetch(`${base}/api/admin/loja`, { headers: { cookie } })).json()).emailsInternos, 'vendas@rufus.com, dono@rufus.com');
  assert.ok(!('emailsInternos' in (await (await fetch(`${base}/api/loja`)).json())), 'não pode ir para o site público');

  await pool.query('TRUNCATE pedidos RESTART IDENTITY CASCADE');
  await post('/api/pedidos', pedidoValido());
  ({ rows } = await pool.query("SELECT destino FROM notificacoes WHERE tipo = 'interno' ORDER BY id"));
  assert.deepEqual(rows.map((r) => r.destino), ['vendas@rufus.com', 'dono@rufus.com']);
});

test('pedido mínimo: configurável no admin, público no site e validado no pedido', opcoes, async () => {
  const cookie = await loginAdmin();
  const put = (corpo) =>
    fetch(`${base}/api/admin/loja`, { method: 'PUT', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(corpo) });

  for (const invalido of ['-1', 'abc', '10,555', 2000000]) {
    const r = await put({ pedidoMinimo: invalido });
    assert.equal(r.status, 400, String(invalido));
    assert.equal((await r.json()).erro.campo, 'pedidoMinimo');
  }
  assert.equal((await (await put({ pedidoMinimo: '1.250,5' })).json()).pedidoMinimo, 1250.5);
  assert.equal((await (await put({ pedidoMinimo: 150 })).json()).pedidoMinimo, 150);
  assert.equal((await (await fetch(`${base}/api/loja`)).json()).pedidoMinimo, 150);

  // 2 × 11,90 = 23,80 < 150 → recusado com quanto falta
  const abaixo = await post('/api/pedidos', pedidoValido({ itens: [{ sku: 'RFS-K3', quantidade: 2 }] }));
  assert.equal(abaixo.status, 422);
  assert.equal(abaixo.corpo.erro.codigo, 'PEDIDO_MINIMO');
  assert.match(abaixo.corpo.erro.mensagem.replace(/\u00a0/g, ' '), /mínimo é de R\$ 150,00\. Faltam R\$ 126,20/);

  // 239,50 ≥ 150 → aceito; mínimo exato também
  assert.equal((await post('/api/pedidos', pedidoValido())).status, 201);
  await put({ pedidoMinimo: '239,50' });
  assert.equal((await post('/api/pedidos', pedidoValido())).status, 201);

  await put({ pedidoMinimo: 0 }); // 0 = sem mínimo
  assert.equal((await post('/api/pedidos', pedidoValido({ itens: [{ sku: 'RFS-K3', quantidade: 1 }] }))).status, 201);
});

test('código público: único, com a data do dia, e busca no admin ignorando hífen e caixa', opcoes, async () => {
  const codigos = new Set();
  for (let i = 0; i < 5; i++) {
    const r = await post('/api/pedidos', pedidoValido());
    assert.equal(r.status, 201);
    codigos.add(r.corpo.codigo);
  }
  assert.equal(codigos.size, 5);
  const ddmm = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })
    .format(new Date()).replace('/', '');
  for (const c of codigos) assert.ok(c.startsWith(`RF-${ddmm}-`), c);

  const cookie = await loginAdmin();
  const alvo = [...codigos][2];
  const buscar = async (termo) =>
    (await (await fetch(`${base}/api/admin/pedidos?busca=${encodeURIComponent(termo)}`, { headers: { cookie } })).json());
  for (const termo of [alvo, alvo.toLowerCase().replaceAll('-', ''), alvo.slice(-3).toLowerCase()]) {
    const r = await buscar(termo);
    assert.ok(r.pedidos.some((p) => p.codigo_publico === alvo), termo);
  }
  assert.equal((await buscar('RFS-')).total, 5);
  assert.equal((await buscar('não existe')).total, 0);
  assert.equal((await buscar('100%')).total, 0);
});

test('admin: reenviar e-mails do pedido', opcoes, async () => {
  const cookie = await loginAdmin();
  const r = await post('/api/pedidos', pedidoValido({ contato: { ...pedidoValido().contato, canalPreferido: 'email' } }));
  const { rows: [{ id }] } = await pool.query('SELECT id FROM pedidos WHERE codigo_publico = $1', [r.corpo.codigo]);
  const reenviar = async () => {
    const resp = await fetch(`${base}/api/admin/pedidos/${id}/reenviar-emails`, { method: 'POST', headers: { cookie } });
    return { status: resp.status, corpo: await resp.json() };
  };
  const smtpOriginal = { host: process.env.SMTP_HOST, port: process.env.SMTP_PORT, user: process.env.SMTP_USER, pass: process.env.SMTP_PASS };
  try {
    // Sem SMTP: recusa com motivo, sem tentar enviar.
    let res = await reenviar();
    assert.equal(res.status, 409);
    assert.match(res.corpo.erro.mensagem, /SMTP_HOST vazio/);

    // Gmail sem usuário/senha (o caso real do erro 530): também recusa.
    process.env.SMTP_HOST = 'smtp.gmail.com';
    res = await reenviar();
    assert.equal(res.status, 409);
    assert.match(res.corpo.erro.mensagem, /SMTP_USER ou SMTP_PASS vazio/);

    // Configurado: envia para os destinatários ATUAIS do admin + confirmação ao cliente.
    await fetch(`${base}/api/admin/loja`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ emailsInternos: 'a@rufus.com, b@rufus.com' }),
    });
    process.env.SMTP_HOST = 'json';
    res = await reenviar();
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.corpo.emails.map((e) => [e.tipo, e.destino, e.status]).sort(),
      [['cliente', 'maria@exemplo.com', 'enviado'], ['interno', 'a@rufus.com', 'enviado'], ['interno', 'b@rufus.com', 'enviado']],
    );

    // Servidor fora do ar: falha registrada com o erro, e a lista do admin mostra a situação.
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = '1';
    res = await reenviar();
    assert.equal(res.status, 200);
    assert.ok(res.corpo.emails.every((e) => e.status === 'falhou' && e.ultimo_erro), JSON.stringify(res.corpo.emails));
    const lista = await (await fetch(`${base}/api/admin/pedidos`, { headers: { cookie } })).json();
    assert.equal(lista.emailConfigurado, true);
    assert.equal(lista.pedidos.find((p) => p.id === id).emails.length, 3);

    assert.equal((await fetch(`${base}/api/admin/pedidos/999999/reenviar-emails`, { method: 'POST', headers: { cookie } })).status, 404);
    assert.equal((await fetch(`${base}/api/admin/pedidos/${id}/reenviar-emails`, { method: 'POST' })).status, 401);
  } finally {
    for (const [k, v] of Object.entries({ SMTP_HOST: smtpOriginal.host, SMTP_PORT: smtpOriginal.port, SMTP_USER: smtpOriginal.user, SMTP_PASS: smtpOriginal.pass })) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

// ---------------------------------------------------------------- estoque (PEPS)

async function req(cookie, metodo, caminho, corpo) {
  const r = await fetch(base + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', cookie },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, corpo: await r.json() };
}

async function balcaoId() {
  return (await pool.query("SELECT id FROM clientes WHERE nome = 'Venda balcão'")).rows[0].id;
}

async function idDoPedido(codigo) {
  return (await pool.query('SELECT id FROM pedidos WHERE codigo_publico = $1', [codigo])).rows[0].id;
}

async function saldoDe(cookie, sku) {
  const { corpo } = await req(cookie, 'GET', '/api/admin/estoque');
  return corpo.saldos.find((s) => s.sku === sku);
}

test('estoque: entradas com custo, baixa PEPS ao confirmar, estorno ao cancelar', opcoes, async () => {
  const cookie = await loginAdmin();
  // Compra mais nova lançada primeiro: a ordem PEPS é pela data da compra.
  assert.equal((await req(cookie, 'POST', '/api/admin/estoque/entradas', { sku: 'RFS-K3', quantidade: 10, custoUnitario: '3,00', data: '2026-10-02' })).status, 201);
  assert.equal((await req(cookie, 'POST', '/api/admin/estoque/entradas', { sku: 'RFS-K3', quantidade: 10, custoUnitario: 2, data: '2026-10-01' })).status, 201);
  let k3 = await saldoDe(cookie, 'RFS-K3');
  assert.equal(k3.saldo, 20);
  assert.equal(k3.custoEstoque, 50);
  assert.equal(k3.proximoCusto, 2);

  const { corpo: criado } = await post('/api/pedidos', pedidoValido({ itens: [{ sku: 'RFS-K3', quantidade: 15 }] }));
  const { rows } = await pool.query('SELECT id FROM pedidos WHERE codigo_publico = $1', [criado.codigo]);
  const id = rows[0].id;

  // Pedido novo não mexe no estoque.
  assert.equal((await saldoDe(cookie, 'RFS-K3')).saldo, 20);

  const conf = await req(cookie, 'PATCH', `/api/admin/pedidos/${id}`, { status: 'confirmado', clienteId: await balcaoId() });
  assert.equal(conf.status, 200);
  assert.ok(conf.corpo.estoque_baixado_em);
  k3 = await saldoDe(cookie, 'RFS-K3');
  assert.equal(k3.saldo, 5);
  assert.equal(k3.custoEstoque, 15); // sobraram 5 da compra de R$ 3,00
  let lista = (await req(cookie, 'GET', '/api/admin/pedidos')).corpo;
  assert.equal(lista.pedidos[0].custo_estoque, 35); // 10 × 2,00 + 5 × 3,00

  // confirmado → faturado não baixa de novo.
  assert.equal((await req(cookie, 'PATCH', `/api/admin/pedidos/${id}`, { status: 'faturado' })).status, 200);
  assert.equal((await saldoDe(cookie, 'RFS-K3')).saldo, 5);

  // Cancelar devolve para os mesmos lotes.
  assert.equal((await req(cookie, 'PATCH', `/api/admin/pedidos/${id}`, { status: 'cancelado' })).status, 200);
  k3 = await saldoDe(cookie, 'RFS-K3');
  assert.equal(k3.saldo, 20);
  assert.equal(k3.custoEstoque, 50);
  lista = (await req(cookie, 'GET', '/api/admin/pedidos')).corpo;
  assert.equal(lista.pedidos[0].custo_estoque, null);
  assert.equal(lista.pedidos[0].estoque_baixado_em, null);

  // Reconfirmar baixa de novo com o mesmo custo.
  assert.equal((await req(cookie, 'PATCH', `/api/admin/pedidos/${id}`, { status: 'confirmado' })).status, 200);
  lista = (await req(cookie, 'GET', '/api/admin/pedidos')).corpo;
  assert.equal(lista.pedidos[0].custo_estoque, 35);

  const movs = (await req(cookie, 'GET', '/api/admin/estoque/movimentos?sku=RFS-K3')).corpo.movimentos;
  assert.deepEqual(
    movs.map((m) => [m.tipo, m.quantidade]),
    [['saida_pedido', -15], ['estorno_pedido', 15], ['saida_pedido', -15], ['entrada', 10], ['entrada', 10]],
  );
  assert.equal(movs[0].pedidoCodigo, criado.codigo);
  assert.equal(movs[0].criadoPor, 'admin@rufus.com');
});

test('estoque: confirmação bloqueada sem saldo, sem baixa parcial', opcoes, async () => {
  const cookie = await loginAdmin();
  await req(cookie, 'POST', '/api/admin/estoque/entradas', { sku: 'RFS-K3', quantidade: 5, custoUnitario: 2 });
  await req(cookie, 'POST', '/api/admin/estoque/entradas', { sku: 'RFS-K6', quantidade: 1, custoUnitario: 4 });
  const { corpo: criado } = await post('/api/pedidos', pedidoValido({ itens: [{ sku: 'RFS-K3', quantidade: 3 }, { sku: 'RFS-K6', quantidade: 2 }] }));
  const id = (await pool.query('SELECT id FROM pedidos WHERE codigo_publico = $1', [criado.codigo])).rows[0].id;

  const r = await req(cookie, 'PATCH', `/api/admin/pedidos/${id}`, { status: 'confirmado', clienteId: await balcaoId() });
  assert.equal(r.status, 409);
  assert.equal(r.corpo.erro.codigo, 'ESTOQUE_INSUFICIENTE');
  assert.deepEqual(r.corpo.erro.faltas.map((f) => [f.sku, f.pedido, f.saldo]), [['RFS-K6', 2, 1]]);
  assert.match(r.corpo.erro.mensagem, /pedido 2, saldo 1/);

  const pedido = (await pool.query('SELECT status, estoque_baixado_em, cliente_id FROM pedidos WHERE id = $1', [id])).rows[0];
  assert.equal(pedido.status, 'novo');
  assert.equal(pedido.cliente_id, null); // vínculo também desfeito: tudo ou nada
  assert.equal(pedido.estoque_baixado_em, null);
  assert.equal((await saldoDe(cookie, 'RFS-K3')).saldo, 5); // K3 tinha saldo, mas nada foi baixado

  // Observações continuam editáveis sem mexer no estoque.
  assert.equal((await req(cookie, 'PATCH', `/api/admin/pedidos/${id}`, { observacoes: 'aguardando reposição' })).status, 200);
});

test('estoque: baixa manual PEPS, exclusão de entrada e validações', opcoes, async () => {
  const cookie = await loginAdmin();
  const e1 = await req(cookie, 'POST', '/api/admin/estoque/entradas', { sku: 'RFS-POTE-AZUL', quantidade: 4, custoUnitario: '1,5', data: '2026-09-01' });
  const e2 = await req(cookie, 'POST', '/api/admin/estoque/entradas', { sku: 'RFS-POTE-AZUL', quantidade: 6, custoUnitario: '2,25', data: '2026-09-10' });

  assert.equal((await req(cookie, 'POST', '/api/admin/estoque/baixas', { sku: 'RFS-POTE-AZUL', quantidade: 1 })).status, 400); // sem motivo
  const semSaldo = await req(cookie, 'POST', '/api/admin/estoque/baixas', { sku: 'RFS-POTE-AZUL', quantidade: 11, motivo: 'avaria' });
  assert.equal(semSaldo.status, 409);
  const baixa = await req(cookie, 'POST', '/api/admin/estoque/baixas', { sku: 'RFS-POTE-AZUL', quantidade: 5, motivo: 'avaria no transporte' });
  assert.equal(baixa.status, 201);
  assert.equal(baixa.corpo.custoTotal, 8.25); // 4 × 1,50 + 1 × 2,25

  // A primeira entrada foi consumida: não pode excluir. A segunda também (1 un.). Uma nova, intacta, pode.
  assert.equal((await req(cookie, 'DELETE', `/api/admin/estoque/entradas/${e1.corpo.loteId}`)).status, 409);
  assert.equal((await req(cookie, 'DELETE', `/api/admin/estoque/entradas/${e2.corpo.loteId}`)).status, 409);
  const e3 = await req(cookie, 'POST', '/api/admin/estoque/entradas', { sku: 'RFS-POTE-AZUL', quantidade: 100, custoUnitario: 9 });
  const lotes = (await req(cookie, 'GET', '/api/admin/estoque/lotes?sku=RFS-POTE-AZUL')).corpo.lotes;
  assert.deepEqual(lotes.map((l) => l.podeExcluir), [true, false, false]);
  assert.equal((await req(cookie, 'DELETE', `/api/admin/estoque/entradas/${e3.corpo.loteId}`)).status, 200);
  assert.equal((await saldoDe(cookie, 'RFS-POTE-AZUL')).saldo, 5);
  const movs = (await req(cookie, 'GET', '/api/admin/estoque/movimentos?sku=RFS-POTE-AZUL')).corpo.movimentos;
  assert.equal(movs[0].tipo, 'entrada_excluida');
  assert.equal(movs[0].quantidade, -100);

  // Validações.
  const invalido = async (corpo) => (await req(cookie, 'POST', '/api/admin/estoque/entradas', corpo)).corpo.erro?.campo;
  assert.equal(await invalido({ sku: 'RFS-K3', quantidade: 0, custoUnitario: 1 }), 'quantidade');
  assert.equal(await invalido({ sku: 'RFS-K3', quantidade: '2.5', custoUnitario: 1 }), 'quantidade');
  assert.equal(await invalido({ sku: 'RFS-K3', quantidade: 2, custoUnitario: '-1' }), 'custoUnitario');
  assert.equal(await invalido({ sku: 'RFS-K3', quantidade: 2, custoUnitario: 1, data: '2099-01-01' }), 'data');
  assert.equal(await invalido({ sku: 'RFS-K3', quantidade: 2, custoUnitario: 1, data: '2026-02-30' }), 'data');
  assert.equal((await req(cookie, 'POST', '/api/admin/estoque/entradas', { sku: 'NAO-EXISTE', quantidade: 2, custoUnitario: 1 })).status, 404);
  assert.equal((await fetch(`${base}/api/admin/estoque`)).status, 401);
});

test('estoque: fornecedor e documento opcionais na entrada, com sugestão de fornecedores', opcoes, async () => {
  const cookie = await loginAdmin();
  const e1 = await req(cookie, 'POST', '/api/admin/estoque/entradas', {
    sku: 'RFS-K3', quantidade: 100, custoUnitario: '1,80', data: '2026-10-01',
    fornecedor: '  Ningbo   Pet Supplies ', documento: 'DI 26/1234567-8', observacao: 'container 1',
  });
  assert.equal(e1.status, 201);
  await req(cookie, 'POST', '/api/admin/estoque/entradas', { sku: 'RFS-K3', quantidade: 10, custoUnitario: 3, fornecedor: 'Distribuidora SP' });
  await req(cookie, 'POST', '/api/admin/estoque/entradas', { sku: 'RFS-K6', quantidade: 5, custoUnitario: 4 }); // sem fornecedor

  const lotes = (await req(cookie, 'GET', '/api/admin/estoque/lotes?sku=RFS-K3')).corpo.lotes;
  const china = lotes.find((l) => l.id === e1.corpo.loteId);
  assert.equal(china.fornecedor, 'Ningbo Pet Supplies');
  assert.equal(china.documento, 'DI 26/1234567-8');
  assert.equal(china.observacao, 'container 1');

  const forn = (await req(cookie, 'GET', '/api/admin/estoque/fornecedores')).corpo.fornecedores;
  assert.deepEqual([...forn].sort(), ['Distribuidora SP', 'Ningbo Pet Supplies']);

  const movs = (await req(cookie, 'GET', '/api/admin/estoque/movimentos?sku=RFS-K3')).corpo.movimentos;
  assert.equal(movs.find((m) => m.loteId === e1.corpo.loteId).fornecedor, 'Ningbo Pet Supplies');
});

// ---------------------------------------------------------------- clientes e pedido no admin

const CLIENTE_PJ = {
  nome: 'Pet Shop Teste Ltda', nomeFantasia: 'Pet Feliz', documento: '11.222.333/0001-81', inscricaoEstadual: 'isento',
  comprador: 'Maria', whatsapp: '+55 (11) 98765-4321', email: 'Maria@Exemplo.com', cidade: 'Campinas', uf: 'sp',
  endereco: 'Rua A, 10', vendedor: '  Gustavo ', observacoes: 'paga no pix',
};

test('clientes: cadastro, validações, documento único e busca', opcoes, async () => {
  const cookie = await loginAdmin();
  const criado = await req(cookie, 'POST', '/api/admin/clientes', CLIENTE_PJ);
  assert.equal(criado.status, 201);
  const c = criado.corpo;
  assert.equal(c.tipo, 'PJ');
  assert.equal(c.documento, '11222333000181');
  assert.equal(c.inscricaoEstadual, 'ISENTO');
  assert.equal(c.whatsapp, '11987654321'); // sem o 55
  assert.equal(c.email, 'maria@exemplo.com');
  assert.equal(c.uf, 'SP');
  assert.equal(c.vendedor, 'Gustavo');

  const dup = await req(cookie, 'POST', '/api/admin/clientes', { nome: 'Outro', documento: '11222333000181' });
  assert.equal(dup.status, 409);
  assert.match(dup.corpo.erro.mensagem, /Pet Shop Teste Ltda/);
  const campo = async (corpo) => (await req(cookie, 'POST', '/api/admin/clientes', corpo)).corpo.erro?.campo;
  assert.equal(await campo({ nome: '' }), 'nome');
  assert.equal(await campo({ nome: 'X', documento: '111.111.111-11' }), 'documento');
  assert.equal(await campo({ nome: 'X', whatsapp: '123' }), 'whatsapp');
  assert.equal(await campo({ nome: 'X', email: 'sem-arroba' }), 'email');
  assert.equal(await campo({ nome: 'X', uf: 'XX' }), 'uf');

  const pf = await req(cookie, 'POST', '/api/admin/clientes', { nome: 'João Silva', documento: '529.982.247-25', tipo: 'PJ' });
  assert.equal(pf.corpo.tipo, 'PF'); // tipo segue o documento

  const ed = await req(cookie, 'PUT', `/api/admin/clientes/${c.id}`, { ...CLIENTE_PJ, comprador: 'Ana', ativo: false });
  assert.equal(ed.status, 200);
  assert.equal(ed.corpo.comprador, 'Ana');
  assert.equal(ed.corpo.ativo, false);
  assert.equal((await req(cookie, 'PUT', '/api/admin/clientes/9999', CLIENTE_PJ)).status, 404);

  const busca = async (t) => (await req(cookie, 'GET', `/api/admin/clientes?busca=${encodeURIComponent(t)}`)).corpo.clientes.map((x) => x.nome);
  assert.deepEqual(await busca('feliz'), ['Pet Shop Teste Ltda']);
  assert.deepEqual(await busca('11.222.333'), ['Pet Shop Teste Ltda']);
  assert.deepEqual(await busca('98765'), ['Pet Shop Teste Ltda']);
  assert.deepEqual(await busca('gustavo'), ['Pet Shop Teste Ltda']);
  assert.equal((await req(cookie, 'GET', '/api/admin/clientes')).corpo.total, 3); // + Venda balcão
  assert.equal((await fetch(`${base}/api/admin/clientes`)).status, 401);
});

test('pedido: confirmar exige cliente; vínculo herda vendedor; sugestões por documento/WhatsApp/e-mail', opcoes, async () => {
  const cookie = await loginAdmin();
  const cli = (await req(cookie, 'POST', '/api/admin/clientes', CLIENTE_PJ)).corpo;
  await req(cookie, 'POST', '/api/admin/clientes', { nome: 'Só e-mail', email: 'maria@exemplo.com' });
  await req(cookie, 'POST', '/api/admin/clientes', { nome: 'Sem relação', whatsapp: '11911112222' });
  await req(cookie, 'POST', '/api/admin/estoque/entradas', { sku: 'RFS-K3', quantidade: 50, custoUnitario: 2 });

  const { corpo: criado } = await post('/api/pedidos', pedidoValido({ itens: [{ sku: 'RFS-K3', quantidade: 2 }] }));
  const id = await idDoPedido(criado.codigo);

  const sug = (await req(cookie, 'GET', `/api/admin/pedidos/${id}/sugestoes-clientes`)).corpo.clientes;
  assert.deepEqual(sug.map((s) => [s.nome, s.motivos]), [
    ['Pet Shop Teste Ltda', ['CPF/CNPJ', 'WhatsApp', 'e-mail']],
    ['Só e-mail', ['e-mail']],
  ]);

  const semCliente = await req(cookie, 'PATCH', `/api/admin/pedidos/${id}`, { status: 'confirmado' });
  assert.equal(semCliente.status, 422);
  assert.equal(semCliente.corpo.erro.codigo, 'CLIENTE_OBRIGATORIO');
  assert.equal((await saldoDe(cookie, 'RFS-K3')).saldo, 50);

  const ok = await req(cookie, 'PATCH', `/api/admin/pedidos/${id}`, { status: 'confirmado', clienteId: cli.id });
  assert.equal(ok.status, 200);
  assert.equal(ok.corpo.cliente_id, cli.id);
  assert.equal(ok.corpo.vendedor, 'Gustavo'); // herdado da carteira

  // Desvincular pedido confirmado não é permitido; trocar vendedor é.
  assert.equal((await req(cookie, 'PATCH', `/api/admin/pedidos/${id}`, { clienteId: null })).status, 422);
  assert.equal((await req(cookie, 'PATCH', `/api/admin/pedidos/${id}`, { vendedor: 'Esposa' })).corpo.vendedor, 'Esposa');
  // Cancelar não exige cliente; desvincular depois de cancelado é permitido.
  assert.equal((await req(cookie, 'PATCH', `/api/admin/pedidos/${id}`, { status: 'cancelado', clienteId: null })).status, 200);

  const vend = (await req(cookie, 'GET', '/api/admin/vendedores')).corpo.vendedores;
  assert.deepEqual(vend, ['Esposa', 'Gustavo']);
});

test('pedido: editar itens/preço — solicitação livre; com baixa, limite = saldo + o que o pedido já baixou', opcoes, async () => {
  const cookie = await loginAdmin();
  const balcao = await balcaoId();
  await req(cookie, 'POST', '/api/admin/estoque/entradas', { sku: 'RFS-K3', quantidade: 10, custoUnitario: 2, data: '2026-10-01' });
  await req(cookie, 'POST', '/api/admin/estoque/entradas', { sku: 'RFS-K3', quantidade: 10, custoUnitario: 3, data: '2026-10-02' });

  const { corpo: criado } = await post('/api/pedidos', pedidoValido({ itens: [{ sku: 'RFS-K3', quantidade: 2 }] }));
  const id = await idDoPedido(criado.codigo);

  // Solicitação: edita sem olhar estoque, com preço negociado.
  const sol = await req(cookie, 'PATCH', `/api/admin/pedidos/${id}`, { itens: [{ sku: 'RFS-K3', quantidade: 999, precoUnitario: '10,50' }] });
  assert.equal(sol.status, 200);
  assert.equal(sol.corpo.valor_total, '10489.50');
  assert.equal((await saldoDe(cookie, 'RFS-K3')).saldo, 20);
  assert.equal((await req(cookie, 'PATCH', `/api/admin/pedidos/${id}`, { status: 'confirmado', clienteId: balcao })).status, 409);

  // Volta para 15 e confirma: saldo 5.
  await req(cookie, 'PATCH', `/api/admin/pedidos/${id}`, { itens: [{ sku: 'RFS-K3', quantidade: 15, precoUnitario: 10.5 }] });
  assert.equal((await req(cookie, 'PATCH', `/api/admin/pedidos/${id}`, { status: 'confirmado', clienteId: balcao })).status, 200);
  assert.equal((await saldoDe(cookie, 'RFS-K3')).saldo, 5);

  // Confirmado: disponível = 5 + 15 = 20. 21 bloqueia sem mudar nada; 20 passa e reprocessa PEPS.
  const demais = await req(cookie, 'PATCH', `/api/admin/pedidos/${id}`, { itens: [{ sku: 'RFS-K3', quantidade: 21 }] });
  assert.equal(demais.status, 409);
  assert.match(demais.corpo.erro.mensagem, /pedido 21, saldo 20/);
  const itensDepois = (await pool.query('SELECT quantidade, preco_unitario_snapshot FROM pedido_itens WHERE pedido_id = $1', [id])).rows;
  assert.deepEqual(itensDepois.map((i) => [i.quantidade, i.preco_unitario_snapshot]), [[15, '10.50']]);
  assert.equal((await saldoDe(cookie, 'RFS-K3')).saldo, 5);

  const vinte = await req(cookie, 'PATCH', `/api/admin/pedidos/${id}`, { itens: [{ sku: 'RFS-K3', quantidade: 20 }] });
  assert.equal(vinte.status, 200);
  assert.equal(vinte.corpo.valor_total, '238.00'); // sem preço informado = preço do catálogo (11,90)
  assert.equal((await saldoDe(cookie, 'RFS-K3')).saldo, 0);
  const lista = (await req(cookie, 'GET', '/api/admin/pedidos')).corpo;
  assert.equal(lista.pedidos[0].custo_estoque, 50); // 10×2 + 10×3

  // Reduz para 4: devolve 16 (PEPS reprocessado: as 4 saem da compra de R$ 2,00).
  await req(cookie, 'PATCH', `/api/admin/pedidos/${id}`, { itens: [{ sku: 'RFS-K3', quantidade: 4 }] });
  assert.equal((await saldoDe(cookie, 'RFS-K3')).saldo, 16);
  assert.equal((await req(cookie, 'GET', '/api/admin/pedidos')).corpo.pedidos[0].custo_estoque, 8);

  // Validações dos itens.
  const erro = async (itens) => (await req(cookie, 'PATCH', `/api/admin/pedidos/${id}`, { itens })).corpo.erro?.mensagem;
  assert.match(await erro([]), /pelo menos um item/);
  assert.match(await erro([{ sku: 'RFS-K3', quantidade: 1 }, { sku: 'RFS-K3', quantidade: 2 }]), /repetido/);
  assert.match(await erro([{ sku: 'RFS-K3', quantidade: 1, precoUnitario: '0' }]), /Preço/);
  assert.match(await erro([{ sku: 'NAO-EXISTE', quantidade: 1 }]), /não encontrado/);
});

test('pedido manual (venda fora do site), fases e ficha do cliente com histórico', opcoes, async () => {
  const cookie = await loginAdmin();
  const cli = (await req(cookie, 'POST', '/api/admin/clientes', CLIENTE_PJ)).corpo;
  await req(cookie, 'POST', '/api/admin/estoque/entradas', { sku: 'RFS-K6', quantidade: 10, custoUnitario: 4 });

  assert.equal((await req(cookie, 'POST', '/api/admin/pedidos', { itens: [{ sku: 'RFS-K6', quantidade: 1 }] })).status, 400);
  assert.equal((await req(cookie, 'POST', '/api/admin/pedidos', { clienteId: cli.id, itens: [{ sku: 'RFS-K6', quantidade: 11 }] })).status, 409);

  const manual = await req(cookie, 'POST', '/api/admin/pedidos', {
    clienteId: cli.id, itens: [{ sku: 'RFS-K6', quantidade: 3, precoUnitario: '17,00' }], observacoes: 'fechado por telefone',
  });
  assert.equal(manual.status, 201);
  assert.equal(manual.corpo.status, 'confirmado');
  assert.equal(manual.corpo.origem, 'admin');
  assert.equal(manual.corpo.vendedor, 'Gustavo');
  assert.equal(manual.corpo.contato_nome, 'Maria');
  assert.equal(manual.corpo.valor_total, '51.00');
  assert.ok(manual.corpo.estoque_baixado_em);
  assert.match(manual.corpo.codigo_publico, CODIGO_REGEX);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM notificacoes WHERE pedido_id = $1', [manual.corpo.id])).rows[0].n, 0);

  // Uma solicitação vinculada mas não confirmada e uma cancelada não contam como compra.
  const sol = await req(cookie, 'POST', '/api/admin/pedidos', { clienteId: cli.id, status: 'novo', itens: [{ sku: 'RFS-K6', quantidade: 1 }] });
  assert.equal(sol.corpo.estoque_baixado_em, null);
  const canc = await req(cookie, 'POST', '/api/admin/pedidos', { clienteId: cli.id, itens: [{ sku: 'RFS-K6', quantidade: 1 }] });
  await req(cookie, 'PATCH', `/api/admin/pedidos/${canc.corpo.id}`, { status: 'cancelado' });
  await post('/api/pedidos', pedidoValido({ itens: [{ sku: 'RFS-K3', quantidade: 1 }] })); // solicitação do site sem cliente

  const fase = async (f) => (await req(cookie, 'GET', `/api/admin/pedidos?fase=${f}`)).corpo;
  assert.equal((await fase('solicitacoes')).total, 2);
  assert.equal((await fase('pedidos')).total, 1);
  assert.equal((await fase('cancelados')).total, 1);
  const todos = await fase('');
  assert.equal(todos.total, 4);
  assert.deepEqual(todos.contagem, { solicitacoes: 2, pedidos: 1, sem_cliente: 0 });
  assert.equal(todos.pedidos.find((p) => p.id === manual.corpo.id).cliente_nome, 'Pet Shop Teste Ltda');
  assert.equal((await req(cookie, 'GET', '/api/admin/pedidos?busca=pet%20feliz')).corpo.total, 4); // dados do pedido ou do cliente

  const ficha = (await req(cookie, 'GET', `/api/admin/clientes/${cli.id}`)).corpo;
  assert.equal(ficha.pedidos.length, 3);
  assert.deepEqual(ficha.resumo, { compras: 1, totalComprado: 51, custo: 12, margem: 39, ultimaCompra: ficha.pedidos.at(-1).criadoEm });
  const lst = (await req(cookie, 'GET', '/api/admin/clientes')).corpo.clientes.find((x) => x.id === cli.id);
  assert.equal(lst.compras, 1);
  assert.equal(lst.totalComprado, 51);
  assert.equal((await req(cookie, 'GET', '/api/admin/clientes/9999')).status, 404);
});
