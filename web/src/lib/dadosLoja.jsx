import { createContext, useContext, useEffect, useState } from 'react';
import { buscarLoja } from './api.js';

// Dados da loja (rodapé, confirmação), editados no admin → tela "Loja".
const PADRAO = {
  nome: 'Rufus', razaoSocial: '', cnpj: '', telefone: '', whatsapp: '', emailContato: '', endereco: '', horario: '', instagram: '', pedidoMinimo: 0,
};

const LojaContext = createContext(PADRAO);

export function LojaProvider({ children }) {
  const [loja, setLoja] = useState(PADRAO);

  useEffect(() => {
    let cancelado = false;
    buscarLoja()
      .then((dados) => {
        if (!cancelado) setLoja({ ...PADRAO, ...dados });
      })
      .catch(() => {}); // sem API, o rodapé mostra só o nome
    return () => {
      cancelado = true;
    };
  }, []);

  return <LojaContext.Provider value={loja}>{children}</LojaContext.Provider>;
}

export function useLoja() {
  return useContext(LojaContext);
}
