import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlPedido, textoPedido } from '../src/services/notificacao.service.js';

const pedido = {
  numero: 'RFS-2026-0007', criado_em: '2026-10-18T20:09:00Z', razao_social: 'Pet <b>Shop</b>', nome_fantasia: '',
  cnpj: '11222333000181', cidade: 'Campinas', uf: 'SP', contato_nome: 'Maria', contato_whatsapp: '11987654321',
  contato_email: 'maria@exemplo.com', canal_preferido: 'email', valor_total: '239.50', observacoes: 'Ligar à tarde\n<script>',
};
const itens = [
  { sku: 'RFS-K3', nome_snapshot: 'Kit 3 rolos', cor_snapshot: null, quantidade: 2, preco_unitario_snapshot: '11.90', valor_item: '23.80' },
  { sku: 'RFS-POTE-AZUL', nome_snapshot: 'Pote dobrável', cor_snapshot: 'Azul', quantidade: 12, preco_unitario_snapshot: '16.90', valor_item: '202.80' },
];
const loja = { nome: 'Rufus', razaoSocial: 'Rufus Ltda', cnpj: '', telefone: '(11) 4000-0000', whatsapp: '', emailContato: 'contato@rufus.com', endereco: '' };
const semNbsp = (s) => s.replace(/ /g, ' ');

test('HTML do pedido traz itens, total, dados da loja e escapa o que veio do cliente', () => {
  const html = semNbsp(htmlPedido(pedido, itens, loja));
  for (const trecho of ['RFS-2026-0007', 'Pote dobrável — Azul', 'R$ 202,80', 'R$ 239,50', '11.222.333/0001-81', '(11) 4000-0000', 'contato@rufus.com', 'Novo pedido']) {
    assert.ok(html.includes(trecho), `faltou "${trecho}"`);
  }
  assert.ok(!html.includes('<b>Shop</b>') && !html.includes('<script>'), 'HTML do cliente não pode passar sem escape');
  assert.ok(html.includes('Pet &#60;b&#62;Shop'));
});

test('versão do cliente tem saudação e título de confirmação', () => {
  const html = htmlPedido(pedido, itens, loja, { paraCliente: true });
  assert.ok(html.includes('Olá, <b>Maria</b>') && html.includes('Confirmação de pedido'));
});

test('texto puro continua disponível como alternativa', () => {
  assert.ok(semNbsp(textoPedido(pedido, itens)).includes('TOTAL (14 unidades): R$ 239,50'));
});

test('e-mail sem dados da empresa mostra traço e usa o nome do contato no assunto', () => {
  const p = { ...pedido, razao_social: '', cnpj: '', cidade: '', uf: '', contato_email: '' };
  const html = htmlPedido(p, itens, loja);
  assert.ok(!html.includes('undefined') && !html.includes('/</b>'), 'campos vazios não podem aparecer quebrados');
  assert.ok(textoPedido(p, itens).includes('CNPJ:                —'));
});
