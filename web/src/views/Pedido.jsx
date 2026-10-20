import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCarrinho } from '../lib/carrinho.jsx';
import { useProdutos } from '../lib/produtos.jsx';
import { criarPedido } from '../lib/api.js';
import { brl } from '../lib/formato.js';
import { UFS, mascaraDocumento, mascaraTelefone } from '../lib/loja.js';
import Quantidade from '../components/Quantidade.jsx';
import { useLoja } from '../lib/dadosLoja.jsx';

const VAZIO = {
  razaoSocial: '',
  nomeFantasia: '',
  cnpj: '',
  cidade: '',
  uf: '',
  nome: '',
  whatsapp: '',
  email: '',
  canalPreferido: 'whatsapp',
  observacoes: '',
};

export default function Pedido() {
  const { itens, idempotencyKey, alterarQuantidade, removerItem, limparCarrinho, renovarIdempotencyKey } = useCarrinho();
  const { itensPorSku, carregando } = useProdutos();
  const { pedidoMinimo } = useLoja();
  const navigate = useNavigate();
  const [dados, setDados] = useState(VAZIO);
  const [aceite, setAceite] = useState(false);
  const [website, setWebsite] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const pedidoEnviadoRef = useRef(false);

  // Itens que saíram do catálogo (inativados) não entram no pedido.
  const linhas = Object.entries(itens)
    .map(([sku, quantidade]) => ({ sku, quantidade, produto: itensPorSku.get(sku) }))
    .filter((l) => l.produto);
  const totalUnidades = linhas.reduce((s, l) => s + l.quantidade, 0);
  const total = linhas.reduce((s, l) => s + l.produto.precoUnitario * l.quantidade, 0);
  // Centavos para a comparação não falhar por arredondamento (ex.: 149,99999).
  const falta = Math.max(0, Math.round(pedidoMinimo * 100) - Math.round(total * 100)) / 100;

  const campo = (nome, mascara) => ({
    id: nome,
    name: nome,
    value: dados[nome],
    'aria-invalid': erro?.campo?.endsWith(`.${nome}`) || undefined,
    onChange: (e) => setDados((d) => ({ ...d, [nome]: mascara ? mascara(e.target.value) : e.target.value })),
  });
  const erroDe = (nome) => erro?.campo?.endsWith(`.${nome}`) && <span className="erro-campo">{erro.mensagem}</span>;

  async function enviar(e) {
    e.preventDefault();
    setErro(null);
    if (!aceite) {
      setErro({ mensagem: 'É necessário autorizar o contato.', campo: '.aceite' });
      return;
    }
    setEnviando(true);
    try {
      const resultado = await criarPedido({
        idempotencyKey: idempotencyKey ?? renovarIdempotencyKey(),
        cliente: {
          razaoSocial: dados.razaoSocial,
          nomeFantasia: dados.nomeFantasia,
          cnpj: dados.cnpj,
          cidade: dados.cidade,
          uf: dados.uf,
        },
        contato: { nome: dados.nome, email: dados.email, whatsapp: dados.whatsapp, canalPreferido: dados.canalPreferido },
        itens: linhas.map((l) => ({ sku: l.sku, quantidade: l.quantidade })),
        observacoes: dados.observacoes,
        aceite,
        website,
      });
      pedidoEnviadoRef.current = true;
      limparCarrinho();
      renovarIdempotencyKey();
      navigate('/pedido/enviado', {
        state: {
          ...resultado,
          empresa: dados.nomeFantasia || dados.razaoSocial,
          nome: dados.nome,
          itens: linhas.map((l) => ({
            quantidade: l.quantidade,
            nome: l.produto.nome,
            cor: l.produto.cor,
            precoUnitario: l.produto.precoUnitario,
          })),
        },
        replace: true,
      });
    } catch (err) {
      setErro({ mensagem: err.message || 'Não foi possível enviar o pedido. Tente novamente.', campo: err.campo });
    } finally {
      setEnviando(false);
    }
  }

  if (carregando) return <p className="aviso conteudo">Carregando pedido…</p>;

  if (linhas.length === 0 && !pedidoEnviadoRef.current) {
    return (
      <div className="conteudo pagina">
        <h1>Meu pedido</h1>
        <div className="aviso">
          <p>Seu pedido ainda está vazio.</p>
          <Link to="/#produtos" className="botao">
            Ver produtos
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="conteudo pagina">
      <h1>Meu pedido</h1>
      <div className="checkout">
        <section aria-labelledby="titulo-itens" className="painel">
          <h2 id="titulo-itens">Itens do pedido</h2>
          <ul className="itens">
            {linhas.map(({ sku, quantidade, produto }) => (
              <li key={sku} className="item">
                <img src={produto.imagem} alt="" width="72" height="72" />
                <div className="item-info">
                  <p className="item-nome">{produto.nome}</p>
                  {produto.cor && <p className="item-sub">Cor: {produto.cor}</p>}
                  <p className="item-sub">{brl(produto.precoUnitario)} / un.</p>
                </div>
                <div className="item-acoes">
                  <Quantidade valor={quantidade} aoMudar={(q) => alterarQuantidade(sku, q)} rotulo={`Quantidade de ${produto.nome}`} />
                  <p className="item-subtotal">{brl(produto.precoUnitario * quantidade)}</p>
                  <button type="button" className="link-remover" onClick={() => removerItem(sku)}>
                    Remover
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="total">
            <span>
              Total estimado ({totalUnidades} {totalUnidades === 1 ? 'unidade' : 'unidades'})
            </span>
            <b>{brl(total)}</b>
          </div>
          {pedidoMinimo > 0 && (
            <p className={falta > 0 ? 'aviso-minimo' : 'aviso-minimo ok'} role="status">
              {falta > 0 ? (
                <>
                  Pedido mínimo: <b>{brl(pedidoMinimo)}</b>. Faltam <b>{brl(falta)}</b> para enviar.
                </>
              ) : (
                <>✓ Pedido mínimo de {brl(pedidoMinimo)} atingido.</>
              )}
            </p>
          )}
          <Link to="/#produtos" className="link-continuar">
            ← Continuar escolhendo
          </Link>
        </section>

        <form onSubmit={enviar} className="painel formulario" noValidate>
          <h2>Seus dados</h2>
          <p className="ajuda">
            Não há pagamento pelo site. Basta seu nome e um contato: um vendedor fala com você para confirmar o pedido.
          </p>

          <div className="grade-campos">
            <label className="campo largo">
              Seu nome *
              <input {...campo('nome')} required autoComplete="name" />
              {erroDe('nome')}
            </label>
            <label className="campo">
              WhatsApp
              <input {...campo('whatsapp', mascaraTelefone)} type="tel" autoComplete="tel" placeholder="(00) 00000-0000" />
              {erroDe('whatsapp')}
            </label>
            <label className="campo">
              E-mail
              <input {...campo('email')} type="email" autoComplete="email" />
              {erroDe('email')}
            </label>
            <p className="campo largo nota-campo">* Informe pelo menos um contato: WhatsApp ou e-mail.</p>
            <fieldset className="campo largo canal">
              <legend>Prefere ser contatado por</legend>
              {[
                ['whatsapp', 'WhatsApp'],
                ['email', 'E-mail'],
              ].map(([valor, rotulo]) => (
                <label key={valor} className={dados.canalPreferido === valor ? 'on' : ''}>
                  <input
                    type="radio"
                    name="canalPreferido"
                    value={valor}
                    checked={dados.canalPreferido === valor}
                    onChange={() => setDados((d) => ({ ...d, canalPreferido: valor }))}
                  />
                  {rotulo}
                </label>
              ))}
            </fieldset>
          </div>

          <h3 className="subtitulo-form">
            Dados para o pedido <span>(opcional — pessoa física ou empresa; o vendedor pode completar depois)</span>
          </h3>
          <div className="grade-campos">
            <label className="campo largo">
              Nome / Razão social
              <input {...campo('razaoSocial')} autoComplete="organization" />
              {erroDe('razaoSocial')}
            </label>
            <label className="campo">
              Nome fantasia
              <input {...campo('nomeFantasia')} />
            </label>
            <label className="campo">
              CPF / CNPJ
              <input {...campo('cnpj', mascaraDocumento)} inputMode="numeric" placeholder="CPF ou CNPJ" />
              {erroDe('cnpj')}
            </label>
            <label className="campo">
              Cidade
              <input {...campo('cidade')} autoComplete="address-level2" />
              {erroDe('cidade')}
            </label>
            <label className="campo">
              UF
              <select {...campo('uf')}>
                <option value="">Selecione</option>
                {UFS.map((uf) => (
                  <option key={uf}>{uf}</option>
                ))}
              </select>
              {erroDe('uf')}
            </label>
            <label className="campo largo">
              Observações
              <textarea {...campo('observacoes')} rows={3} maxLength={1000} placeholder="Ex.: melhor horário para contato, prazo desejado…" />
            </label>
          </div>

          <label className="armadilha" aria-hidden="true">
            Não preencha
            <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </label>

          <label className="aceite">
            <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
            <span>Autorizo o uso destes dados para contato sobre este pedido, conforme a LGPD. *</span>
          </label>

          {erro && (
            <p className="erro" role="alert">
              {erro.mensagem}
            </p>
          )}

          <button type="submit" className="botao botao-grande" disabled={enviando || falta > 0}>
            {enviando ? 'Enviando…' : falta > 0 ? `Faltam ${brl(falta)} para o pedido mínimo` : 'Enviar pedido'}
          </button>
        </form>
      </div>
    </div>
  );
}
