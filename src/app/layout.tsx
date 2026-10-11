import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import Link from "next/link";
import { CartBar, CartLink } from "@/components/CartBar";
import { CartProvider } from "@/components/CartProvider";
import { Footer } from "@/components/Footer";
import { Logo } from "@/components/Logo";
import { dadosLoja } from "@/lib/config";
import "./globals.css";

const nunito = Nunito({ subsets: ["latin"], weight: ["400", "600", "700", "800", "900"], display: "swap" });

export function generateMetadata(): Metadata {
  const { nome } = dadosLoja();
  return {
    title: { default: `${nome} — Catálogo para pet shops`, template: `%s · ${nome}` },
    description: "Saquinhos higiênicos e acessórios para passeio com pets. Faça seu pedido e um vendedor entra em contato.",
    applicationName: nome,
    appleWebApp: { capable: true, title: nome, statusBarStyle: "default" },
    icons: { icon: "/icones/icone-192.png", apple: "/icones/apple-touch-icon.png" },
  };
}

export const viewport: Viewport = { themeColor: "#14246b" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { nome } = dadosLoja();
  return (
    <html lang="pt-BR">
      <body className={nunito.className}>
        <CartProvider>
          <header className="cabecalho">
            <div className="container cabecalho-conteudo">
              <Link href="/" aria-label={`${nome} — início`}>
                <Logo nome={nome} />
              </Link>
              <CartLink />
            </div>
          </header>
          <main>{children}</main>
          <Footer />
          <CartBar />
        </CartProvider>
      </body>
    </html>
  );
}
