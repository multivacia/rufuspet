export function brl(valor) {
  return 'R$ ' + Number(valor ?? 0).toFixed(2).replace('.', ',');
}

/** Custo unitário: até 4 casas, no mínimo 2 (R$ 1,50 · R$ 1,234 · R$ 1,2345). */
export function brlCusto(valor) {
  if (valor == null) return '—';
  return 'R$ ' + Number(valor).toFixed(4).replace(/0{1,2}$/, '').replace('.', ',');
}

/** CPF (11) ou CNPJ (14) formatado; outro tamanho volta como veio. */
export function formatarDocumento(doc) {
  const d = String(doc ?? '');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  return d;
}

/** Rótulos do ciclo: o que chega do site é solicitação; vira pedido ao confirmar. */
export const ROTULO_STATUS = {
  novo: 'Solicitação',
  confirmado: 'Pedido confirmado',
  faturado: 'Faturado',
  cancelado: 'Cancelado / não convertido',
};

export function dataBr(iso) {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';
}
