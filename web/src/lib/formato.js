export function brl(valor) {
  return 'R$ ' + Number(valor ?? 0).toFixed(2).replace('.', ',');
}
