import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useProdutos } from '../lib/produtos.jsx';
import CardProduto from '../components/CardProduto.jsx';
import { Pata } from '../components/Logo.jsx';

const VANTAGENS = ['Pronta entrega', 'Leve e portátil', 'Cores disponíveis', 'Ideal para passeios'];

export default function Catalogo() {
  const { produtos, carregando, erro, recarregar } = useProdutos();
  const { hash } = useLocation();

  // Link "/#produtos" vindo de outra página: rola até a seção depois que os produtos carregam.
  useEffect(() => {
    if (hash && !carregando) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash, carregando]);

  return (
    <>
      <section className="hero">
        <div className="conteudo hero-in">
          <div className="hero-texto">
            <p className="selo">Catálogo para lojistas</p>
            <h1>Saquinhos higiênicos e acessórios para passeio com pets</h1>
            <p>
              Escolha os produtos e as quantidades, envie o pedido e um vendedor entra em contato para combinar frete e
              pagamento.
            </p>
            <a href="#produtos" className="botao botao-grande">
              Ver produtos
            </a>
          </div>
          <div className="hero-foto">
            <img src="/produtos/rfs-sup-verde.webp" alt="Kit porta-saquinhos Rufus" width="900" height="900" />
          </div>
        </div>
      </section>

      <ul className="vantagens conteudo" aria-label="Vantagens">
        {VANTAGENS.map((v) => (
          <li key={v}>
            <Pata className="icone-pata" />
            {v}
          </li>
        ))}
      </ul>

      <section id="produtos" className="conteudo produtos" aria-labelledby="titulo-produtos">
        <h2 id="titulo-produtos">
          <Pata className="icone-pata" /> Saquinhos higiênicos e potes dobráveis
        </h2>

        {carregando && <p className="aviso">Carregando produtos…</p>}
        {erro && (
          <div className="aviso">
            <p>Não foi possível carregar os produtos.</p>
            <button type="button" className="botao" onClick={recarregar}>
              Tentar de novo
            </button>
          </div>
        )}
        {!carregando && !erro && (
          <div className="grade">
            {produtos.map((p, i) => (
              <CardProduto key={p.grupo ?? p.sku} produto={p} prioridade={i < 2} />
            ))}
          </div>
        )}
        <p className="nota">Preços por unidade. Valores confirmados pelo vendedor no fechamento do pedido.</p>
      </section>
    </>
  );
}
