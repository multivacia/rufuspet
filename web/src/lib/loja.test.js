import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mascaraDocumento } from './loja.js';

test('máscara: CPF até 11 dígitos, CNPJ a partir do 12º', () => {
  assert.equal(mascaraDocumento('529'), '529');
  assert.equal(mascaraDocumento('5299822'), '529.982.2');
  assert.equal(mascaraDocumento('52998224725'), '529.982.247-25');
  assert.equal(mascaraDocumento('112223330001'), '11.222.333/0001');
  assert.equal(mascaraDocumento('11222333000181'), '11.222.333/0001-81');
  assert.equal(mascaraDocumento('11.222.333/0001-8199'), '11.222.333/0001-81');
});
