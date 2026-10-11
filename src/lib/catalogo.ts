// O catálogo fica em public/api/catalogo.json, lido também pelo pedido.php no servidor.
import dados from "../../public/api/catalogo.json";

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
  destaques: string[];
  precoCentavos: number; // em centavos para evitar erro de arredondamento
  imagem: string;
  variacoes?: Variacao[];
};

export const catalogo: Produto[] = dados.produtos;

export function buscarProduto(id: string): Produto | undefined {
  return catalogo.find((p) => p.id === id);
}

export function formatarPreco(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
