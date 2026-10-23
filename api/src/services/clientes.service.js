// Cadastro de clientes (admin). Histórico de compras = pedidos confirmados/faturados vinculados.
// Ver migrations/010_clientes.sql.
import { pool } from '../db.js';
import { EMAIL_REGEX, UFS, documentoValido, somenteDigitos } from './regras-pedido.js';
import { custoDosPedidos } from './estoque.service.js';

export class ErroCliente extends Error {
  constructor(mensagem, { campo, status = 400, codigo = 'DADOS_INVALIDOS' } = {}) {
    super(mensagem);
    this.campo = campo;
    this.status = status;
    this.codigo = codigo;
  }
}

export const STATUS_DE_COMPRA = ['confirmado', 'faturado'];

/** WhatsApp só com dígitos e sem o 55 do Brasil, para comparar números digitados de jeitos diferentes. */
export function normalizarWhatsapp(valor) {
  const d = somenteDigitos(valor);
  return d.length >= 12 && d.startsWith('55') ? d.slice(2) : d;
}

function texto(bruto, max, campo, rotulo) {
  const t = String(bruto ?? '').trim().replace(/\s+/g, ' ');
  if (t.length > max) throw new ErroCliente(`${rotulo} muito longo (máx. ${max})`, { campo });
  return t;
}

/** Valida o cadastro completo (criar e editar usam o mesmo formulário). */
export function lerCliente(body) {
  const b = body ?? {};
  const nome = texto(b.nome, 150, 'nome', 'Nome/razão social');
  if (!nome) throw new ErroCliente('Informe o nome ou a razão social', { campo: 'nome' });

  const documento = somenteDigitos(b.documento);
  if (documento && !documentoValido(documento)) throw new ErroCliente('CPF ou CNPJ inválido', { campo: 'documento' });
  let tipo = b.tipo === 'PF' ? 'PF' : 'PJ';
  if (documento.length === 11) tipo = 'PF';
  if (documento.length === 14) tipo = 'PJ';

  const whatsapp = normalizarWhatsapp(b.whatsapp);
  if (whatsapp && (whatsapp.length < 10 || whatsapp.length > 11)) throw new ErroCliente('WhatsApp inválido', { campo: 'whatsapp' });

  const email = texto(b.email, 150, 'email', 'E-mail').toLowerCase();
  if (email && !EMAIL_REGEX.test(email)) throw new ErroCliente('E-mail inválido', { campo: 'email' });

  const uf = texto(b.uf, 2, 'uf', 'UF').toUpperCase();
  if (uf && !UFS.includes(uf)) throw new ErroCliente('UF inválida', { campo: 'uf' });

  if (b.ativo !== undefined && typeof b.ativo !== 'boolean') throw new ErroCliente('ativo deve ser verdadeiro ou falso', { campo: 'ativo' });

  return {
    tipo,
    nome,
    nome_fantasia: texto(b.nomeFantasia, 150, 'nomeFantasia', 'Nome fantasia'),
    documento,
    inscricao_estadual: texto(b.inscricaoEstadual, 20, 'inscricaoEstadual', 'Inscrição estadual').toUpperCase(),
    comprador: texto(b.comprador, 100, 'comprador', 'Comprador'),
    whatsapp,
    email,
    cidade: texto(b.cidade, 100, 'cidade', 'Cidade'),
    uf,
    endereco: texto(b.endereco, 300, 'endereco', 'Endereço'),
    vendedor: texto(b.vendedor, 80, 'vendedor', 'Vendedor'),
    observacoes: String(b.observacoes ?? '').trim().slice(0, 1000),
    ativo: b.ativo ?? true,
  };
}

export function paraApi(c) {
  return {
    id: c.id,
    tipo: c.tipo,
    nome: c.nome,
    nomeFantasia: c.nome_fantasia,
    documento: c.documento,
    inscricaoEstadual: c.inscricao_estadual,
    comprador: c.comprador,
    whatsapp: c.whatsapp,
    email: c.email,
    cidade: c.cidade,
    uf: c.uf,
    endereco: c.endereco,
    vendedor: c.vendedor,
    observacoes: c.observacoes,
    ativo: c.ativo,
    criadoEm: c.criado_em,
    atualizadoEm: c.atualizado_em,
  };
}

