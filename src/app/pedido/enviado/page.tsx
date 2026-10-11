import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { dadosLoja } from "@/lib/config";
import { NumeroPedido } from "./NumeroPedido";

export const metadata: Metadata = { title: "Pedido enviado" };

export default function PedidoEnviado() {
  const loja = dadosLoja();
  return (
    <div className="container pagina sucesso">
      <div className="sucesso-icone" aria-hidden="true">✓</div>
      <h1>Pedido enviado!</h1>
      <Suspense>
        <NumeroPedido />
      </Suspense>
      <p>Recebemos seu pedido. Um vendedor entrará em contato em breve para confirmar pagamento e entrega.</p>
      {loja.telefone && <p>Se preferir, fale com a gente: {loja.telefone}</p>}
      <Link href="/" className="botao">
        Voltar ao catálogo
      </Link>
    </div>
  );
}
