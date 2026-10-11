"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { buscarProduto } from "@/lib/catalogo";

export type ItemCarrinho = { produtoId: string; variacaoId?: string; quantidade: number };

type Carrinho = {
  itens: ItemCarrinho[];
  carregado: boolean;
  adicionar: (item: ItemCarrinho) => void;
  definirQuantidade: (produtoId: string, variacaoId: string | undefined, quantidade: number) => void;
  remover: (produtoId: string, variacaoId: string | undefined) => void;
  limpar: () => void;
  totalUnidades: number;
  totalCentavos: number;
};

const CHAVE = "rufus-pedido-v1";
const Contexto = createContext<Carrinho | null>(null);

const mesmoItem = (a: ItemCarrinho, produtoId: string, variacaoId?: string) =>
  a.produtoId === produtoId && (a.variacaoId ?? "") === (variacaoId ?? "");

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [itens, setItens] = useState<ItemCarrinho[]>([]);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE) ?? "[]");
      // Descarta itens que não existem mais no catálogo.
      if (Array.isArray(salvo)) setItens(salvo.filter((i: ItemCarrinho) => buscarProduto(i.produtoId) && i.quantidade > 0));
    } catch {
      // Sem armazenamento local: o pedido vale só para esta visita.
    }
    setCarregado(true);
  }, []);

  useEffect(() => {
    if (!carregado) return;
    try {
      localStorage.setItem(CHAVE, JSON.stringify(itens));
    } catch {
      // ignorado
    }
  }, [itens, carregado]);

  const adicionar = useCallback((novo: ItemCarrinho) => {
    setItens((atual) => {
      const existe = atual.some((i) => mesmoItem(i, novo.produtoId, novo.variacaoId));
      if (!existe) return [...atual, novo];
      return atual.map((i) =>
        mesmoItem(i, novo.produtoId, novo.variacaoId) ? { ...i, quantidade: Math.min(9999, i.quantidade + novo.quantidade) } : i,
      );
    });
  }, []);

  const definirQuantidade = useCallback((produtoId: string, variacaoId: string | undefined, quantidade: number) => {
    setItens((atual) =>
      quantidade <= 0
        ? atual.filter((i) => !mesmoItem(i, produtoId, variacaoId))
        : atual.map((i) => (mesmoItem(i, produtoId, variacaoId) ? { ...i, quantidade: Math.min(9999, quantidade) } : i)),
    );
  }, []);

  const remover = useCallback(
    (produtoId: string, variacaoId: string | undefined) =>
      setItens((atual) => atual.filter((i) => !mesmoItem(i, produtoId, variacaoId))),
    [],
  );

  const limpar = useCallback(() => setItens([]), []);

  const valor = useMemo<Carrinho>(() => {
    let totalUnidades = 0;
    let totalCentavos = 0;
    for (const i of itens) {
      totalUnidades += i.quantidade;
      totalCentavos += i.quantidade * (buscarProduto(i.produtoId)?.precoCentavos ?? 0);
    }
    return { itens, carregado, adicionar, definirQuantidade, remover, limpar, totalUnidades, totalCentavos };
  }, [itens, carregado, adicionar, definirQuantidade, remover, limpar]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useCarrinho(): Carrinho {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useCarrinho deve ser usado dentro de CartProvider");
  return ctx;
}
