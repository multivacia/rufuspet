"use client";

import { useSearchParams } from "next/navigation";

export function NumeroPedido() {
  const numero = useSearchParams().get("numero");
  if (!numero) return null;
  return (
    <p>
      Número do pedido: <b>{numero}</b>
    </p>
  );
}
