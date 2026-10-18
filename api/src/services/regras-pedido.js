// Validações e cálculos do pedido, sem acesso ao banco (testáveis isoladamente).

export class ErroPedido extends Error {
  constructor(status, codigo, mensagem, campo) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.campo = campo;
  }
}

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

export const QUANTIDADE_MAXIMA = 9999;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function somenteDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

export function cnpjValido(valor) {
  const cnpj = somenteDigitos(valor);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const digito = (base) => {
    let soma = 0;
    let peso = base.length - 7;
    for (const c of base) {
      soma += Number(c) * peso--;
      if (peso < 2) peso = 9;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = digito(cnpj.slice(0, 12));
  const d2 = digito(cnpj.slice(0, 12) + d1);
  return cnpj.endsWith(`${d1}${d2}`);
}

export function formatarCnpj(valor) {
  return somenteDigitos(valor).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function invalido(mensagem, campo) {
  return new ErroPedido(400, 'DADOS_INVALIDOS', mensagem, campo);
}

// Texto de uma linha: sem quebras/controle (protege o TXT e cabeçalhos de e-mail).
function texto(valor, { min, max, mensagem, campo }) {
  if (valor != null && typeof valor !== 'string') throw invalido(mensagem, campo);
  const limpo = String(valor ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  if (limpo.length < min || limpo.length > max) throw invalido(mensagem, campo);
  return limpo;
}

export function validarCliente(cliente) {
  if (!cliente || typeof cliente !== 'object') throw invalido('Dados da empresa são obrigatórios', 'cliente');
  const razaoSocial = texto(cliente.razaoSocial, { min: 2, max: 150, mensagem: 'Informe a razão social', campo: 'cliente.razaoSocial' });
  const nomeFantasia = texto(cliente.nomeFantasia, { min: 0, max: 150, mensagem: 'Nome fantasia muito longo', campo: 'cliente.nomeFantasia' });
  const cnpj = somenteDigitos(texto(cliente.cnpj, { min: 1, max: 20, mensagem: 'CNPJ inválido', campo: 'cliente.cnpj' }));
  if (!cnpjValido(cnpj)) throw invalido('CNPJ inválido', 'cliente.cnpj');
  const cidade = texto(cliente.cidade, { min: 2, max: 100, mensagem: 'Informe a cidade', campo: 'cliente.cidade' });
  const uf = texto(cliente.uf, { min: 2, max: 2, mensagem: 'Selecione a UF', campo: 'cliente.uf' }).toUpperCase();
  if (!UFS.includes(uf)) throw invalido('Selecione a UF', 'cliente.uf');
  return { razaoSocial, nomeFantasia, cnpj, cidade, uf };
}

export function validarContato(contato) {
  if (!contato || typeof contato !== 'object') throw invalido('Contato é obrigatório', 'contato');
  const nome = texto(contato.nome, { min: 3, max: 100, mensagem: 'Nome deve ter pelo menos 3 caracteres', campo: 'contato.nome' });
  const email = texto(contato.email, { min: 3, max: 150, mensagem: 'E-mail inválido', campo: 'contato.email' });
  if (!EMAIL_REGEX.test(email)) throw invalido('E-mail inválido', 'contato.email');
  const whatsapp = somenteDigitos(contato.whatsapp);
  if (whatsapp.length < 10 || whatsapp.length > 13) throw invalido('WhatsApp inválido', 'contato.whatsapp');
  if (!['whatsapp', 'email'].includes(contato.canalPreferido)) {
    throw invalido('Escolha como prefere ser contatado', 'contato.canalPreferido');
  }
  return { nome, email, whatsapp, canalPreferido: contato.canalPreferido };
}

export function validarObservacoes(valor) {
  if (valor == null) return '';
  if (typeof valor !== 'string' || valor.length > 1000) throw invalido('Observações muito longas', 'observacoes');
  // Observações podem ter várias linhas.
  return valor.replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').trim();
}

/** Valida os itens e agrupa SKUs repetidos. */
export function validarItens(itens) {
  if (!Array.isArray(itens) || itens.length === 0) throw invalido('O pedido está vazio', 'itens');
  if (itens.length > 50) throw invalido('Itens demais no pedido', 'itens');
  const porSku = new Map();
  for (const item of itens) {
    const sku = String(item?.sku ?? '').trim();
    const quantidade = item?.quantidade;
    if (!sku || !Number.isInteger(quantidade) || quantidade <= 0 || quantidade > QUANTIDADE_MAXIMA) {
      throw invalido(`Item inválido: informe sku e quantidade (1 a ${QUANTIDADE_MAXIMA})`, 'itens');
    }
    porSku.set(sku, (porSku.get(sku) ?? 0) + quantidade);
  }
  for (const [sku, quantidade] of porSku) {
    if (quantidade > QUANTIDADE_MAXIMA) throw invalido(`Quantidade de ${sku} acima de ${QUANTIDADE_MAXIMA}`, 'itens');
  }
  return [...porSku].map(([sku, quantidade]) => ({ sku, quantidade }));
}

/** Total em reais, calculado em centavos para não acumular erro de ponto flutuante. */
export function calcularTotal(linhas) {
  const centavos = linhas.reduce((soma, l) => soma + Math.round(Number(l.precoUnitario) * 100) * l.quantidade, 0);
  return centavos / 100;
}
