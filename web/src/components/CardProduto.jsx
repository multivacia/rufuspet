import { useEffect, useRef, useState } from 'react';
import { useCarrinho } from '../lib/carrinho.jsx';
import { brl } from '../lib/formato.js';
import Quantidade from './Quantidade.jsx';

export default function CardProduto({ produto, prioridade = false }) {
  const { adicionarItem } = useCarrinho();
  const [sku, setSku] = useState(produto.variantes?.[0]?.sku ?? produto.sku);
  const [quantidade, setQuantidade] = useState(1);
  const [adicionado, setAdicionado] = useState(false);
  const temporizador = useRef();

  useEffect(() => () => clearTimeout(temporizador.current), []);

  const variante = produto.variantes?.find((v) => v.sku === sku);
  const imagem = variante?.imagem ?? produto.imagem;

  function aoAdicionar() {
    adicionarItem(sku, quantidade);
    setQuantidade(1);
    setAdicionado(true);
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setAdicionado(false), 1800);
  }

  return (
    <article className="card-produto">
      <div className="card-foto">
        <img
          src={imagem}
          alt={variante ? `${produto.nome} — ${variante.cor}` : produto.nome}
          width="900"
          height="900"
          loading={prioridade ? 'eager' : 'lazy'}
        />
      </div>
      <div className="card-corpo">
        <h3>{produto.nome}</h3>
        {produto.descricao && <p className="card-descricao">{produto.descricao}</p>}
        <p className="card-preco">
          {brl(produto.precoUnitario)} <span>/ unidade</span>
        </p>

        {produto.variantes && (
          <fieldset className="cores">
            <legend>
              Cor: <b>{variante?.cor}</b>
            </legend>
            <div>
              {produto.variantes.map((v) => (
                <label key={v.sku} className="cor" title={v.cor}>
                  <input
                    type="radio"
                    name={`cor-${produto.grupo}`}
                    value={v.sku}
                    checked={v.sku === sku}
                    onChange={() => setSku(v.sku)}
                  />
                  <span style={{ background: v.hex }} />
                  <span className="sr-only">{v.cor}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="card-acoes">
          <Quantidade valor={quantidade} aoMudar={setQuantidade} rotulo={`Quantidade de ${produto.nome}`} />
          <button type="button" className="botao" onClick={aoAdicionar}>
            {adicionado ? 'Adicionado ✓' : 'Adicionar'}
          </button>
        </div>
        <p className="sr-only" aria-live="polite">
          {adicionado ? `${produto.nome} adicionado ao pedido.` : ''}
        </p>
      </div>
    </article>
  );
}
