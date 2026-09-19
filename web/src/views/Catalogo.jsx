import { useState } from 'react';
import { useProdutos } from '../lib/produtos.jsx';
import { useCarrinho } from '../lib/carrinho.jsx';
import { brl } from '../lib/formato.js';

function variantePadrao(produto) {
  return produto.variantes ? produto.variantes[0].sku : produto.sku;
}

export default function Catalogo() {
  const { produtos, carregando, erro } = useProdutos();
  const { adicionarItem } = useCarrinho();

  const [selecao, setSelecao] = useState({});
  const [quantidade, setQuantidade] = useState({});
  const [adicionado, setAdicionado] = useState(null);

  function chaveDoGrupo(produto) {
    return produto.grupo ?? produto.sku;
  }

  function skuSelecionado(produto) {
    const chave = chaveDoGrupo(produto);
    return selecao[chave] ?? variantePadrao(produto);
  }

  function varianteAtual(produto) {
    if (!produto.variantes) return null;
    const sku = skuSelecionado(produto);
    return produto.variantes.find((v) => v.sku === sku) ?? produto.variantes[0];
  }

  function limiteAtual(produto) {
    const variante = varianteAtual(produto);
    return variante ? variante.limiteCaixas : produto.limiteCaixas;
  }

  function qtdAtual(produto) {
    const sku = skuSelecionado(produto);
    return quantidade[sku] || 1;
  }

  function alterarQtd(produto, delta) {
    const sku = skuSelecionado(produto);
    const limite = limiteAtual(produto);
    setQuantidade((atual) => {
      const proxima = Math.min(limite, Math.max(1, (atual[sku] || 1) + delta));
      return { ...atual, [sku]: proxima };
    });
  }

  function escolherCor(produto, sku) {
    setSelecao((atual) => ({ ...atual, [chaveDoGrupo(produto)]: sku }));
  }

  function handleAdicionar(produto) {
    const sku = skuSelecionado(produto);
    adicionarItem(sku, qtdAtual(produto));
    setAdicionado(sku);
    setTimeout(() => setAdicionado((atual) => (atual === sku ? null : atual)), 1600);
  }

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <h1>
            Saquinhos higiênicos <span>direto do importador</span>.
          </h1>
          <p>Atacado para petshops da Grande São Paulo. Escolha, ajuste a quantidade e finalize o pedido.</p>
          <div className="hero-tags">
            <span className="hero-tag">PRONTA ENTREGA</span>
            <span className="hero-tag">ENTREGA EM 2–4 DIAS ÚTEIS</span>
            <span className="hero-tag">ROLO: 15 SACOS, 33×23CM</span>
          </div>
        </div>
      </section>

      <section className="sec wrap">
        <h2 className="sec-title">Catálogo</h2>

        {carregando && <p className="vazio">Carregando catálogo…</p>}
        {erro && <p className="alerta-erro">Não deu pra carregar o catálogo agora. Atualize a página em instantes.</p>}

        {!carregando && !erro && produtos.length === 0 && <p className="vazio">Nenhum produto disponível no momento.</p>}

        {!carregando && !erro && produtos.length > 0 && (
          <div className="grid">
            {produtos.map((produto) => {
              const variante = varianteAtual(produto);
              const imagem = variante ? variante.imagem : produto.imagem;
              const sku = skuSelecionado(produto);
              const limite = limiteAtual(produto);
              const qtd = qtdAtual(produto);

              return (
                <article className="card" key={produto.grupo ?? produto.sku}>
                  <div className="thumb">
                    <img src={imagem} alt={produto.nome + (variante ? ` - ${variante.cor}` : '')} loading="lazy" />
                  </div>
                  <div className="body">
                    <h3 className="pname">{produto.nome}</h3>
                    <p className="pdesc">{produto.descricao}</p>

                    {produto.variantes && (
                      <div className="colors">
                        <span className="colors-k">Cor</span>
                        {produto.variantes.map((v) => (
                          <button
                            key={v.sku}
                            type="button"
                            className={`sw ${v.sku === sku ? 'on' : ''}`}
                            style={{ background: v.hex }}
                            onClick={() => escolherCor(produto, v.sku)}
                            title={v.cor}
                            aria-label={`Cor ${v.cor}`}
                          />
                        ))}
                        <span className="sw-name">{variante?.cor}</span>
                      </div>
                    )}

                    <div className="price-row">
                      <span className="price">{brl(produto.precoCaixa)}</span>
                      <span className="price-unit">
                        caixa com {produto.qtdPorCaixa} {produto.unidade}
                        {produto.qtdPorCaixa > 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <div className="foot">
                    <div className="qty">
                      <button type="button" onClick={() => alterarQtd(produto, -1)} disabled={qtd <= 1}>
                        −
                      </button>
                      <span>{qtd}</span>
                      <button type="button" onClick={() => alterarQtd(produto, 1)} disabled={qtd >= limite}>
                        +
                      </button>
                    </div>
                    <button type="button" className="buy" onClick={() => handleAdicionar(produto)}>
                      {adicionado === sku ? 'Adicionado ✓' : 'Adicionar'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="info">
          <div>
            <span className="info-k">Pedido mínimo</span>
            <span className="info-v">Sem mínimo — combine no carrinho</span>
          </div>
          <div>
            <span className="info-k">Frete</span>
            <span className="info-v">A combinar</span>
          </div>
          <div>
            <span className="info-k">Pagamento</span>
            <span className="info-v">Combinado por WhatsApp ou e-mail</span>
          </div>
        </div>
      </section>
    </>
  );
}
