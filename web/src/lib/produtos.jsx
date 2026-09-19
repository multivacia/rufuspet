import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { buscarProdutos, achatarItensComprariveis } from './api.js';

const ProdutosContext = createContext(null);

export function ProdutosProvider({ children }) {
  const [produtos, setProdutos] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro(null);

    buscarProdutos()
      .then((dados) => {
        if (!cancelado) setProdutos(dados);
      })
      .catch((err) => {
        if (!cancelado) setErro(err);
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [versao]);

  const itensPorSku = useMemo(() => {
    const mapa = new Map();
    for (const item of achatarItensComprariveis(produtos ?? [])) {
      mapa.set(item.sku, item);
    }
    return mapa;
  }, [produtos]);

  const valor = {
    produtos: produtos ?? [],
    itensPorSku,
    carregando,
    erro,
    recarregar: () => setVersao((v) => v + 1),
  };

  return <ProdutosContext.Provider value={valor}>{children}</ProdutosContext.Provider>;
}

export function useProdutos() {
  const contexto = useContext(ProdutosContext);
  if (!contexto) throw new Error('useProdutos precisa estar dentro de ProdutosProvider');
  return contexto;
}
