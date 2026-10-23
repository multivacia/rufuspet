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
  await pool.query('TRUNCATE pedidos, admin_usuarios RESTART IDENTITY CASCADE');
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
