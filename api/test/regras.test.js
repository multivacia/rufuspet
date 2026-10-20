import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ErroPedido,
  calcularTotal,
  cnpjValido,
  validarCliente,
  validarContato,
  validarItens,
  validarObservacoes,
} from '../src/services/regras-pedido.js';

const cliente = { razaoSocial: 'Pet Shop Exemplo Ltda', nomeFantasia: '', cnpj: '11.222.333/0001-81', cidade: 'Campinas', uf: 'sp' };
const contato = { nome: 'Maria', email: 'maria@exemplo.com', whatsapp: '(11) 98765-4321', canalPreferido: 'whatsapp' };

function campoDoErro(fn) {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof ErroPedido);
    return err.campo;
  }
  assert.fail('esperava ErroPedido');
}

test('CNPJ: aceita válido com e sem máscara, recusa dígito errado, curto e repetido', () => {
  assert.equal(cnpjValido('11.222.333/0001-81'), true);
  assert.equal(cnpjValido('11222333000181'), true);
  assert.equal(cnpjValido('11.222.333/0001-82'), false);
  assert.equal(cnpjValido('1122233300018'), false);
  assert.equal(cnpjValido('00000000000000'), false);
});

test('cliente válido é normalizado (CNPJ só dígitos, UF maiúscula)', () => {
  assert.deepEqual(validarCliente(cliente), {
    razaoSocial: 'Pet Shop Exemplo Ltda', nomeFantasia: '', cnpj: '11222333000181', cidade: 'Campinas', uf: 'SP',
  });
});

test('cliente inválido aponta o campo', () => {
  assert.equal(campoDoErro(() => validarCliente({ ...cliente, cnpj: '123' })), 'cliente.cnpj');
  assert.equal(campoDoErro(() => validarCliente({ ...cliente, uf: 'XX' })), 'cliente.uf');
  assert.equal(campoDoErro(() => validarCliente({ ...cliente, razaoSocial: 'x'.repeat(151) })), 'cliente.razaoSocial');
  assert.equal(campoDoErro(() => validarCliente({ ...cliente, cidade: ['x'] })), 'cliente.cidade');
});

test('dados da empresa são opcionais', () => {
  const vazio = { razaoSocial: '', nomeFantasia: '', cnpj: '', cidade: '', uf: '' };
  assert.deepEqual(validarCliente(undefined), vazio);
  assert.deepEqual(validarCliente({}), vazio);
  assert.deepEqual(validarCliente({ razaoSocial: '  ', cnpj: '', uf: '' }), vazio);
  assert.equal(validarCliente({ cidade: 'Campinas' }).cidade, 'Campinas');
});

test('quebra de linha em campo de uma linha vira espaço', () => {
  assert.equal(validarCliente({ ...cliente, razaoSocial: 'Pet\r\nBcc: x@y.com' }).razaoSocial, 'Pet Bcc: x@y.com');
});

test('contato: basta nome e um meio de contato; canal se ajusta ao que foi informado', () => {
  assert.deepEqual(validarContato({ nome: 'Maria', whatsapp: '11987654321', canalPreferido: 'email' }), {
    nome: 'Maria', email: '', whatsapp: '11987654321', canalPreferido: 'whatsapp',
  });
  assert.equal(validarContato({ nome: 'Maria', email: 'm@x.com', canalPreferido: 'whatsapp' }).canalPreferido, 'email');
  assert.equal(campoDoErro(() => validarContato({ nome: 'Maria', canalPreferido: 'whatsapp' })), 'contato.whatsapp');
  assert.equal(campoDoErro(() => validarContato({ nome: 'Ma', whatsapp: '11987654321', canalPreferido: 'whatsapp' })), 'contato.nome');
});

test('contato: valida e-mail, WhatsApp e canal', () => {
  assert.equal(validarContato(contato).whatsapp, '11987654321');
  assert.equal(campoDoErro(() => validarContato({ ...contato, email: 'x' })), 'contato.email');
  assert.equal(campoDoErro(() => validarContato({ ...contato, whatsapp: '123' })), 'contato.whatsapp');
  assert.equal(campoDoErro(() => validarContato({ ...contato, canalPreferido: 'sms' })), 'contato.canalPreferido');
});

test('itens: agrupa SKU repetido e recusa quantidade inválida', () => {
  assert.deepEqual(
    validarItens([{ sku: 'A', quantidade: 2 }, { sku: 'B', quantidade: 1 }, { sku: 'A', quantidade: 3 }]),
    [{ sku: 'A', quantidade: 5 }, { sku: 'B', quantidade: 1 }],
  );
  assert.throws(() => validarItens([]));
  assert.throws(() => validarItens([{ sku: 'A', quantidade: 0 }]));
  assert.throws(() => validarItens([{ sku: 'A', quantidade: '2' }]));
  assert.throws(() => validarItens([{ sku: 'A', quantidade: 1.5 }]));
  assert.throws(() => validarItens([{ sku: 'A', quantidade: 9999 }, { sku: 'A', quantidade: 1 }]));
});

test('observações mantêm quebras de linha e limitam tamanho', () => {
  assert.equal(validarObservacoes('Ligar à tarde\nobrigada'), 'Ligar à tarde\nobrigada');
  assert.equal(validarObservacoes(undefined), '');
  assert.throws(() => validarObservacoes('x'.repeat(1001)));
});

test('total calculado em centavos sem erro de arredondamento', () => {
  assert.equal(calcularTotal([{ precoUnitario: '11.90', quantidade: 3 }, { precoUnitario: '16.90', quantidade: 12 }]), 238.5);
  assert.equal(calcularTotal([{ precoUnitario: '0.10', quantidade: 3 }]), 0.3);
});
