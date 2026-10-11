import { z } from "zod";
import { buscarProduto, formatarPreco } from "./catalogo";

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

export function cnpjValido(valor: string): boolean {
  const cnpj = somenteDigitos(valor);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const digito = (base: string) => {
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

const texto = (max: number) => z.string().trim().max(max);

export const pedidoSchema = z.object({
  itens: z
    .array(
      z.object({
        produtoId: z.string().min(1),
        variacaoId: z.string().optional(),
        quantidade: z.number().int().min(1).max(9999),
      }),
    )
    .min(1, "O pedido está vazio.")
    .max(50),
  cliente: z.object({
    razaoSocial: texto(150).min(2, "Informe a razão social."),
    nomeFantasia: texto(150).optional().default(""),
    cnpj: z.string().refine(cnpjValido, "CNPJ inválido."),
    contato: texto(100).min(2, "Informe o nome do responsável."),
    telefone: z
      .string()
      .refine((v) => [10, 11].includes(somenteDigitos(v).length), "Telefone inválido."),
    email: z.string().trim().email("E-mail inválido.").max(150),
    cidade: texto(100).min(2, "Informe a cidade."),
    uf: z.enum(UFS, { errorMap: () => ({ message: "Selecione a UF." }) }),
    observacoes: texto(1000).optional().default(""),
  }),
  aceite: z.literal(true, { errorMap: () => ({ message: "É necessário autorizar o contato." }) }),
  // Campo invisível: se vier preenchido, é robô.
  website: z.string().optional(),
});

export type PedidoEntrada = z.input<typeof pedidoSchema>;
export type PedidoValidado = z.output<typeof pedidoSchema>;

export type LinhaPedido = {
  produtoId: string;
  variacaoId?: string;
  descricao: string;
  quantidade: number;
  precoUnitarioCentavos: number;
  subtotalCentavos: number;
};

export class ItemInvalidoError extends Error {}

/**
 * Monta as linhas com o preço do catálogo do servidor (o preço enviado pelo navegador é ignorado)
 * e agrupa itens repetidos.
 */
export function montarLinhas(itens: PedidoValidado["itens"]): LinhaPedido[] {
  const linhas = new Map<string, LinhaPedido>();
  for (const item of itens) {
    const produto = buscarProduto(item.produtoId);
    if (!produto) throw new ItemInvalidoError(`Produto inexistente: ${item.produtoId}`);
    let descricao = produto.nome;
    let variacaoId: string | undefined;
    if (produto.variacoes?.length) {
      const variacao = produto.variacoes.find((v) => v.id === item.variacaoId);
      if (!variacao) throw new ItemInvalidoError(`Selecione a cor de ${produto.nome}.`);
      descricao += ` — ${variacao.nome}`;
      variacaoId = variacao.id;
    }
    const chave = `${produto.id}:${variacaoId ?? ""}`;
    const existente = linhas.get(chave);
    const quantidade = (existente?.quantidade ?? 0) + item.quantidade;
    linhas.set(chave, {
      produtoId: produto.id,
      variacaoId,
      descricao,
      quantidade,
      precoUnitarioCentavos: produto.precoCentavos,
      subtotalCentavos: quantidade * produto.precoCentavos,
    });
  }
  return [...linhas.values()];
}

export function totalCentavos(linhas: LinhaPedido[]): number {
  return linhas.reduce((soma, l) => soma + l.subtotalCentavos, 0);
}

export function gerarNumeroPedido(agora = new Date()): string {
  const data = agora.toISOString().slice(0, 10).replace(/-/g, "");
  const sufixo = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, "0");
  return `RF-${data}-${sufixo}`;
}

export function formatarCnpj(valor: string): string {
  return somenteDigitos(valor).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function escapar(valor: string): string {
  return valor.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function montarEmails(numero: string, pedido: PedidoValidado, linhas: LinhaPedido[], nomeLoja: string) {
  const c = pedido.cliente;
  const total = formatarPreco(totalCentavos(linhas));
  const unidades = linhas.reduce((s, l) => s + l.quantidade, 0);

  const dadosCliente: [string, string][] = [
    ["Razão social", c.razaoSocial],
    ["Nome fantasia", c.nomeFantasia || "—"],
    ["CNPJ", formatarCnpj(c.cnpj)],
    ["Responsável", c.contato],
    ["Telefone/WhatsApp", c.telefone],
    ["E-mail", c.email],
    ["Cidade/UF", `${c.cidade}/${c.uf}`],
    ["Observações", c.observacoes || "—"],
  ];

  const textoItens = linhas
    .map((l) => `- ${l.quantidade}x ${l.descricao} (${formatarPreco(l.precoUnitarioCentavos)}) = ${formatarPreco(l.subtotalCentavos)}`)
    .join("\n");
  const textoCliente = dadosCliente.map(([k, v]) => `${k}: ${v}`).join("\n");

  const htmlItens = linhas
    .map(
      (l) =>
        `<tr><td style="padding:6px;border-bottom:1px solid #ddd">${escapar(l.descricao)}</td>` +
        `<td style="padding:6px;border-bottom:1px solid #ddd;text-align:center">${l.quantidade}</td>` +
        `<td style="padding:6px;border-bottom:1px solid #ddd;text-align:right">${formatarPreco(l.precoUnitarioCentavos)}</td>` +
        `<td style="padding:6px;border-bottom:1px solid #ddd;text-align:right">${formatarPreco(l.subtotalCentavos)}</td></tr>`,
    )
    .join("");
  const htmlTabela =
    `<table style="border-collapse:collapse;width:100%;max-width:640px;font-family:Arial,sans-serif;font-size:14px">` +
    `<thead><tr style="background:#14246b;color:#fff"><th style="padding:6px;text-align:left">Produto</th><th style="padding:6px">Qtd.</th>` +
    `<th style="padding:6px;text-align:right">Unitário</th><th style="padding:6px;text-align:right">Subtotal</th></tr></thead>` +
    `<tbody>${htmlItens}</tbody><tfoot><tr><td colspan="3" style="padding:6px;text-align:right"><b>Total (${unidades} un.)</b></td>` +
    `<td style="padding:6px;text-align:right"><b>${total}</b></td></tr></tfoot></table>`;
  const htmlCliente =
    `<table style="font-family:Arial,sans-serif;font-size:14px">` +
    dadosCliente.map(([k, v]) => `<tr><td style="padding:3px 12px 3px 0;color:#555">${k}</td><td><b>${escapar(v)}</b></td></tr>`).join("") +
    `</table>`;

  return {
    interno: {
      assunto: `Novo pedido ${numero} — ${c.nomeFantasia || c.razaoSocial} (${total})`,
      texto: `Novo pedido recebido pelo site.\n\nPedido: ${numero}\n\n${textoCliente}\n\nItens:\n${textoItens}\n\nTotal: ${total}\n`,
      html:
        `<div style="font-family:Arial,sans-serif"><h2 style="color:#14246b">Novo pedido ${numero}</h2>` +
        `<h3>Cliente</h3>${htmlCliente}<h3>Itens</h3>${htmlTabela}</div>`,
    },
    cliente: {
      assunto: `${nomeLoja}: recebemos seu pedido ${numero}`,
      texto:
        `Olá, ${c.contato}!\n\nRecebemos seu pedido ${numero}. Um vendedor entrará em contato para confirmar ` +
        `condições de pagamento e entrega.\n\nItens:\n${textoItens}\n\nTotal: ${total}\n\n${nomeLoja}`,
      html:
        `<div style="font-family:Arial,sans-serif"><h2 style="color:#14246b">Recebemos seu pedido ${numero}</h2>` +
        `<p>Olá, ${escapar(c.contato)}! Um vendedor entrará em contato para confirmar condições de pagamento e entrega.</p>` +
        `${htmlTabela}<p>${escapar(nomeLoja)}</p></div>`,
    },
  };
}
