// Catálogo de produtos. Para alterar preço, foto ou incluir um produto, edite esta lista.
// Preços em centavos para evitar erro de arredondamento.

export type Variacao = {
  id: string;
  nome: string;
  cor: string; // cor do botão de seleção
  imagem: string;
};

export type Produto = {
  id: string;
  nome: string;
  linha: string;
  descricao: string;
  destaques: string[];
  precoCentavos: number;
  imagem: string;
  variacoes?: Variacao[];
};

export const catalogo: Produto[] = [
  {
    id: "saquinhos-3-rolos",
    nome: "Saquinhos higiênicos — kit com 3 rolos",
    linha: "Saquinhos higiênicos",
    descricao: "Rolos de saquinhos estampados para recolher as necessidades do pet nos passeios.",
    destaques: ["3 rolos", "Práticos para passeios"],
    precoCentavos: 1190,
    imagem: "/produtos/saquinhos-3-rolos.webp",
  },
  {
    id: "saquinhos-6-rolos",
    nome: "Saquinhos higiênicos — kit com 6 rolos",
    linha: "Saquinhos higiênicos",
    descricao: "Embalagem econômica com 6 rolos de saquinhos estampados.",
    destaques: ["6 rolos", "Melhor custo por rolo"],
    precoCentavos: 1890,
    imagem: "/produtos/saquinhos-6-rolos.webp",
  },
  {
    id: "kit-suporte-2-rolos",
    nome: "Kit porta-saquinhos + 2 rolos",
    linha: "Saquinhos higiênicos",
    descricao: "Porta-saquinhos em formato de osso com mosquetão para prender na guia, acompanha 2 rolos.",
    destaques: ["Suporte com mosquetão", "2 rolos inclusos"],
    precoCentavos: 1290,
    imagem: "/produtos/kit-suporte-azul.webp",
    variacoes: [
      { id: "verde", nome: "Verde", cor: "#2e9e3a", imagem: "/produtos/kit-suporte-verde.webp" },
      { id: "azul", nome: "Azul", cor: "#1f3fa8", imagem: "/produtos/kit-suporte-azul.webp" },
      { id: "rosa", nome: "Rosa", cor: "#ec2f8c", imagem: "/produtos/kit-suporte-rosa.webp" },
    ],
  },
  {
    id: "pote-dobravel",
    nome: "Pote dobrável com mosquetão",
    linha: "Potes dobráveis",
    descricao: "Pote de silicone dobrável para água ou ração, ideal para passeios e viagens.",
    destaques: ["Dobrável e compacto", "Leve e portátil", "Com mosquetão"],
    precoCentavos: 1690,
    imagem: "/produtos/pote-preto.webp",
    variacoes: [
      { id: "preto", nome: "Preto", cor: "#1d1d1f", imagem: "/produtos/pote-preto.webp" },
      { id: "azul", nome: "Azul", cor: "#1f5fe0", imagem: "/produtos/pote-azul.webp" },
      { id: "vermelho", nome: "Vermelho", cor: "#e3262b", imagem: "/produtos/pote-vermelho.webp" },
      { id: "rosa", nome: "Rosa", cor: "#ec2f8c", imagem: "/produtos/pote-rosa.webp" },
    ],
  },
];

export function buscarProduto(id: string): Produto | undefined {
  return catalogo.find((p) => p.id === id);
}

export function formatarPreco(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
