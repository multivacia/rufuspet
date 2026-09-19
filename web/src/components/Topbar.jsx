import { Link } from 'react-router-dom';
import { useCarrinho } from '../lib/carrinho.jsx';

export default function Topbar() {
  const { totalItens } = useCarrinho();

  return (
    <header className="topbar">
      <div className="topbar-in">
        <Link to="/" className="topbar-brand">
          <span className="brand-name">Ruf<i>u</i>s</span>
          <span className="brand-sub">Distribuidora</span>
        </Link>
        <Link to="/carrinho" className="carrinho-link">
          Carrinho
          {totalItens > 0 && <span className="carrinho-badge">{totalItens}</span>}
        </Link>
      </div>
    </header>
  );
}
