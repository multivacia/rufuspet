export function brl(valor) {
  return 'R$ ' + Number(valor ?? 0).toFixed(2).replace('.', ',');
}

/** Custo unitário: até 4 casas, no mínimo 2 (R$ 1,50 · R$ 1,234 · R$ 1,2345). */
export function brlCusto(valor) {
  if (valor == null) return '—';
  return 'R$ ' + Number(valor).toFixed(4).replace(/0{1,2}$/, '').replace('.', ',');
}
