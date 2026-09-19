import { useRef, useState } from 'react';
import { Navigate, useNavigate, Link } from 'react-router-dom';
import { useCarrinho } from '../lib/carrinho.jsx';
import { useProdutos } from '../lib/produtos.jsx';
import { criarPedido } from '../lib/api.js';
import { brl } from '../lib/formato.js';

export default function Checkout() {
  const { itens, idempotencyKey, limparCarrinho, renovarIdempotencyKey } = useCarrinho();
  const { itensPorSku } = useProdutos();
  const navigate = useNavigate();

  const [contato, setContato] = useState({ nome: '', email: '', whatsapp: '', canalPreferido: 'whatsapp' });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  // limparCarrinho() esvazia o carrinho como parte do próprio envio bem-sucedido;
  // sem essa flag, o re-render nesse instante acha o carrinho vazio e essa guarda
  // redireciona pro /carrinho numa corrida com o navigate('/confirmacao') abaixo.
  const pedidoEnviadoRef = useRef(false);

  const skus = Object.keys(itens);

  if (skus.length === 0 && !pedidoEnviadoRef.current) {
    return <Navigate to="/carrinho" replace />;
  }

  const total = skus.reduce((soma, sku) => {
    const produto = itensPorSku.get(sku);
    return produto ? soma + produto.precoCaixa * itens[sku] : soma;
  }, 0);

  function atualizarCampo(campo, valor) {
    setContato((atual) => ({ ...atual, [campo]: valor }));
  }

  async function handleSubmit(evento) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    try {
      const resultado = await criarPedido({
        idempotencyKey,
        contato,
        itens: skus.map((sku) => ({ sku, quantidadeCaixas: itens[sku] })),
      });

      pedidoEnviadoRef.current = true;
      limparCarrinho();
      renovarIdempotencyKey();
      navigate('/confirmacao', { state: resultado, replace: true });
    } catch (err) {
      setErro(err.message || 'Não deu pra confirmar o pedido. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="sec wrap">
      <div className="pagina-topo">
        <Link to="/carrinho" className="voltar">
          ← Voltar ao carrinho
        </Link>
        <h1>Checkout</h1>
      </div>

      {erro && <p className="alerta-erro">{erro}</p>}

      <form onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
        <div className="form-campo">
          <label htmlFor="nome">Nome</label>
          <input
            id="nome"
            type="text"
            required
            minLength={3}
            value={contato.nome}
            onChange={(e) => atualizarCampo('nome', e.target.value)}
          />
        </div>

        <div className="form-campo">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            required
            value={contato.email}
            onChange={(e) => atualizarCampo('email', e.target.value)}
          />
        </div>

        <div className="form-campo">
          <label htmlFor="whatsapp">WhatsApp</label>
          <input
            id="whatsapp"
            type="tel"
            required
            placeholder="(11) 91234-5678"
            value={contato.whatsapp}
            onChange={(e) => atualizarCampo('whatsapp', e.target.value)}
          />
        </div>

        <div className="form-campo">
          <label>Prefiro ser avisado por</label>
          <div className="canal-opcoes">
            <label className={`canal-opcao ${contato.canalPreferido === 'whatsapp' ? 'on' : ''}`}>
              <input
                type="radio"
                name="canalPreferido"
                value="whatsapp"
                checked={contato.canalPreferido === 'whatsapp'}
                onChange={() => atualizarCampo('canalPreferido', 'whatsapp')}
              />
              WhatsApp
            </label>
            <label className={`canal-opcao ${contato.canalPreferido === 'email' ? 'on' : ''}`}>
              <input
                type="radio"
                name="canalPreferido"
                value="email"
                checked={contato.canalPreferido === 'email'}
                onChange={() => atualizarCampo('canalPreferido', 'email')}
              />
              E-mail
            </label>
          </div>
        </div>

        <div className="resumo">
          <div className="resumo-linha total">
            <span>Total</span>
            <span className="valor">{brl(total)}</span>
          </div>
        </div>

        <div style={{ marginTop: 18, textAlign: 'right' }}>
          <button type="submit" className="cta-primario" disabled={enviando}>
            {enviando ? 'Confirmando…' : 'Confirmar pedido'}
          </button>
        </div>
      </form>
    </section>
  );
}
