import type { Metadata } from "next";
import { CheckoutForm } from "@/components/CheckoutForm";

export const metadata: Metadata = { title: "Meu pedido" };

export default function PaginaPedido() {
  return (
    <div className="container pagina">
      <h1>Meu pedido</h1>
      <CheckoutForm />
    </div>
  );
}
