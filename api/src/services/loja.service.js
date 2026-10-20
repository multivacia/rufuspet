import { pool } from '../db.js';
import { cnpjValido } from './regras-pedido.js';

// Campos editáveis pelo admin: nome na API (camelCase) → coluna, tamanho máximo.
const CAMPOS = {
  nome: ['nome', 80],
  razaoSocial: ['razao_social', 150],
  cnpj: ['cnpj', 20],
  telefone: ['telefone', 30],
  whatsapp: ['whatsapp', 30],
  emailContato: ['email_contato', 150],
  endereco: ['endereco', 200],
  horario: ['horario', 100],
  instagram: ['instagram', 60],
  emailsInternos: ['emails_internos', 500],
};

// Campos que só o admin vê (não vão para GET /api/loja).
const CAMPOS_PRIVADOS = new Set(['emailsInternos']);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "a@x.com; b@y.com\n" → ['a@x.com', 'b@y.com'] */
export function separarEmails(valor) {
  return String(valor ?? '')
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter(Boolean);
}

export class ErroLoja extends Error {
  constructor(mensagem, campo) {
    super(mensagem);
    this.campo = campo;
  }
}

function paraApi(row, { incluirPrivados = false } = {}) {
  const dados = {};
  for (const [campoApi, [coluna]] of Object.entries(CAMPOS)) {
    if (CAMPOS_PRIVADOS.has(campoApi) && !incluirPrivados) continue;
    dados[campoApi] = row?.[coluna] ?? '';
  }
  if (!dados.nome) dados.nome = 'Rufus';
  dados.pedidoMinimo = Number(row?.pedido_minimo ?? 0);
  return dados;
}

/** Valor mínimo do pedido em reais (0 = sem mínimo). */
export async function pedidoMinimo(client = pool) {
  const { rows } = await client.query('SELECT pedido_minimo FROM loja_config WHERE id = 1');
  return Number(rows[0]?.pedido_minimo ?? 0);
}

/** Aceita 150, "150", "150,00" ou "1.500,50"; devolve reais com 2 casas, ou lança ErroLoja. */
function lerValorReais(bruto, campo) {
  let texto = typeof bruto === 'number' ? String(bruto) : String(bruto ?? '').trim();
  if (texto.includes(',')) texto = texto.replace(/\./g, '').replace(',', '.');
  if (texto === '') texto = '0';
  if (!/^\d+(\.\d{1,2})?$/.test(texto)) throw new ErroLoja('Valor inválido (ex.: 150,00)', campo);
  const valor = Number(texto);
  if (valor > 1000000) throw new ErroLoja('Valor muito alto', campo);
  return valor.toFixed(2);
}

export async function buscarLoja({ incluirPrivados = false } = {}) {
  const { rows } = await pool.query('SELECT * FROM loja_config WHERE id = 1');
  return paraApi(rows[0], { incluirPrivados });
}

/** Quem recebe o aviso de novo pedido: o que está no admin; se vazio, EMAILS_INTERNOS do .env. */
export async function destinatariosInternos(client = pool) {
  const { rows } = await client.query('SELECT emails_internos FROM loja_config WHERE id = 1');
  const doAdmin = separarEmails(rows[0]?.emails_internos);
  return doAdmin.length ? doAdmin : separarEmails(process.env.EMAILS_INTERNOS);
}

/** Atualiza só os campos enviados. Texto de uma linha, sem caracteres de controle. */
export async function atualizarLoja(body) {
  const sets = [];
  const valores = [];
  for (const [campoApi, [coluna, max]] of Object.entries(CAMPOS)) {
    if (!Object.prototype.hasOwnProperty.call(body ?? {}, campoApi)) continue;
    const bruto = body[campoApi];
    if (bruto != null && typeof bruto !== 'string') throw new ErroLoja('Valor inválido', campoApi);
    const valor = String(bruto ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
    if (valor.length > max) throw new ErroLoja(`Máximo de ${max} caracteres`, campoApi);
    if (campoApi === 'nome' && !valor) throw new ErroLoja('Informe o nome da loja', campoApi);
    if (campoApi === 'cnpj' && valor && !cnpjValido(valor)) throw new ErroLoja('CNPJ inválido', campoApi);
    if (campoApi === 'emailContato' && valor && !EMAIL_REGEX.test(valor)) {
      throw new ErroLoja('E-mail inválido', campoApi);
    }
    let gravar = valor;
    if (campoApi === 'emailsInternos') {
      const lista = separarEmails(valor);
      const invalido = lista.find((e) => !EMAIL_REGEX.test(e));
      if (invalido) throw new ErroLoja(`E-mail inválido: ${invalido}`, campoApi);
      if (lista.length > 10) throw new ErroLoja('Máximo de 10 e-mails', campoApi);
      gravar = [...new Set(lista.map((e) => e.toLowerCase()))].join(', ');
    }
    valores.push(gravar);
    sets.push(`${coluna} = $${valores.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, 'pedidoMinimo')) {
    valores.push(lerValorReais(body.pedidoMinimo, 'pedidoMinimo'));
    sets.push(`pedido_minimo = $${valores.length}`);
  }
  if (sets.length === 0) throw new ErroLoja('Nenhum campo informado');
  const { rows } = await pool.query(
    `UPDATE loja_config SET ${sets.join(', ')}, atualizado_em = now() WHERE id = 1 RETURNING *`,
    valores,
  );
  return paraApi(rows[0], { incluirPrivados: true });
}
