import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { pool, withTransaction } from '../db.js';

export const MAX_FOTOS_EXTRAS = 8;
export const MAX_LEGENDA = 60;
export const MAX_BYTES_UPLOAD = 10 * 1024 * 1024;
export const URL_UPLOADS = '/api/uploads';

const LADO_MAXIMO = 1600;
const pastaPadrao = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');

export function pastaUploads() {
  return process.env.UPLOADS_PASTA || pastaPadrao;
}

export class ErroFoto extends Error {
  constructor(mensagem, status = 400, codigo = 'DADOS_INVALIDOS') {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
  }
}

export function urlDoArquivo(arquivo) {
  return `${URL_UPLOADS}/${arquivo}`;
}

function normalizarLegenda(legenda) {
  const texto = String(legenda ?? '').trim();
  if (texto.length > MAX_LEGENDA) throw new ErroFoto(`Legenda deve ter até ${MAX_LEGENDA} caracteres`);
  return texto;
}

// Converte para webp, corrige a rotação, limita o tamanho e descarta metadados (GPS, aparelho).
// Grava com nome aleatório e devolve o nome do arquivo.
async function gravarImagem(buffer) {
  let webp;
  try {
    webp = await sharp(buffer)
      .rotate()
      .resize(LADO_MAXIMO, LADO_MAXIMO, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new ErroFoto('Arquivo não é uma imagem válida');
  }
  await fs.mkdir(pastaUploads(), { recursive: true });
  const arquivo = `${randomUUID()}.webp`;
  await fs.writeFile(path.join(pastaUploads(), arquivo), webp);
  return arquivo;
}

async function apagarArquivo(arquivo) {
  await fs.rm(path.join(pastaUploads(), path.basename(arquivo)), { force: true });
}

async function garantirProduto(chave) {
  const { rows } = await pool.query('SELECT 1 FROM produtos WHERE coalesce(grupo_exibicao, sku) = $1 LIMIT 1', [chave]);
  if (rows.length === 0) throw new ErroFoto('Produto não encontrado', 404, 'NAO_ENCONTRADO');
}

function formatar(row) {
  return { id: row.id, url: urlDoArquivo(row.arquivo), legenda: row.legenda, ordem: row.ordem };
}

export async function listarFotos(chave) {
  const { rows } = await pool.query('SELECT * FROM produto_fotos WHERE chave = $1 ORDER BY ordem, id', [chave]);
  return rows.map(formatar);
}

// Fotos extras de todos os produtos, agrupadas por chave (para o catálogo público).
export async function fotosPorChave() {
  const { rows } = await pool.query('SELECT chave, arquivo, legenda FROM produto_fotos ORDER BY chave, ordem, id');
  const mapa = new Map();
  for (const row of rows) {
    if (!mapa.has(row.chave)) mapa.set(row.chave, []);
    mapa.get(row.chave).push({ url: urlDoArquivo(row.arquivo), legenda: row.legenda });
  }
  return mapa;
}

export async function adicionarFoto(chave, buffer, legendaBruta) {
  const legenda = normalizarLegenda(legendaBruta);
  await garantirProduto(chave);
  const arquivo = await gravarImagem(buffer);
  try {
    return await withTransaction(async (client) => {
      // Serializa envios simultâneos do mesmo produto para o limite valer.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [chave]);
      const { rows: [{ total, proxima }] } = await client.query(
        'SELECT count(*)::int AS total, coalesce(max(ordem), -1) + 1 AS proxima FROM produto_fotos WHERE chave = $1',
        [chave],
      );
      if (total >= MAX_FOTOS_EXTRAS) {
        throw new ErroFoto(`Limite de ${MAX_FOTOS_EXTRAS} fotos extras por produto`, 409, 'LIMITE_FOTOS');
      }
      const { rows } = await client.query(
        'INSERT INTO produto_fotos (chave, arquivo, legenda, ordem) VALUES ($1, $2, $3, $4) RETURNING *',
        [chave, arquivo, legenda, proxima],
      );
      return formatar(rows[0]);
    });
  } catch (err) {
    await apagarArquivo(arquivo);
    throw err;
  }
}

export async function alterarLegenda(id, legendaBruta) {
  const legenda = normalizarLegenda(legendaBruta);
  const { rows } = await pool.query('UPDATE produto_fotos SET legenda = $2 WHERE id = $1 RETURNING *', [id, legenda]);
  if (rows.length === 0) throw new ErroFoto('Foto não encontrada', 404, 'NAO_ENCONTRADO');
  return formatar(rows[0]);
}

// ids na nova ordem; precisa conter exatamente as fotos do produto.
export async function reordenarFotos(chave, ids) {
  if (!Array.isArray(ids) || !ids.every(Number.isInteger)) throw new ErroFoto('Ordem inválida');
  return withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [chave]);
    const { rows } = await client.query('SELECT id FROM produto_fotos WHERE chave = $1', [chave]);
    const atuais = new Set(rows.map((r) => r.id));
    if (ids.length !== atuais.size || new Set(ids).size !== ids.length || !ids.every((id) => atuais.has(id))) {
      throw new ErroFoto('A ordem precisa conter todas as fotos do produto');
    }
    for (const [ordem, id] of ids.entries()) {
      await client.query('UPDATE produto_fotos SET ordem = $2 WHERE id = $1', [id, ordem]);
    }
    const { rows: fotos } = await client.query('SELECT * FROM produto_fotos WHERE chave = $1 ORDER BY ordem, id', [chave]);
    return fotos.map(formatar);
  });
}

export async function excluirFoto(id) {
  const { rows } = await pool.query('DELETE FROM produto_fotos WHERE id = $1 RETURNING arquivo', [id]);
  if (rows.length === 0) throw new ErroFoto('Foto não encontrada', 404, 'NAO_ENCONTRADO');
  await apagarArquivo(rows[0].arquivo);
}

// Troca a foto principal de um SKU (cor). O arquivo anterior não é apagado:
// pedidos antigos guardam o caminho em imagem_snapshot.
export async function trocarFotoPrincipal(sku, buffer) {
  const { rows: existe } = await pool.query('SELECT 1 FROM produtos WHERE sku = $1', [sku]);
  if (existe.length === 0) throw new ErroFoto('Produto não encontrado', 404, 'NAO_ENCONTRADO');
  const arquivo = await gravarImagem(buffer);
  const { rows } = await pool.query(
    'UPDATE produtos SET imagem = $2, atualizado_em = now() WHERE sku = $1 RETURNING *',
    [sku, urlDoArquivo(arquivo)],
  );
  return rows[0];
}
