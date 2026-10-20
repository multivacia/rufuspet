// Links "clique para conversar" do WhatsApp (wa.me): abrem o WhatsApp de quem clica com a mensagem
// já escrita. Nada é enviado automaticamente — a pessoa confirma no próprio WhatsApp.
import { brl } from './formato.js';

/** Número no formato internacional só com dígitos; assume Brasil (55) quando vier só DDD + número. */
export function numeroWhatsApp(valor) {
  const digitos = String(valor ?? '').replace(/\D/g, '');
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) return digitos;
  return digitos.length >= 8 ? digitos : '';
}

/** Link wa.me, ou null se o número for inválido. */
export function linkWhatsApp(numero, texto) {
  const destino = numeroWhatsApp(numero);
  if (!destino) return null;
  return texto ? `https://wa.me/${destino}?text=${encodeURIComponent(texto)}` : `https://wa.me/${destino}`;
}

/** Mensagem do cliente para a loja, enviada a partir da tela de confirmação. */
export function mensagemPedidoParaLoja({ numero, valorTotal, itens = [], empresa, nome }) {
  const linhas = itens.map((i) => `• ${i.quantidade}x ${i.nome}${i.cor ? ` (${i.cor})` : ''} — ${brl(i.precoUnitario * i.quantidade)}`);
  return [
    `Olá! Acabei de fazer o pedido *${numero}* pelo site.`,
    empresa ? `Empresa: ${empresa}` : nome ? `Nome: ${nome}` : null,
    linhas.length ? '' : null,
    ...linhas,
    '',
    `*Total: ${brl(valorTotal)}*`,
    '',
    'Aguardo o contato para combinar frete e pagamento.',
  ]
    .filter((l) => l !== null)
    .join('\n');
}

/** Mensagem da loja para o cliente, a partir do admin. */
export function mensagemLojaParaCliente(pedido, nomeLoja) {
  const primeiroNome = String(pedido.contato_nome ?? '').trim().split(/\s+/)[0] || '';
  return (
    `Olá${primeiroNome ? `, ${primeiroNome}` : ''}! Aqui é da ${nomeLoja}. ` +
    `Recebemos o pedido *${pedido.numero}* (${brl(pedido.valor_total)}) e gostaríamos de combinar frete e pagamento.`
  );
}
