import { Link, Navigate, useLocation } from 'react-router-dom';
import { brl } from '../lib/formato.js';
import { loja } from '../lib/loja.js';

export default function Confirmacao() {
  const { state } = useLocation();

  if (!state?.numero) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="conteudo pagina sucesso">
      <div className="sucesso-icone" aria-hidden="true">
        ✓
      </div>
      <h1>Pedido enviado!</h1>
      <p>
        Número do pedido: <b>{state.numero}</b>
      </p>
      <p className="sucesso-valor">{brl(state.valorTotal)}</p>
      <p>Recebemos seu pedido. Um vendedor entrará em contato em breve para combinar frete e forma de pagamento.</p>
      {loja.telefone && <p>Se preferir, fale com a gente: {loja.telefone}</p>}
      <Link to="/" className="botao">
        Voltar ao catálogo
      </Link>
    </div>
  );
}
