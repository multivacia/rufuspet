import fs from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { pool } from '../db.js';
import { formatarCnpj } from './regras-pedido.js';

// Depois do commit do pedido: grava o TXT do pedido e envia as notificações por e-mail
// (se houver SMTP configurado). WhatsApp ainda não tem envio: as notificações desse canal
// ficam "pendente" na tabela notificacoes.

const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function formatarWhatsapp(digitos) {
  const d = String(digitos).replace(/^55(?=\d{10,11}$)/, '');
  return d.length === 11 ? d.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3') : d.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
}

export function textoPedido(pedido, itens) {
  const fuso = process.env.FUSO_HORARIO || 'America/Sao_Paulo';
  const data = new Date(pedido.criado_em).toLocaleString('pt-BR', { timeZone: fuso, dateStyle: 'short', timeStyle: 'short' });
  const sep = '='.repeat(60);
  const sub = '-'.repeat(60);
  const unidades = itens.reduce((s, i) => s + i.quantidade, 0);
  const campos = [
    ['Razão social', pedido.razao_social],
    ['Nome fantasia', pedido.nome_fantasia || '—'],
    ['CNPJ', formatarCnpj(pedido.cnpj)],
    ['Cidade/UF', `${pedido.cidade}/${pedido.uf}`],
    ['Responsável', pedido.contato_nome],
    ['WhatsApp', formatarWhatsapp(pedido.contato_whatsapp)],
    ['E-mail', pedido.contato_email],
    ['Prefere contato por', pedido.canal_preferido === 'email' ? 'E-mail' : 'WhatsApp'],
  ];
  const linhasItens = itens.map(
    (i) =>
      `${String(i.quantidade).padStart(4)}x  ${i.nome_snapshot}${i.cor_snapshot ? ` — ${i.cor_snapshot}` : ''}  [${i.sku}]\n` +
      `       ${brl(i.preco_unitario_snapshot)}/un.  =  ${brl(i.valor_item)}`,
  );
  return [
    sep,
    `PEDIDO ${pedido.numero}`,
    `Recebido em: ${data}`,
    sep,
    '',
    'CLIENTE',
    sub,
    ...campos.map(([k, v]) => `${`${k}:`.padEnd(21)}${v}`),
    '',
    'ITENS',
    sub,
    ...linhasItens,
    sub,
    `TOTAL (${unidades} ${unidades === 1 ? 'unidade' : 'unidades'}): ${brl(pedido.valor_total)}`,
    '',
    'OBSERVAÇÕES',
    sub,
    pedido.observacoes || '—',
    '',
  ].join('\n');
}

async function carregarPedido(pedidoId) {
  const { rows: pedidos } = await pool.query('SELECT * FROM pedidos WHERE id = $1', [pedidoId]);
  const { rows: itens } = await pool.query('SELECT * FROM pedido_itens WHERE pedido_id = $1 ORDER BY id', [pedidoId]);
  return { pedido: pedidos[0], itens };
}

export async function gravarTxt(pedido, itens) {
  const pasta = process.env.PEDIDOS_PASTA || path.resolve('pedidos');
  await fs.mkdir(pasta, { recursive: true, mode: 0o750 });
  const arquivo = path.join(pasta, `${pedido.numero}.txt`);
  await fs.writeFile(arquivo, textoPedido(pedido, itens), { encoding: 'utf8', flag: 'wx' }).catch((err) => {
    if (err.code !== 'EEXIST') throw err; // pedido reaproveitado (idempotência): TXT já existe
  });
  return arquivo;
}

function criarTransporte() {
  if (!process.env.SMTP_HOST) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

function montarEmail(notificacao, pedido, texto) {
  const loja = process.env.LOJA_NOME || 'Rufus';
  if (notificacao.tipo === 'interno') {
    return {
      replyTo: pedido.contato_email,
      subject: `Novo pedido ${pedido.numero} — ${pedido.nome_fantasia || pedido.razao_social} (${brl(pedido.valor_total)})`,
      text: `Novo pedido recebido pelo site.\n\n${texto}`,
    };
  }
  return {
    subject: `${loja}: recebemos seu pedido ${pedido.numero}`,
    text:
      `Olá, ${pedido.contato_nome}!\n\nRecebemos seu pedido. Em breve entraremos em contato para combinar ` +
      `frete e forma de pagamento.\n\n${texto}\n${loja}\n`,
  };
}

async function enviarEmails(pedido, texto) {
  const transporte = criarTransporte();
  if (!transporte) return;
  const { rows: pendentes } = await pool.query(
    `SELECT * FROM notificacoes WHERE pedido_id = $1 AND canal = 'email' AND status IN ('pendente', 'falhou') ORDER BY id`,
    [pedido.id],
  );
  for (const n of pendentes) {
    try {
      await transporte.sendMail({ from: process.env.EMAIL_REMETENTE || process.env.SMTP_USER, to: n.destino, ...montarEmail(n, pedido, texto) });
      await pool.query(
        `UPDATE notificacoes SET status = 'enviado', tentativas = tentativas + 1, enviado_em = now(), ultimo_erro = NULL WHERE id = $1`,
        [n.id],
      );
    } catch (err) {
      await pool.query(
        `UPDATE notificacoes SET status = 'falhou', tentativas = tentativas + 1, ultimo_erro = $2 WHERE id = $1`,
        [n.id, String(err.message).slice(0, 500)],
      );
      console.error(`notificacao ${n.id} (pedido ${pedido.numero}) falhou:`, err.message);
    }
  }
}

/** Grava o TXT e dispara os e-mails. Erros são registrados e não afetam o pedido já salvo. */
export async function processarPedido(pedidoId) {
  const { pedido, itens } = await carregarPedido(pedidoId);
  if (!pedido) return;
  const texto = textoPedido(pedido, itens);
  try {
    await gravarTxt(pedido, itens);
  } catch (err) {
    console.error(`falha ao gravar TXT do pedido ${pedido.numero}:`, err);
  }
  await enviarEmails(pedido, texto);
}
