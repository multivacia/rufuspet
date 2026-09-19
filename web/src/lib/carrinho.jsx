import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const CHAVE_ITENS = 'rufus:carrinho';
const CHAVE_IDEMPOTENCY = 'rufus:idempotencyKey';

function lerStorage(chave) {
  try {
    return sessionStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravarStorage(chave, valor) {
  try {
    sessionStorage.setItem(chave, valor);
  } catch {
    // sessionStorage indisponível (aba privada etc.) — carrinho segue só em memória
  }
}

function carregarItensIniciais() {
  const bruto = lerStorage(CHAVE_ITENS);
  if (!bruto) return {};
  try {
    return JSON.parse(bruto);
  } catch {
    return {};
  }
}

const CarrinhoContext = createContext(null);

export function CarrinhoProvider({ children }) {
  const [itens, setItens] = useState(carregarItensIniciais);
  const [idempotencyKey, setIdempotencyKey] = useState(() => lerStorage(CHAVE_IDEMPOTENCY));

  useEffect(() => {
    gravarStorage(CHAVE_ITENS, JSON.stringify(itens));
  }, [itens]);

  function adicionarItem(sku, quantidade) {
    setIdempotencyKey((atual) => {
      if (atual) return atual;
      const nova = crypto.randomUUID();
      gravarStorage(CHAVE_IDEMPOTENCY, nova);
      return nova;
    });
    setItens((atual) => ({ ...atual, [sku]: (atual[sku] || 0) + quantidade }));
  }

  function alterarQuantidade(sku, quantidade) {
    setItens((atual) => {
      if (quantidade <= 0) {
        const { [sku]: _removido, ...resto } = atual;
        return resto;
      }
      return { ...atual, [sku]: quantidade };
    });
  }

  function removerItem(sku) {
    setItens((atual) => {
      const { [sku]: _removido, ...resto } = atual;
      return resto;
    });
  }

  function limparCarrinho() {
    setItens({});
  }

  function renovarIdempotencyKey() {
    const nova = crypto.randomUUID();
    setIdempotencyKey(nova);
    gravarStorage(CHAVE_IDEMPOTENCY, nova);
    return nova;
  }

  const totalItens = useMemo(() => Object.values(itens).reduce((soma, qtd) => soma + qtd, 0), [itens]);

  const valor = {
    itens,
    totalItens,
    idempotencyKey,
    adicionarItem,
    alterarQuantidade,
    removerItem,
    limparCarrinho,
    renovarIdempotencyKey,
  };

  return <CarrinhoContext.Provider value={valor}>{children}</CarrinhoContext.Provider>;
}

export function useCarrinho() {
  const contexto = useContext(CarrinhoContext);
  if (!contexto) throw new Error('useCarrinho precisa estar dentro de CarrinhoProvider');
  return contexto;
}
