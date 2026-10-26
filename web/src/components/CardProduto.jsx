import { useEffect, useRef, useState } from 'react';
import { useCarrinho } from '../lib/carrinho.jsx';
import { brl } from '../lib/formato.js';
import Quantidade from './Quantidade.jsx';
import GaleriaFotos from './GaleriaFotos.jsx';

export default function CardProduto({ produto, prioridade = false }) {
  const { adicionarItem } = useCarrinho();
  const [sku, setSku] = useState(produto.variantes?.[0]?.sku ?? produto.sku);
  const [quantidade, setQuantidade] = useState(1);
  const [adicionado, setAdicionado] = useState(false);
  const [galeriaAberta, setGaleriaAberta] = useState(false);
  const temporizador = useRef();

  useEffect(() => () => clearTimeout(temporizador.current), []);

  const variante = produto.variantes?.find((v) => v.sku === sku);
  const imagem = variante?.imagem ?? produto.imagem;
  const extras = produto.fotos ?? [];
  const textoFoto = variante ? `${produto.nome} — ${variante.cor}` : produto.nome;

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
        <img src={imagem} alt={textoFoto} width="900" height="900" loading={prioridade ? 'eager' : 'lazy'} />
        {extras.length > 0 && (
          <button type="button" className="card-mais-fotos" onClick={() => setGaleriaAberta(true)} aria-label={`Ver mais ${extras.length} fotos de ${produto.nome}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 4 7.2 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.2L15 4H9Zm3 4.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" />
            </svg>
            +{extras.length}
          </button>
        )}
      </div>
      {galeriaAberta && (
        <GaleriaFotos
          titulo={produto.nome}
          fotos={[{ url: imagem, legenda: variante?.cor ?? '' }, ...extras]}
          aoFechar={() => setGaleriaAberta(false)}
        />
      )}
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