async function erroDocumentoDuplicado(err, documento) {
  if (err.code === '23505' && err.constraint === 'clientes_documento_key') {
    const { rows } = await pool.query('SELECT id, nome FROM clientes WHERE documento = $1', [documento]);
    return new ErroCliente(`Já existe cliente com este CPF/CNPJ: ${rows[0]?.nome ?? ''}`, {
      campo: 'documento',
      status: 409,
      codigo: 'DOCUMENTO_DUPLICADO',
    });
  }
  return err;
}

const COLUNAS = Object.keys(lerCliente({ nome: 'x' }));

export async function criarCliente(body) {
  const dados = lerCliente(body);
  try {
    const { rows } = await pool.query(
      `INSERT INTO clientes (${COLUNAS.join(', ')}) VALUES (${COLUNAS.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
      COLUNAS.map((c) => dados[c]),
    );
    return paraApi(rows[0]);
  } catch (err) {
    throw await erroDocumentoDuplicado(err, dados.documento);
  }
}

export async function atualizarCliente(id, body) {
  const dados = lerCliente(body);
  try {
    const { rows } = await pool.query(
      `UPDATE clientes SET ${COLUNAS.map((c, i) => `${c} = $${i + 2}`).join(', ')}, atualizado_em = now()
        WHERE id = $1 RETURNING *`,
      [id, ...COLUNAS.map((c) => dados[c])],
    );
    return rows[0] ? paraApi(rows[0]) : null;
  } catch (err) {
    throw await erroDocumentoDuplicado(err, dados.documento);
  }
}

/** Lista com busca e resumo de compras (só pedidos confirmados/faturados contam como compra). */
export async function listarClientes({ busca = '', pagina = 1, porPagina = 30 } = {}) {
  const termo = String(busca).trim().slice(0, 100);
  const params = [porPagina, (pagina - 1) * porPagina];
  let filtro = '';
  if (termo) {
    params.push(termo.replace(/[%_\\]/g, '\\$&'), somenteDigitos(termo) || '#');
    filtro = `WHERE c.nome ILIKE '%' || $3 || '%' OR c.nome_fantasia ILIKE '%' || $3 || '%'
                 OR c.comprador ILIKE '%' || $3 || '%' OR c.vendedor ILIKE '%' || $3 || '%'
                 OR c.cidade ILIKE '%' || $3 || '%' OR c.email ILIKE '%' || $3 || '%'
                 OR c.documento LIKE '%' || $4 || '%' OR c.whatsapp LIKE '%' || $4 || '%'`;
  }
  const { rows } = await pool.query(
    `SELECT c.*,
            count(p.id) FILTER (WHERE p.status = ANY('{confirmado,faturado}'))::int AS compras,
            COALESCE(sum(p.valor_total) FILTER (WHERE p.status = ANY('{confirmado,faturado}')), 0) AS total_comprado,
            max(p.criado_em) FILTER (WHERE p.status = ANY('{confirmado,faturado}')) AS ultima_compra,
            count(*) OVER () AS total_linhas
       FROM clientes c
       LEFT JOIN pedidos p ON p.cliente_id = c.id
      ${filtro}
      GROUP BY c.id
      ORDER BY c.ativo DESC, max(p.criado_em) FILTER (WHERE p.status = ANY('{confirmado,faturado}')) DESC NULLS LAST, c.nome
      LIMIT $1 OFFSET $2`,
    params,
  );
  return {
    total: Number(rows[0]?.total_linhas ?? 0),
    pagina,
    porPagina,
    clientes: rows.map((r) => ({
      ...paraApi(r),
      compras: r.compras,
      totalComprado: Number(r.total_comprado),
      ultimaCompra: r.ultima_compra,
    })),
  };
}

/** Ficha: cadastro + todos os pedidos vinculados (com custo/margem dos que tiveram baixa) + resumo das compras. */
export async function buscarCliente(id) {
  const { rows } = await pool.query('SELECT * FROM clientes WHERE id = $1', [id]);
  if (!rows[0]) return null;
  const { rows: pedidos } = await pool.query(
    `SELECT p.id, p.numero, p.codigo_publico, p.status, p.valor_total, p.criado_em, p.vendedor, p.origem,
            p.estoque_baixado_em,
            (SELECT json_agg(json_build_object('sku', i.sku, 'nome', i.nome_snapshot, 'cor', i.cor_snapshot,
                                               'quantidade', i.quantidade, 'precoUnitario', i.preco_unitario_snapshot)
                             ORDER BY i.id)
               FROM pedido_itens i WHERE i.pedido_id = p.id) AS itens
       FROM pedidos p WHERE p.cliente_id = $1
      ORDER BY p.criado_em DESC`,
    [id],
  );
  const custos = await custoDosPedidos(pedidos.filter((p) => p.estoque_baixado_em).map((p) => p.id));
  const lista = pedidos.map((p) => {
    const custo = custos.get(p.id) ?? null;
    return {
      id: p.id,
      numero: p.numero,
      codigo: p.codigo_publico,
      status: p.status,
      origem: p.origem,
      vendedor: p.vendedor,
      criadoEm: p.criado_em,
      valorTotal: Number(p.valor_total),
      custo,
      margem: custo == null ? null : Number((Number(p.valor_total) - custo).toFixed(2)),
      itens: (p.itens ?? []).map((i) => ({ ...i, precoUnitario: Number(i.precoUnitario) })),
    };
  });
  const compras = lista.filter((p) => STATUS_DE_COMPRA.includes(p.status));
  const soma = (f) => Number(compras.reduce((s, p) => s + (f(p) ?? 0), 0).toFixed(2));
  return {
    cliente: paraApi(rows[0]),
    resumo: {
      compras: compras.length,
      totalComprado: soma((p) => p.valorTotal),
      custo: soma((p) => p.custo),
      margem: soma((p) => p.margem),
      ultimaCompra: compras[0]?.criadoEm ?? null,
    },
    pedidos: lista,
  };
}

/** Clientes que batem com os dados de uma solicitação: CPF/CNPJ, WhatsApp ou e-mail. */
export async function sugerirClientesParaPedido(pedidoId) {
  const { rows } = await pool.query('SELECT cnpj, contato_whatsapp, contato_email FROM pedidos WHERE id = $1', [pedidoId]);
  if (!rows[0]) return null;
  const doc = somenteDigitos(rows[0].cnpj);
  const zap = normalizarWhatsapp(rows[0].contato_whatsapp);
  const email = String(rows[0].contato_email ?? '').trim().toLowerCase();
  const { rows: achados } = await pool.query(
    `SELECT c.*,
            array_remove(ARRAY[
              CASE WHEN $1 <> '' AND c.documento = $1 THEN 'CPF/CNPJ' END,
              CASE WHEN $2 <> '' AND c.whatsapp = $2 THEN 'WhatsApp' END,
              CASE WHEN $3 <> '' AND lower(c.email) = $3 THEN 'e-mail' END
            ], NULL) AS motivos
       FROM clientes c
      WHERE ($1 <> '' AND c.documento = $1) OR ($2 <> '' AND c.whatsapp = $2) OR ($3 <> '' AND lower(c.email) = $3)
      ORDER BY (c.documento = $1) DESC, c.nome
      LIMIT 10`,
    [doc, zap, email],
  );
  return achados.map((c) => ({ ...paraApi(c), motivos: c.motivos }));
}

/** Nomes de vendedores já usados (clientes e pedidos), para sugestão. */
export async function listarVendedores() {
  const { rows } = await pool.query(
    `SELECT vendedor FROM (
       SELECT vendedor FROM clientes WHERE vendedor <> ''
       UNION SELECT vendedor FROM pedidos WHERE vendedor <> ''
     ) v ORDER BY vendedor`,
  );
  return rows.map((r) => r.vendedor);
}
