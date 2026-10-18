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
};

export class ErroLoja extends Error {
  constructor(mensagem, campo) {
    super(mensagem);
    this.campo = campo;
  }
}

function paraApi(row) {
  const dados = {};
  for (const [campoApi, [coluna]] of Object.entries(CAMPOS)) dados[campoApi] = row?.[coluna] ?? '';
  if (!dados.nome) dados.nome = 'Rufus';
  return dados;
}

export async function buscarLoja() {
  const { rows } = await pool.query('SELECT * FROM loja_config WHERE id = 1');
  return paraApi(rows[0]);
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
    if (campoApi === 'emailContato' && valor && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) {
      throw new ErroLoja('E-mail inválido', campoApi);
    }
    valores.push(valor);
    sets.push(`${coluna} = $${valores.length}`);
  }
  if (sets.length === 0) throw new ErroLoja('Nenhum campo informado');
  const { rows } = await pool.query(
    `UPDATE loja_config SET ${sets.join(', ')}, atualizado_em = now() WHERE id = 1 RETURNING *`,
    valores,
  );
  return paraApi(rows[0]);
}
