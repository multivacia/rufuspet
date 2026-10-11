import type { MetadataRoute } from "next";
import { dadosLoja } from "@/lib/config";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  const { nome } = dadosLoja();
  return {
    name: `${nome} — Catálogo para pet shops`,
    short_name: nome,
    description: "Catálogo e pedidos para lojistas.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f7fb",
    theme_color: "#14246b",
    lang: "pt-BR",
    icons: [
      { src: "/icones/icone-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icones/icone-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icones/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
