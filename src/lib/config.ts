// Dados da loja exibidos no site, lidos das variáveis de ambiente no momento do build
// (.env.local / .env.production). Alterou? Rode "npm run build" e reenvie a pasta out/.

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
