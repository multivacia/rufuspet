import { NextResponse } from "next/server";
import { configEmail, dadosLoja } from "@/lib/config";
import { enviarEmails, type Mensagem } from "@/lib/email";
import { ItemInvalidoError, gerarNumeroPedido, montarEmails, montarLinhas, pedidoSchema } from "@/lib/pedido";

// Limite simples por IP (melhor esforço; cada instância serverless tem sua própria memória).
const JANELA_MS = 10 * 60 * 1000;
const MAX_POR_JANELA = 5;
const tentativas = new Map<string, number[]>();

function excedeuLimite(ip: string): boolean {
  const agora = Date.now();
  const recentes = (tentativas.get(ip) ?? []).filter((t) => agora - t < JANELA_MS);
  recentes.push(agora);
  tentativas.set(ip, recentes);
  return recentes.length > MAX_POR_JANELA;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (excedeuLimite(ip)) {
    return NextResponse.json({ erro: "Muitos pedidos em pouco tempo. Tente novamente em alguns minutos." }, { status: 429 });
  }

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Requisição inválida." }, { status: 400 });
  }

  const resultado = pedidoSchema.safeParse(corpo);
  if (!resultado.success) {
    const erros = resultado.error.issues.map((i) => ({ campo: i.path.join("."), mensagem: i.message }));
    return NextResponse.json({ erro: erros[0]?.mensagem ?? "Dados inválidos.", erros }, { status: 400 });
  }
  const pedido = resultado.data;

  const numero = gerarNumeroPedido();
  // Robô preencheu o campo invisível: finge sucesso e não envia nada.
  if (pedido.website) return NextResponse.json({ numero });

  let linhas;
  try {
    linhas = montarLinhas(pedido.itens);
  } catch (e) {
    if (e instanceof ItemInvalidoError) return NextResponse.json({ erro: e.message }, { status: 400 });
    throw e;
  }

  const loja = dadosLoja();
  const { destino, copiaCliente } = configEmail();
  const emails = montarEmails(numero, pedido, linhas, loja.nome);
  const mensagens: Mensagem[] = [{ para: destino || "(destino não configurado)", responderPara: pedido.cliente.email, ...emails.interno }];
  if (copiaCliente) mensagens.push({ para: pedido.cliente.email, responderPara: loja.email || undefined, ...emails.cliente });

  try {
    await enviarEmails(mensagens.slice(0, 1));
  } catch (e) {
    console.error(`Falha ao enviar pedido ${numero}`, e);
    return NextResponse.json(
      { erro: "Não foi possível enviar o pedido agora. Tente novamente ou fale com a gente pelo telefone." },
      { status: 502 },
    );
  }
  // A cópia ao cliente não pode derrubar o pedido, que já chegou à loja.
  if (mensagens.length > 1) {
    await enviarEmails(mensagens.slice(1)).catch((e) => console.error(`Falha na cópia do pedido ${numero}`, e));
  }

  return NextResponse.json({ numero });
}
