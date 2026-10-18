import { Link } from 'react-router-dom';
import { useCarrinho } from '../lib/carrinho.jsx';
import { useLoja } from '../lib/dadosLoja.jsx';
import { Logo } from './Logo.jsx';

export default function Topbar() {
  const loja = useLoja();
  const { totalItens } = useCarrinho();

  return (
    <header className="cabecalho">
      <div className="conteudo cabecalho-in">
        <Link to="/" aria-label={`${loja.nome} — início`}>
          <Logo nome={loja.nome} />
        </Link>
        <Link to="/pedido" className="cabecalho-pedido">
          Meu pedido
          {totalItens > 0 && <span className="contador">{totalItens}</span>}
        </Link>
      </div>
    </header>
  );
}
