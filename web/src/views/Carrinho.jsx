import { Link } from 'react-router-dom';
import { useCarrinho } from '../lib/carrinho.jsx';
import { useProdutos } from '../lib/produtos.jsx';
import { brl } from '../lib/formato.js';

export default function Carrinho() {
  const { itens, alterarQuantidade, removerItem } = useCarrinho();
  const { itensPorSku, carregando } = useProdutos();

  const skus = Object.keys(itens);

  const linhas = skus.map((sku) => {
    const produto = itensPorSku.get(sku);
    const quantidadeCaixas = itens[sku];
    return { sku, produto, quantidadeCaixas };
  });

  const total = linhas.reduce((soma, linha) => {
    if (!linha.produto) return soma;
    return soma + linha.produto.precoCaixa * linha.quantidadeCaixas;
  }, 0);

  return (
    <section className="sec wrap">
      <div className="pagina-topo">
        <Link to="/" className="voltar">
          ← Continuar comprando
        </Link>
        <h1>Carrinho</h1>
      </div>

      {carregando && <p className="vazio">Carregando…</p>}

      {!carregando && skus.length === 0 && (
        <div className="vazio">
          <p>Seu carrinho está vazio.</p>
        </div>
      )}

      {!carregando && skus.length > 0 && (
        <>
          {linhas.map(({ sku, produto, quantidadeCaixas }) => (
            <div className="linha-item" key={sku}>
              <div className="thumb-mini">{produto && <img src={produto.imagem} alt={produto.nome} />}</div>
              <div className="info-item">
                <h3 className="pname">{produto ? produto.nome : sku}</h3>
                {produto?.cor && <p className="pdesc">Cor: {produto.cor}</p>}
                {!produto && <p className="pdesc">Este item não está mais disponível no catálogo.</p>}
                {produto && (
                  <div className="qty" style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => alterarQuantidade(sku, quantidadeCaixas - 1)}
                      disabled={quantidadeCaixas <= 1}
                    >
                      −
                    </button>
                    <span>{quantidadeCaixas}</span>
                    <button
                      type="button"
                      onClick={() => alterarQuantidade(sku, quantidadeCaixas + 1)}
                      disabled={quantidadeCaixas >= produto.limiteCaixas}
                    >
                      +
                    </button>
                  </div>
                )}
                <button type="button" className="remover" style={{ marginTop: 8 }} onClick={() => removerItem(sku)}>
                  Remover
                </button>
              </div>
              {produto && <span className="subtotal">{brl(produto.precoCaixa * quantidadeCaixas)}</span>}
            </div>
          ))}

          <div className="resumo">
            <div className="resumo-linha total">
              <span>Total</span>
              <span className="valor">{brl(total)}</span>
            </div>
          </div>

          <div style={{ marginTop: 18, textAlign: 'right' }}>
            <Link to="/checkout" className="cta-primario">
              Ir para o checkout →
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
