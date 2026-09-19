import { Link, Navigate, useLocation } from 'react-router-dom';
import { brl } from '../lib/formato.js';

export default function Confirmacao() {
  const { state } = useLocation();

  if (!state?.numero) {
    return <Navigate to="/" replace />;
  }

  return (
    <section className="sec wrap">
      <div className="confirmacao">
        <div className="selo">✓</div>
        <h1>Pedido confirmado!</h1>
        <p className="numero mono">{state.numero}</p>
        <p className="valor">{brl(state.valorTotal)}</p>
        <p style={{ marginTop: 18, color: 'var(--ink-soft)' }}>
          Em breve entramos em contato pra combinar frete e forma de pagamento.
        </p>
        <div style={{ marginTop: 28 }}>
          <Link to="/" className="cta-primario">
            Voltar ao catálogo
          </Link>
        </div>
      </div>
    </section>
  );
}
