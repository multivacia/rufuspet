// Dados da loja exibidos no site, lidos do arquivo de variáveis web/.env no build (prefixo VITE_).
// Alterou? Rode "npm run build" de novo. Campos vazios não aparecem.
const env = (nome, padrao = '') => (import.meta.env[nome] ?? '').trim() || padrao;

export const loja = {
  nome: env('VITE_LOJA_NOME', 'Rufus'),
  razaoSocial: env('VITE_LOJA_RAZAO_SOCIAL'),
  cnpj: env('VITE_LOJA_CNPJ'),
  telefone: env('VITE_LOJA_TELEFONE'),
  whatsapp: env('VITE_LOJA_WHATSAPP'),
  email: env('VITE_LOJA_EMAIL_CONTATO'),
  endereco: env('VITE_LOJA_ENDERECO'),
  horario: env('VITE_LOJA_HORARIO_ATENDIMENTO'),
  instagram: env('VITE_LOJA_INSTAGRAM'),
};

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

export const somenteDigitos = (v) => String(v ?? '').replace(/\D/g, '');

export function mascaraCnpj(v) {
  return somenteDigitos(v)
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export function mascaraTelefone(v) {
  const d = somenteDigitos(v).slice(0, 11);
  if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}
