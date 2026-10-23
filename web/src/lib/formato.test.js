import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brl, brlCusto } from './formato.js';

test('brlCusto mostra de 2 a 4 casas', () => {
  assert.equal(brlCusto(1.5), 'R$ 1,50');
  assert.equal(brlCusto('2.2500'), 'R$ 2,25');
  assert.equal(brlCusto(1.234), 'R$ 1,234');
  assert.equal(brlCusto(1.2345), 'R$ 1,2345');
  assert.equal(brlCusto(0), 'R$ 0,00');
  assert.equal(brlCusto(null), '—');
  assert.equal(brl(35), 'R$ 35,00');
});
