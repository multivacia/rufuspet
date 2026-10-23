import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { adminBuscarCliente, adminCriarPedido, adminEstoqueSaldos, adminListarClientes, adminListarProdutos, adminVendedores } from '../../lib/api.js';
import { formatarDocumento } from '../../lib/formato.js';
import EditorItens, { itensParaApi } from '../../components/admin/EditorItens.jsx';

/** Venda fora do site (telefone, WhatsApp, balcão). Nasce como pedido confirmado (com baixa) ou como solicitação. */
export default function NovoPedido() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [produtos, setProdutos] = useState([]);
  const [saldos, setSaldos] = useState(new Map());
  const [vendedores, setVendedores] = useState([]);
  const [busca, setBusca] = useState('');
  const [resultado, setResultado] = useState(null);
  const [cliente, setCliente] = useState(null);
  const [vendedor, setVendedor] = useState('');
  const [itens, setItens] = useState([{ sku: '', quantidade: '1', precoUnitario: '' }]);
  const [observacoes, setObservacoes] = useState('');
  const [status, setStatus] = useState('confirmado');
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    Promise.all([adminListarProdutos(), adminEstoqueSaldos(), adminVendedores()])
      .then(([p, e, v]) => {
        setProdutos(p);
        setSaldos(new Map(e.saldos.map((s) => [s.sku, s.saldo])));
        setVendedores(v.vendedores);
      })
      .catch((e) => setErro({ mensagem: e.message }));
    const id = params.get('cliente');
    if (id) adminBuscarCliente(id).then((f) => escolher(f.cliente)).catch(() => {});
  }, [params]);

  function escolher(c) {
    setCliente(c);
    setVendedor(c.vendedor || '');
    setResultado(null);
  }

  async function buscar(e) {
    e.preventDefault();
    try {
      setResultado((await adminListarClientes({ busca: busca.trim(), porPagina: 15 })).clientes.filter((c) => c.ativo));
    } catch (err) {
      setErro({ mensagem: err.message });
    }
  }

  async function enviar() {
    setEnviando(true);
    setErro(null);
    try {
      await adminCriarPedido({ clienteId: cliente?.id ?? null, vendedor, itens: itensParaApi(itens.filter((i) => i.sku)), observacoes, status });
      navigate('/admin/pedidos');
    } catch (err) {
      setErro({ mensagem: err.message, campo: err.campo });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <h1 className="sec-title">
        Novo pedido
        <small>Venda fora do site — telefone, WhatsApp ou balcão. Não envia e-mails.</small>
      </h1>

      <div className="bloco-detalhe">
        <p className="emails-titulo">1. Cliente</p>
        {cliente ? (
          <p>
            <strong>{cliente.nome}</strong>
            {cliente.nomeFantasia && <span className="pdesc"> · {cliente.nomeFantasia}</span>}
            <span className="pdesc mono"> {formatarDocumento(cliente.documento)}</span>
            <button type="button" className="botao-sec" style={{ marginLeft: 10 }} onClick={() => setCliente(null)}>
              trocar
            </button>
          </p>
        ) : (
          <>
            <form className="busca-pedidos" onSubmit={buscar}>
              <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, CPF/CNPJ, WhatsApp… (vazio lista todos)" aria-label="Buscar cliente" />
              <button type="submit" className="cta-primario">
                Buscar
              </button>
              <Link to="/admin/clientes/novo" className="botao-sec">
                novo cliente
              </Link>
            </form>
            {resultado && (
              resultado.length ? (
                <ul className="vinc-lista">
                  {resultado.map((c) => (
                    <li key={c.id} className="vinc-linha">
                      <div>
                        <strong>{c.nome}</strong>
                        {c.nomeFantasia && <span className="pdesc"> · {c.nomeFantasia}</span>}
                        <br />
                        <span className="pdesc mono">{[formatarDocumento(c.documento), c.comprador, [c.cidade, c.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ')}</span>
                      </div>
                      <button type="button" className="cta-primario" onClick={() => escolher(c)}>
                        Escolher
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="pdesc">Nenhum cliente ativo encontrado.</p>
              )
            )}
          </>
        )}
        <div className="form-campo campo-vendedor">
          <label htmlFor="np-vendedor">Vendedor</label>
          <input id="np-vendedor" list="np-vendedores" autoComplete="off" value={vendedor} onChange={(e) => setVendedor(e.target.value)} maxLength={80} />
          <datalist id="np-vendedores">
            {vendedores.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="bloco-detalhe">
        <p className="emails-titulo">2. Itens</p>
        <EditorItens itens={itens} onChange={setItens} produtos={produtos} saldos={saldos} checarEstoque={status !== 'novo'} />
      </div>

      <div className="bloco-detalhe">
        <p className="emails-titulo">3. Fechamento</p>
        <div className="estoque-linha estoque-linha-2">
          <div className="form-campo">
            <label htmlFor="np-obs">Observações</label>
            <input id="np-obs" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} maxLength={1000} />
          </div>
          <div className="form-campo">
            <label htmlFor="np-status">Situação</label>
            <select id="np-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="confirmado">Pedido confirmado (baixa estoque)</option>
              <option value="novo">Solicitação (sem baixa)</option>
            </select>
          </div>
        </div>
        {erro && <p className="alerta-erro">{erro.mensagem}</p>}
        <div className="emails-acoes">
          <button type="button" className="cta-primario" disabled={enviando} onClick={enviar}>
            {enviando ? 'Gravando…' : 'Gravar pedido'}
          </button>
          <Link to="/admin/pedidos" className="botao-sec">
            Cancelar
          </Link>
        </div>
      </div>
    </>
  );
}
