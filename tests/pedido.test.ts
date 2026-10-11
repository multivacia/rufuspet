import { describe, expect, it } from "vitest";
import { cnpjValido, montarEmails, montarLinhas, pedidoSchema, totalCentavos } from "@/lib/pedido";

const clienteValido = {
  razaoSocial: "Pet Shop Exemplo Ltda",
  cnpj: "11.222.333/0001-81",
  contato: "Maria",
  telefone: "(11) 98765-4321",
  email: "maria@exemplo.com",
  cidade: "Campinas",
  uf: "SP",
};

describe("cnpjValido", () => {
  it("aceita CNPJ com dígitos corretos, com ou sem máscara", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11222333000181")).toBe(true);
  });
  it("recusa dígito errado, tamanho errado e sequência repetida", () => {
    expect(cnpjValido("11.222.333/0001-82")).toBe(false);
    expect(cnpjValido("1122233300018")).toBe(false);
    expect(cnpjValido("00000000000000")).toBe(false);
  });
});

describe("montarLinhas", () => {
  it("usa o preço do catálogo, agrupa repetidos e soma o total", () => {
    const linhas = montarLinhas([
      { produtoId: "saquinhos-3-rolos", quantidade: 10 },
      { produtoId: "pote-dobravel", variacaoId: "azul", quantidade: 2 },
      { produtoId: "pote-dobravel", variacaoId: "azul", quantidade: 3 },
      { produtoId: "pote-dobravel", variacaoId: "rosa", quantidade: 1 },
    ]);
    expect(linhas).toHaveLength(3);
    expect(linhas[1]).toMatchObject({ descricao: "Pote dobrável com mosquetão — Azul", quantidade: 5, subtotalCentavos: 8450 });
    expect(totalCentavos(linhas)).toBe(11900 + 8450 + 1690);
  });
  it("recusa produto inexistente e cor ausente ou inválida", () => {
    expect(() => montarLinhas([{ produtoId: "nao-existe", quantidade: 1 }])).toThrow();
    expect(() => montarLinhas([{ produtoId: "kit-suporte-2-rolos", quantidade: 1 }])).toThrow(/cor/);
    expect(() => montarLinhas([{ produtoId: "kit-suporte-2-rolos", variacaoId: "roxo", quantidade: 1 }])).toThrow();
  });
});

describe("pedidoSchema", () => {
  const base = { itens: [{ produtoId: "saquinhos-6-rolos", quantidade: 1 }], cliente: clienteValido, aceite: true };
  it("aceita pedido completo", () => {
    expect(pedidoSchema.safeParse(base).success).toBe(true);
  });
  it("recusa pedido vazio, sem aceite, quantidade inválida ou dados inválidos", () => {
    expect(pedidoSchema.safeParse({ ...base, itens: [] }).success).toBe(false);
    expect(pedidoSchema.safeParse({ ...base, aceite: false }).success).toBe(false);
    expect(pedidoSchema.safeParse({ ...base, itens: [{ produtoId: "saquinhos-6-rolos", quantidade: 0 }] }).success).toBe(false);
    expect(pedidoSchema.safeParse({ ...base, cliente: { ...clienteValido, email: "x" } }).success).toBe(false);
    expect(pedidoSchema.safeParse({ ...base, cliente: { ...clienteValido, uf: "XX" } }).success).toBe(false);
  });
});

describe("montarEmails", () => {
  it("escapa HTML dos dados do cliente e inclui total", () => {
    const pedido = pedidoSchema.parse({
      itens: [{ produtoId: "saquinhos-3-rolos", quantidade: 2 }],
      cliente: { ...clienteValido, razaoSocial: "<script>x</script> Pet" },
      aceite: true,
    });
    const emails = montarEmails("RF-1", pedido, montarLinhas(pedido.itens), "Rufus");
    expect(emails.interno.html).not.toContain("<script>");
    expect(emails.interno.texto).toMatch(/R\$\s23,80/);
    expect(emails.interno.assunto).toContain("RF-1");
  });
});
