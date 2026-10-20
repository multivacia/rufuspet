import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkWhatsApp, mensagemLojaParaCliente, mensagemPedidoParaLoja, numeroWhatsApp } from './whatsapp.js';

test('número: acrescenta 55 a DDD + número e aceita já com 55', () => {
  assert.equal(numeroWhatsApp('(11) 97720-7655'), '5511977207655');
  assert.equal(numeroWhatsApp('(11) 4000-0000'), '551140000000');
  assert.equal(numeroWhatsApp('+55 11 97720-7655'), '5511977207655');
  assert.equal(numeroWhatsApp(''), '');
  assert.equal(numeroWhatsApp('123'), '');
});

test('link: codifica o texto e é nulo sem número', () => {
  assert.equal(linkWhatsApp('11977207655', 'Olá & tchau\n*ok*'), 'https://wa.me/5511977207655?text=Ol%C3%A1%20%26%20tchau%0A*ok*');
  assert.equal(linkWhatsApp('11977207655'), 'https://wa.me/5511977207655');
  assert.equal(linkWhatsApp('', 'x'), null);
});

const semNbsp = (s) => s.replace(/ /g, ' ');

test('mensagem do cliente para a loja traz número, itens e total', () => {
  const m = semNbsp(
    mensagemPedidoParaLoja({
      codigo: 'RF-2010-K7Q',
      valorTotal: 113.3,
      empresa: 'Pet Feliz',
      itens: [
        { quantidade: 1, nome: 'Kit 3 rolos', cor: null, precoUnitario: 11.9 },
        { quantidade: 6, nome: 'Pote dobrável', cor: 'Azul', precoUnitario: 16.9 },
      ],
    }),
  );
  assert.match(m, /pedido \*RF-2010-K7Q\*/);
  assert.match(m, /Empresa: Pet Feliz/);
  assert.match(m, /• 6x Pote dobrável \(Azul\) — R\$ 101,40/);
  assert.match(m, /\*Total: R\$ 113,30\*/);
});

test('sem empresa, a mensagem identifica pelo nome', () => {
  const m = mensagemPedidoParaLoja({ codigo: 'RF-2010-K7Q', valorTotal: 10, nome: 'João da Pet' });
  assert.match(m, /Nome: João da Pet/);
  assert.doesNotMatch(m, /Empresa:/);
});

test('mensagem da loja para o cliente usa o primeiro nome', () => {
  const m = semNbsp(mensagemLojaParaCliente({ contato_nome: 'Maria Silva', numero: 'RFS-2026-0001', codigo_publico: 'RF-2010-K7Q', valor_total: '23.80' }, 'Rufus'));
  assert.equal(m, 'Olá, Maria! Aqui é da Rufus. Recebemos o pedido *RF-2010-K7Q* (R$ 23,80) e gostaríamos de combinar frete e pagamento.');
});
