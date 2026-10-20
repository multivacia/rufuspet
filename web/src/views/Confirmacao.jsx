import { Link, Navigate, useLocation } from 'react-router-dom';
import { brl } from '../lib/formato.js';
import { useLoja } from '../lib/dadosLoja.jsx';
import { linkWhatsApp, mensagemPedidoParaLoja } from '../lib/whatsapp.js';

export default function Confirmacao() {
  const loja = useLoja();
  const { state } = useLocation();

  if (!state?.codigo) {
    return <Navigate to="/" replace />;
  }

  const whatsapp = linkWhatsApp(loja.whatsapp, mensagemPedidoParaLoja(state));

  return (
    <div className="conteudo pagina sucesso">
      <div className="sucesso-icone" aria-hidden="true">
        ✓
      </div>
      <h1>Pedido enviado!</h1>
      <p>
        Código do pedido: <b>{state.codigo}</b>
      </p>
      <p className="sucesso-valor">{brl(state.valorTotal)}</p>
      <p>Recebemos seu pedido. Um vendedor entrará em contato em breve para combinar frete e forma de pagamento.</p>
      {whatsapp && (
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="botao botao-whatsapp">
          <IconeWhatsApp /> Enviar pedido pelo WhatsApp
        </a>
      )}
      {loja.telefone && <p>Se preferir, fale com a gente: {loja.telefone}</p>}
      <Link to="/" className={whatsapp ? 'link-continuar' : 'botao'}>
        Voltar ao catálogo
      </Link>
    </div>
  );
}

function IconeWhatsApp() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.1 5.1 0 0 0 1.1 2.7 11.7 11.7 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3Z" />
    </svg>
  );
}
