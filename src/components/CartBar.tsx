"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { formatarPreco } from "@/lib/catalogo";
import { useCarrinho } from "./CartProvider";

export function CartBar() {
  const { totalUnidades, totalCentavos } = useCarrinho();
  const caminho = usePathname();
  if (totalUnidades === 0 || caminho.startsWith("/pedido")) return null;
  return (
    <div className="carrinho-barra">
      <div>
        <b>{totalUnidades}</b> {totalUnidades === 1 ? "unidade" : "unidades"} · <b>{formatarPreco(totalCentavos)}</b>
      </div>
      <Link href="/pedido" className="botao botao-claro">
        Revisar pedido →
      </Link>
    </div>
  );
}

export function CartLink() {
  const { totalUnidades } = useCarrinho();
  return (
    <Link href="/pedido" className="cabecalho-pedido">
      Meu pedido{totalUnidades > 0 && <span className="contador">{totalUnidades}</span>}
    </Link>
  );
}
