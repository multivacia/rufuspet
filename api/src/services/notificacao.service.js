import fs from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { pool } from '../db.js';
import { formatarDocumento } from './regras-pedido.js';
import { buscarLoja } from './loja.service.js';

// Depois do commit do pedido: grava o TXT do pedido e envia as notificações por e-mail
// (se houver SMTP configurado). WhatsApp ainda não tem envio: as notificações desse canal
// ficam "pendente" na tabela notificacoes.

const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function formatarWhatsapp(digitos) {
  const d = String(digitos).replace(/^55(?=\d{10,11}$)/, '');
  return d.length === 11 ? d.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3') : d.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
}

/** TXT/texto do pedido. Para o cliente, só o código público; para a equipe, número interno + código. */
export function textoPedido(pedido, itens, { paraCliente = false } = {}) {
  const fuso = process.env.FUSO_HORARIO || 'America/Sao_Paulo';
  const data = new Date(pedido.criado_em).toLocaleString('pt-BR', { timeZone: fuso, dateStyle: 'short', timeStyle: 'short' });
  const sep = '='.repeat(60);
  const sub = '-'.repeat(60);
  const unidades = itens.reduce((s, i) => s + i.quantidade, 0);
  const campos = [
    ['Nome/Razão social', pedido.razao_social || '—'],
    ['Nome fantasia', pedido.nome_fantasia || '—'],
    ['CPF/CNPJ', formatarDocumento(pedido.cnpj) || '—'],
    ['Cidade/UF', [pedido.cidade, pedido.uf].filter(Boolean).join('/') || '—'],
    ['Responsável', pedido.contato_nome],
    ['WhatsApp', pedido.contato_whatsapp ? formatarWhatsapp(pedido.contato_whatsapp) : '—'],
    ['E-mail', pedido.contato_email || '—'],
    ['Prefere contato por', pedido.canal_preferido === 'email' ? 'E-mail' : 'WhatsApp'],
  ];
  const linhasItens = itens.map(
    (i) =>
      `${String(i.quantidade).padStart(4)}x  ${i.nome_snapshot}${i.cor_snapshot ? ` — ${i.cor_snapshot}` : ''}  [${i.sku}]\n` +
      `       ${brl(i.preco_unitario_snapshot)}/un.  =  ${brl(i.valor_item)}`,
  );
  return [
    sep,
    paraCliente ? `PEDIDO ${pedido.codigo_publico}` : `PEDIDO ${pedido.numero}  (código do cliente: ${pedido.codigo_publico})`,
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

const AZUL = '#0C1F52';
const VERDE = '#5E9124';
const LIMA = '#8CC63F';

function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** E-mail em HTML com estilos inline (o Gmail ignora <style>). */
export function htmlPedido(pedido, itens, loja, { paraCliente = false } = {}) {
  const fuso = process.env.FUSO_HORARIO || 'America/Sao_Paulo';
  const data = new Date(pedido.criado_em).toLocaleString('pt-BR', { timeZone: fuso, dateStyle: 'short', timeStyle: 'short' });
  const unidades = itens.reduce((s, i) => s + i.quantidade, 0);
  const td = 'padding:10px 12px;border-bottom:1px solid #E4E9F2;font-size:14px;';
  const linhaDado = ([rotulo, valor]) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#5B6580;font-size:13px;white-space:nowrap;vertical-align:top">${esc(rotulo)}</td>` +
    `<td style="padding:4px 0;font-size:14px;color:#101A33"><b>${esc(valor)}</b></td></tr>`;

  const cliente = [
    ['Nome/Razão social', pedido.razao_social || '—'],
    ['Nome fantasia', pedido.nome_fantasia || '—'],
    ['CPF/CNPJ', formatarDocumento(pedido.cnpj) || '—'],
    ['Cidade/UF', [pedido.cidade, pedido.uf].filter(Boolean).join('/') || '—'],
    ['Responsável', pedido.contato_nome],
    ['WhatsApp', pedido.contato_whatsapp ? formatarWhatsapp(pedido.contato_whatsapp) : '—'],
    ['E-mail', pedido.contato_email || '—'],
    ['Prefere contato por', pedido.canal_preferido === 'email' ? 'E-mail' : 'WhatsApp'],
  ];

  const linhasItens = itens
    .map(
      (i) =>
        `<tr><td style="${td}">${esc(i.nome_snapshot)}${i.cor_snapshot ? ` — ${esc(i.cor_snapshot)}` : ''}` +
        `<div style="color:#5B6580;font-size:12px">${esc(i.sku)}</div></td>` +
        `<td style="${td}text-align:center">${i.quantidade}</td>` +
        `<td style="${td}text-align:right;white-space:nowrap">${brl(i.preco_unitario_snapshot)}</td>` +
        `<td style="${td}text-align:right;white-space:nowrap"><b>${brl(i.valor_item)}</b></td></tr>`,
    )
    .join('');

  const contatosLoja = [loja.telefone && `Telefone: ${loja.telefone}`, loja.whatsapp && `WhatsApp: ${loja.whatsapp}`, loja.emailContato]
    .filter(Boolean)
    .map(esc)
    .join(' · ');

  const intro = paraCliente
    ? `<p style="margin:0 0 6px;font-size:16px">Olá, <b>${esc(pedido.contato_nome)}</b>!</p>` +
      `<p style="margin:0 0 20px;font-size:14px;color:#5B6580">Recebemos seu pedido. Em breve entraremos em contato para combinar frete e forma de pagamento.</p>`
    : `<p style="margin:0 0 20px;font-size:14px;color:#5B6580">Novo pedido recebido pelo site. Responda este e-mail para falar com o cliente.</p>`;

  return `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:#F4F6FA;font-family:Arial,Helvetica,sans-serif;color:#101A33">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FA;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #DFE4EF">
<tr><td style="background:${AZUL};padding:18px 24px;color:#ffffff">
  <div style="font-size:22px;font-weight:bold">${esc(loja.nome)}</div>
  <div style="font-size:12px;color:${LIMA};letter-spacing:1px;text-transform:uppercase">${paraCliente ? 'Confirmação de pedido' : 'Novo pedido'}</div>
</td></tr>
<tr><td style="padding:24px">
  ${intro}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FA;border-radius:8px;margin-bottom:20px"><tr>
    <td style="padding:12px 16px;font-size:13px;color:#5B6580">Pedido<br><b style="font-size:18px;color:${AZUL}">${esc(paraCliente ? pedido.codigo_publico : pedido.numero)}</b>${paraCliente ? '' : `<br><span style="font-size:12px">Código do cliente: <b>${esc(pedido.codigo_publico)}</b></span>`}</td>
    <td style="padding:12px 16px;font-size:13px;color:#5B6580;text-align:right">Recebido em<br><b style="font-size:14px;color:#101A33">${esc(data)}</b></td>
  </tr></table>
  <h3 style="margin:0 0 8px;font-size:15px;color:${AZUL}">Cliente</h3>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:20px">${cliente.map(linhaDado).join('')}</table>
  <h3 style="margin:0 0 8px;font-size:15px;color:${AZUL}">Itens</h3>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <tr style="background:${AZUL};color:#ffffff;font-size:12px;text-transform:uppercase">
      <th align="left" style="padding:8px 12px">Produto</th><th style="padding:8px 12px">Qtd.</th>
      <th align="right" style="padding:8px 12px">Unitário</th><th align="right" style="padding:8px 12px">Subtotal</th>
    </tr>
    ${linhasItens}
    <tr><td colspan="3" style="padding:14px 12px;text-align:right;font-size:14px">Total (${unidades} ${unidades === 1 ? 'unidade' : 'unidades'})</td>
      <td style="padding:14px 12px;text-align:right;font-size:20px;color:${VERDE};white-space:nowrap"><b>${brl(pedido.valor_total)}</b></td></tr>
  </table>
  ${pedido.observacoes ? `<h3 style="margin:20px 0 8px;font-size:15px;color:${AZUL}">Observações</h3><p style="margin:0;font-size:14px;white-space:pre-line">${esc(pedido.observacoes)}</p>` : ''}
</td></tr>
<tr><td style="background:#F4F6FA;padding:16px 24px;font-size:12px;color:#5B6580;border-top:1px solid #DFE4EF">
  <b style="color:${AZUL}">${esc(loja.nome)}</b>${loja.razaoSocial ? ` · ${esc(loja.razaoSocial)}` : ''}${loja.cnpj ? ` · CNPJ ${esc(loja.cnpj)}` : ''}
  ${contatosLoja ? `<br>${contatosLoja}` : ''}${loja.endereco ? `<br>${esc(loja.endereco)}` : ''}
</td></tr>
</table></td></tr></table></body></html>`;
}

function montarEmail(notificacao, pedido, itens, texto, loja) {
  if (notificacao.tipo === 'interno') {
    return {
      replyTo: pedido.contato_email || undefined,
      subject: `Novo pedido ${pedido.numero} (${pedido.codigo_publico}) — ${pedido.nome_fantasia || pedido.razao_social || pedido.contato_nome} (${brl(pedido.valor_total)})`,
      text: `Novo pedido recebido pelo site.\n\n${texto}`,
      html: htmlPedido(pedido, itens, loja),
    };
  }
  return {
    replyTo: loja.emailContato || undefined,
    subject: `${loja.nome}: recebemos seu pedido ${pedido.codigo_publico}`,
    text:
      `Olá, ${pedido.contato_nome}!\n\nRecebemos seu pedido. Em breve entraremos em contato para combinar ` +
      `frete e forma de pagamento.\n\n${textoPedido(pedido, itens, { paraCliente: true })}\n${loja.nome}\n`,
    html: htmlPedido(pedido, itens, loja, { paraCliente: true }),
  };
}

async function enviarEmails(pedido, itens, texto) {
  const transporte = criarTransporte();
  if (!transporte) return;
  const { rows: pendentes } = await pool.query(
    `SELECT * FROM notificacoes WHERE pedido_id = $1 AND canal = 'email' AND status IN ('pendente', 'falhou') ORDER BY id`,
    [pedido.id],
  );
  if (pendentes.length === 0) return;
  const loja = await buscarLoja();
  for (const n of pendentes) {
    try {
      await transporte.sendMail({
        from: process.env.EMAIL_REMETENTE || process.env.SMTP_USER,
        to: n.destino,
        ...montarEmail(n, pedido, itens, texto, loja),
      });
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
  await enviarEmails(pedido, itens, texto);
}
