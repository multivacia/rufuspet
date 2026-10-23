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

// Código público do pedido (RF-DDMM-XXX). Mesmo alfabeto da migration 007: sem 0/O, 1/I/L, 2/Z, 5/S.
export const ALFABETO_CODIGO = 'ABCDEFGHJKMNPQRTUVWXY346789';
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export function cpfValido(valor) {
  const cpf = somenteDigitos(valor);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  const digito = (base) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = digito(cpf.slice(0, 9));
  const d2 = digito(cpf.slice(0, 9) + d1);
  return cpf.endsWith(`${d1}${d2}`);
}

/** Documento do cliente: CPF (11 dígitos) ou CNPJ (14 dígitos). */
export function documentoValido(valor) {
  const d = somenteDigitos(valor);
  return d.length === 11 ? cpfValido(d) : cnpjValido(d);
}

export function formatarDocumento(valor) {
  const d = somenteDigitos(valor);
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return formatarCnpj(d);
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

/**
 * Dados da empresa: todos opcionais (o vendedor completa no contato). Se vierem preenchidos,
 * são validados (CNPJ com dígito verificador, UF da lista).
 */
export function validarCliente(cliente) {
  if (cliente != null && typeof cliente !== 'object') throw invalido('Dados da empresa inválidos', 'cliente');
  const c = cliente ?? {};
  const razaoSocial = texto(c.razaoSocial, { min: 0, max: 150, mensagem: 'Nome/razão social muito longo', campo: 'cliente.razaoSocial' });
  const nomeFantasia = texto(c.nomeFantasia, { min: 0, max: 150, mensagem: 'Nome fantasia muito longo', campo: 'cliente.nomeFantasia' });
  // Campo "cnpj" guarda CPF (pessoa física) ou CNPJ, só dígitos.
  const cnpj = somenteDigitos(texto(c.cnpj, { min: 0, max: 20, mensagem: 'CPF ou CNPJ inválido', campo: 'cliente.cnpj' }));
  if (cnpj && !documentoValido(cnpj)) throw invalido('CPF ou CNPJ inválido', 'cliente.cnpj');
  const cidade = texto(c.cidade, { min: 0, max: 100, mensagem: 'Cidade muito longa', campo: 'cliente.cidade' });
  const uf = texto(c.uf, { min: 0, max: 2, mensagem: 'Selecione a UF', campo: 'cliente.uf' }).toUpperCase();
  if (uf && !UFS.includes(uf)) throw invalido('Selecione a UF', 'cliente.uf');
  return { razaoSocial, nomeFantasia, cnpj, cidade, uf };
}

/**
 * Obrigatórios: nome e pelo menos um contato (WhatsApp ou e-mail). Se o canal preferido escolhido
 * não foi informado, usa o outro.
 */
export function validarContato(contato) {
  if (!contato || typeof contato !== 'object') throw invalido('Contato é obrigatório', 'contato');
  const nome = texto(contato.nome, { min: 3, max: 100, mensagem: 'Nome deve ter pelo menos 3 caracteres', campo: 'contato.nome' });
  const email = texto(contato.email, { min: 0, max: 150, mensagem: 'E-mail inválido', campo: 'contato.email' });
  if (email && !EMAIL_REGEX.test(email)) throw invalido('E-mail inválido', 'contato.email');
  const whatsapp = somenteDigitos(contato.whatsapp);
  if (whatsapp && (whatsapp.length < 10 || whatsapp.length > 13)) throw invalido('WhatsApp inválido', 'contato.whatsapp');
  if (!email && !whatsapp) throw invalido('Informe um WhatsApp ou e-mail para contato', 'contato.whatsapp');
  if (!['whatsapp', 'email'].includes(contato.canalPreferido)) {
    throw invalido('Escolha como prefere ser contatado', 'contato.canalPreferido');
  }
  let canalPreferido = contato.canalPreferido;
  if (canalPreferido === 'whatsapp' && !whatsapp) canalPreferido = 'email';
  if (canalPreferido === 'email' && !email) canalPreferido = 'whatsapp';
  return { nome, email, whatsapp, canalPreferido };
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

/** Gera RF-DDMM-XXX com a data no fuso informado. `sortear(n)` devolve inteiro em [0, n). */
export function gerarCodigoPublico(data, sortear, fuso = 'America/Sao_Paulo') {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, day: '2-digit', month: '2-digit' })
      .formatToParts(data)
      .map((p) => [p.type, p.value]),
  );
  let sufixo = '';
  for (let i = 0; i < 3; i++) sufixo += ALFABETO_CODIGO[sortear(ALFABETO_CODIGO.length)];
  return `RF-${partes.day}${partes.month}-${sufixo}`;
}

/** "rf 2010 k7q", "RF2010K7Q" → "RF2010K7Q" (para comparar ignorando hífen, espaço e caixa). */
export function normalizarCodigo(valor) {
  return String(valor ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
