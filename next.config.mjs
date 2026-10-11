import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

// Produção: site estático (pasta out/) para hospedagem compartilhada (HostGator).
// O pedido é recebido por public/api/pedido.php.
// Desenvolvimento: as chamadas a /api/*.php são repassadas ao servidor PHP local (npm run dev:api).
export default function config(phase) {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    return {
      async rewrites() {
        return [{ source: "/api/:arquivo*", destination: "http://localhost:8000/api/:arquivo*" }];
      },
    };
  }
  return {
    output: "export",
    trailingSlash: true,
    images: { unoptimized: true },
    poweredByHeader: false,
  };
}
