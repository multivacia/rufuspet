// Dados da loja e do envio de pedidos, lidos das variáveis de ambiente (.env.local / painel da hospedagem).
// Veja .env.example para a lista completa.

function env(nome: string, padrao = ""): string {
  return process.env[nome]?.trim() || padrao;
}

export function dadosLoja() {
  return {
    nome: env("LOJA_NOME", "Rufus"),
    razaoSocial: env("LOJA_RAZAO_SOCIAL"),
    cnpj: env("LOJA_CNPJ"),
    telefone: env("LOJA_TELEFONE"),
    whatsapp: env("LOJA_WHATSAPP"),
    email: env("LOJA_EMAIL_CONTATO"),
    endereco: env("LOJA_ENDERECO"),
    horario: env("LOJA_HORARIO_ATENDIMENTO"),
    instagram: env("LOJA_INSTAGRAM"),
  };
}

export function configEmail() {
  return {
    destino: env("PEDIDOS_EMAIL_DESTINO"),
    copiaCliente: env("PEDIDOS_COPIA_CLIENTE", "true") === "true",
    smtp: {
      host: env("SMTP_HOST"),
      port: Number(env("SMTP_PORT", "465")),
      user: env("SMTP_USER"),
      pass: env("SMTP_PASS"),
      from: env("SMTP_FROM"),
    },
  };
}
