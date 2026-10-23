import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  adminAtualizarPedido,
  adminEstoqueSaldos,
  adminListarPedidos,
  adminListarProdutos,
  adminReenviarEmails,
  adminVendedores,
} from '../../lib/api.js';
import { brl, formatarDocumento, ROTULO_STATUS } from '../../lib/formato.js';
import { useLoja } from '../../lib/dadosLoja.jsx';
import { linkWhatsApp, mensagemLojaParaCliente } from '../../lib/whatsapp.js';
import EditorItens, { itensParaApi, itensParaEdicao } from '../../components/admin/EditorItens.jsx';
import VincularCliente from '../../components/admin/VincularCliente.jsx';

const STATUS_OPCOES = ['novo', 'confirmado', 'faturado', 'cancelado'];
const COM_BAIXA = new Set(['confirmado', 'faturado']);
const FASES = [
  ['solicitacoes', 'Solicitações'],
  ['pedidos', 'Pedidos'],
  ['cancelados', 'Cancelados'],
  ['', 'Todos'],
];

function formatarData(iso) {
  return new Date(iso).toLocaleString('pt-BR');
}

export default function Pedidos() {
  const loja = useLoja();
  const [dados, setDados] = useState(null);
  const [fase, setFase] = useState('solicitacoes');
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [expandido, setExpandido] = useState(null);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState({});
  const [erroPedido, setErroPedido] = useState({});
  const [reenvio, setReenvio] = useState({});
  const [produtos, setProdutos] = useState([]);
  const [saldos, setSaldos] = useState(new Map());
  const [vendedores, setVendedores] = useState([]);
  const [vinculando, setVinculando] = useState(null); // { pedidoId, status? }
  const [edicao, setEdicao] = useState(null); // { pedidoId, itens }

  const carregar = useCallback(async () => {
    try {
      const [lista, est, vend] = await Promise.all([
        adminListarPedidos({ pagina, busca: buscaAplicada, fase }),
        adminEstoqueSaldos(),
        adminVendedores(),
      ]);
      setDados(lista);
      setSaldos(new Map(est.saldos.map((s) => [s.sku, s.saldo])));
      setVendedores(vend.vendedores);
    } catch (err) {
      setErro(err.message);
    }
  }, [pagina, buscaAplicada, fase]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    adminListarProdutos().then(setProdutos).catch(() => {});
  }, []);

  async function aplicarPatch(pedido, campos) {
    setSalvando((a) => ({ ...a, [pedido.id]: true }));
    setErroPedido((a) => ({ ...a, [pedido.id]: null }));
    try {
      await adminAtualizarPedido(pedido.id, campos);
      await carregar();
      return true;
    } catch (err) {
      setErroPedido((a) => ({ ...a, [pedido.id]: err.message }));
      throw err;
    } finally {
      setSalvando((a) => ({ ...a, [pedido.id]: false }));
    }
  }

  function mudarStatus(pedido, status) {
    if (COM_BAIXA.has(status) && !pedido.cliente_id) {
      // Sem lastro não confirma: abre o vínculo e grava cliente + status juntos.
      setExpandido(pedido.id);
      setVinculando({ pedidoId: pedido.id, status });
      return;
    }
    aplicarPatch(pedido, { status }).catch(() => {});
  }

  async function reenviar(pedido) {
    setReenvio((r) => ({ ...r, [pedido.id]: { enviando: true } }));
    try {
      const { emails } = await adminReenviarEmails(pedido.id);
      setDados((atual) => ({ ...atual, pedidos: atual.pedidos.map((p) => (p.id === pedido.id ? { ...p, emails } : p)) }));
      const falhas = emails.filter((e) => e.status === 'falhou').length;
      setReenvio((r) => ({
        ...r,
        [pedido.id]: falhas
          ? { erro: `${falhas} e-mail(s) falharam — veja o motivo abaixo.` }
          : { mensagem: emails.length ? `✓ ${emails.length} e-mail(s) enviado(s).` : 'Nenhum destinatário configurado (admin → Loja).' },
      }));
    } catch (err) {
      setReenvio((r) => ({ ...r, [pedido.id]: { erro: err.message } }));
    }
  }

  if (erro && !dados) return <p className="alerta-erro">{erro}</p>;
  if (!dados) return <p className="vazio">Carregando…</p>;

  const totalPaginas = Math.max(1, Math.ceil(dados.total / dados.porPagina));
  const contagem = dados.contagem ?? {};

  return (
    <>
      <div className="titulo-acoes">
        <h1 className="sec-title" style={{ margin: 0 }}>
          Pedidos
        </h1>
        <Link to="/admin/pedidos/novo" className="cta-primario">
          + Novo pedido
        </Link>
      </div>

      <nav className="fases" aria-label="Fase">
        {FASES.map(([valor, rotulo]) => (
          <button
            key={valor}
            type="button"
            className={fase === valor ? 'on' : ''}
            onClick={() => {
              setFase(valor);
              setPagina(1);
              setExpandido(null);
            }}
          >
            {rotulo}
            {valor === 'solicitacoes' && contagem.solicitacoes > 0 && <span className="contador">{contagem.solicitacoes}</span>}
            {valor === 'pedidos' && contagem.pedidos > 0 && <span className="contador neutro">{contagem.pedidos}</span>}
          </button>
        ))}
      </nav>

      <form
        className="busca-pedidos"
        onSubmit={(e) => {
          e.preventDefault();
          setPagina(1);
          setBuscaAplicada(busca.trim());
        }}
      >
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Código do cliente (RF-2010-K7Q), número ou nome"
          aria-label="Buscar pedido"
        />
        <button type="submit" className="cta-primario">
          Buscar
        </button>
        {buscaAplicada && (
          <button
            type="button"
            className="botao-sec"
            onClick={() => {
              setBusca('');
              setPagina(1);
              setBuscaAplicada('');
            }}
          >
            limpar
          </button>
        )}
      </form>

      {contagem.sem_cliente > 0 && (
        <p className="alerta-aviso">
          {contagem.sem_cliente} pedido(s) confirmado(s)/faturado(s) sem cliente vinculado — abra cada um (+) e use “Vincular cliente”.
        </p>
      )}
      {dados.emailConfigurado === false && (
        <p className="alerta-erro">
          O envio de e-mail não está configurado no servidor (SMTP no .env da API). Os pedidos são gravados, mas os avisos
          por e-mail não saem.
        </p>
      )}

      {dados.pedidos.length === 0 && (
        <p className="vazio">{buscaAplicada ? `Nada encontrado para "${buscaAplicada}".` : 'Nada por aqui.'}</p>
      )}

      {dados.pedidos.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="tabela-admin tabela-larga">
            <thead>
              <tr>
                <th />
                <th>Número / código</th>
                <th>Cliente</th>
                <th>Contato</th>
                <th className="num">Total</th>
                <th>Situação</th>
                <th>Criado em</th>
              </tr>
            </thead>
            <tbody>
              {dados.pedidos.map((pedido) => {
                const aberto = expandido === pedido.id;
                const comBaixa = COM_BAIXA.has(pedido.status);
                const editando = edicao?.pedidoId === pedido.id;
                return (
                  <Fragment key={pedido.id}>
                    <tr className={salvando[pedido.id] ? 'salvando' : ''}>
                      <td>
                        <button type="button" className="expandir" aria-label={aberto ? 'Fechar' : 'Abrir'} onClick={() => setExpandido((a) => (a === pedido.id ? null : pedido.id))}>
                          {aberto ? '−' : '+'}
                        </button>
                      </td>
                      <td className="mono">
                        {pedido.numero}
                        <br />
                        <span className="codigo-cliente" title="Código mostrado ao cliente">
                          {pedido.codigo_publico}
                        </span>
                        {pedido.origem === 'admin' && <span className="etiqueta"> admin</span>}
                        {pedido.emails?.some((e) => e.status === 'falhou') && (
                          <>
                            <br />
                            <span className="email-falhou" title="Abra o pedido (+) para ver e reenviar">
                              ⚠ e-mail falhou
                            </span>
                          </>
                        )}
                      </td>
                      <td>
                        {pedido.cliente_id ? (
                          <>
                            <Link to={`/admin/clientes/${pedido.cliente_id}`} className="link-produto">
                              {pedido.cliente_nome_fantasia || pedido.cliente_nome}
                            </Link>
                            {pedido.vendedor && (
                              <>
                                <br />
                                <span className="pdesc">vendedor: {pedido.vendedor}</span>
                              </>
                            )}
                          </>
                        ) : (
                          <>
                            {pedido.nome_fantasia || pedido.razao_social || <span className="pdesc">Não informada</span>}
                            {(pedido.cnpj || pedido.cidade || pedido.uf) && (
                              <>
                                <br />
                                <span className="pdesc">
                                  {[formatarDocumento(pedido.cnpj), [pedido.cidade, pedido.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ')}
                                </span>
                              </>
                            )}
                            <br />
                            <span className={`sem-cliente ${comBaixa ? 'grave' : ''}`}>sem cliente</span>
                          </>
                        )}
                      </td>
                      <td>
                        {pedido.contato_nome}
                        <br />
                        <span className="pdesc">
                          {[pedido.contato_email, pedido.contato_whatsapp].filter(Boolean).join(' · ')}
                          {pedido.origem === 'site' && ` · prefere ${pedido.canal_preferido === 'email' ? 'e-mail' : 'WhatsApp'}`}
                        </span>
                        {linkWhatsApp(pedido.contato_whatsapp) && (
                          <>
                            <br />
                            <a className="link-whatsapp mono" href={linkWhatsApp(pedido.contato_whatsapp, mensagemLojaParaCliente(pedido, loja.nome))} target="_blank" rel="noopener noreferrer">
                              Falar no WhatsApp ↗
                            </a>
                          </>
                        )}
                      </td>
                      <td className="num mono">{brl(pedido.valor_total)}</td>
                      <td>
                        <select value={pedido.status} onChange={(e) => mudarStatus(pedido, e.target.value)} aria-label="Situação">
                          {STATUS_OPCOES.map((s) => (
                            <option key={s} value={s}>
                              {ROTULO_STATUS[s]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="mono">{formatarData(pedido.criado_em)}</td>
                    </tr>

                    {erroPedido[pedido.id] && (
                      <tr>
                        <td colSpan={7}>
                          <p className="alerta-erro" style={{ margin: 0 }}>
                            {erroPedido[pedido.id]}
                          </p>
                        </td>
                      </tr>
                    )}

                    {aberto && (
                      <tr>
                        <td colSpan={7} className="detalhe-pedido">
                          {/* Cliente e vendedor */}
                          <div className="bloco-detalhe">
                            <p className="emails-titulo">Cliente e vendedor</p>
                            <div className="cliente-vendedor">
                              <div>
                                {pedido.cliente_id ? (
                                  <>
                                    <Link to={`/admin/clientes/${pedido.cliente_id}`} className="link-produto">
                                      {pedido.cliente_nome}
                                    </Link>
                                    {pedido.cliente_nome_fantasia && <span className="pdesc"> · {pedido.cliente_nome_fantasia}</span>}
                                  </>
                                ) : (
                                  <span className={`sem-cliente ${comBaixa ? 'grave' : ''}`}>sem cliente vinculado</span>
                                )}
                                {vinculando?.pedidoId !== pedido.id && (
                                  <button type="button" className="botao-sec" style={{ marginLeft: 10 }} onClick={() => setVinculando({ pedidoId: pedido.id })}>
                                    {pedido.cliente_id ? 'Trocar cliente' : 'Vincular cliente'}
                                  </button>
                                )}
                              </div>
                              <div className="form-campo campo-vendedor">
                                <label htmlFor={`vend-${pedido.id}`}>Vendedor</label>
                                <input
                                  id={`vend-${pedido.id}`}
                                  list="lista-vendedores"
                                  autoComplete="off"
                                  key={`vend-${pedido.id}-${pedido.vendedor}`}
                                  defaultValue={pedido.vendedor}
                                  maxLength={80}
                                  onBlur={(e) => {
                                    if (e.target.value.trim() !== pedido.vendedor) aplicarPatch(pedido, { vendedor: e.target.value }).catch(() => {});
                                  }}
                                />
                              </div>
                            </div>
                            {vinculando?.pedidoId === pedido.id && (
                              <VincularCliente
                                pedido={pedido}
                                vendedores={vendedores}
                                aviso={vinculando.status ? `Para mudar para "${ROTULO_STATUS[vinculando.status]}" é preciso vincular um cliente.` : null}
                                onCancelar={() => setVinculando(null)}
                                onEscolher={async (cliente) => {
                                  await aplicarPatch(pedido, { clienteId: cliente.id, ...(vinculando.status ? { status: vinculando.status } : {}) });
                                  setVinculando(null);
                                }}
                              />
                            )}
                          </div>

                          {/* Itens */}
                          <div className="bloco-detalhe">
                            <p className="emails-titulo">Itens</p>
                            {editando ? (
                              <>
                                <EditorItens
                                  itens={edicao.itens}
                                  onChange={(itens) => setEdicao({ pedidoId: pedido.id, itens })}
                                  produtos={produtos}
                                  saldos={saldos}
                                  proprio={pedido.estoque_baixado_em ? new Map(pedido.itens.map((i) => [i.sku, i.quantidade])) : new Map()}
                                  checarEstoque={comBaixa}
                                />
                                <div className="emails-acoes">
                                  <button
                                    type="button"
                                    className="cta-primario"
                                    disabled={salvando[pedido.id]}
                                    onClick={() =>
                                      aplicarPatch(pedido, { itens: itensParaApi(edicao.itens) })
                                        .then(() => setEdicao(null))
                                        .catch(() => {})
                                    }
                                  >
                                    Salvar itens
                                  </button>
                                  <button type="button" className="botao-sec" onClick={() => setEdicao(null)}>
                                    Cancelar
                                  </button>
                                  {comBaixa && <span className="pdesc">Pedido com baixa: o estoque é reprocessado ao salvar.</span>}
                                </div>
                              </>
                            ) : (
                              <>
                                <table className="tabela-itens">
                                  <thead>
                                    <tr>
                                      <th>SKU</th>
                                      <th>Item</th>
                                      <th className="num">Qtd</th>
                                      <th className="num">Preço un.</th>
                                      <th className="num">Subtotal</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {pedido.itens.map((item) => (
                                      <tr key={item.id}>
                                        <td className="mono">{item.sku}</td>
                                        <td>
                                          {item.nome_snapshot}
                                          {item.cor_snapshot ? ` (${item.cor_snapshot})` : ''}
                                        </td>
                                        <td className="num mono">{item.quantidade}</td>
                                        <td className="num mono">{brl(item.preco_unitario_snapshot)}</td>
                                        <td className="num mono">{brl(item.valor_item)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                <button type="button" className="botao-sec" onClick={() => setEdicao({ pedidoId: pedido.id, itens: itensParaEdicao(pedido.itens) })}>
                                  Editar itens
                                </button>
                              </>
                            )}
                            <p className="estoque-pedido">
                              <span className="emails-titulo">Estoque: </span>
                              {pedido.estoque_baixado_em ? (
                                <>
                                  baixado em {formatarData(pedido.estoque_baixado_em)} · custo <span className="mono">{brl(pedido.custo_estoque)}</span> · margem{' '}
                                  <span className="mono">
                                    {brl(Number(pedido.valor_total) - Number(pedido.custo_estoque ?? 0))}
                                    {Number(pedido.valor_total) > 0 &&
                                      ` (${(((Number(pedido.valor_total) - Number(pedido.custo_estoque ?? 0)) / Number(pedido.valor_total)) * 100).toFixed(1).replace('.', ',')}%)`}
                                  </span>
                                </>
                              ) : (
                                <span className="pdesc">sem baixa — baixa ao confirmar</span>
                              )}
                            </p>
                          </div>

                          <div className="form-campo" style={{ maxWidth: 520 }}>
                            <label htmlFor={`obs-${pedido.id}`}>Observações</label>
                            <input
                              id={`obs-${pedido.id}`}
                              type="text"
                              key={`obs-${pedido.id}-${pedido.observacoes ?? ''}`}
                              defaultValue={pedido.observacoes ?? ''}
                              onBlur={(e) => {
                                if (e.target.value !== (pedido.observacoes ?? '')) aplicarPatch(pedido, { observacoes: e.target.value }).catch(() => {});
                              }}
                            />
                          </div>

                          {pedido.origem === 'site' && (
                            <div className="emails-pedido">
                              <p className="emails-titulo">E-mails</p>
                              {pedido.emails?.length ? (
                                <table className="tabela-itens">
                                  <thead>
                                    <tr>
                                      <th>Para</th>
                                      <th>Tipo</th>
                                      <th>Situação</th>
                                      <th>Detalhe</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {pedido.emails.map((e) => (
                                      <tr key={e.id}>
                                        <td>{e.destino}</td>
                                        <td>{e.tipo === 'interno' ? 'aviso interno' : 'confirmação ao cliente'}</td>
                                        <td className={`email-status ${e.status}`}>{e.status}</td>
                                        <td className="pdesc">
                                          {e.status === 'enviado' && e.enviado_em ? formatarData(e.enviado_em) : e.ultimo_erro || (e.status === 'pendente' ? 'ainda não enviado' : '')}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : (
                                <p className="pdesc">Nenhum e-mail registrado para este pedido.</p>
                              )}
                              <div className="emails-acoes">
                                <button type="button" className="cta-primario" disabled={reenvio[pedido.id]?.enviando} onClick={() => reenviar(pedido)}>
                                  {reenvio[pedido.id]?.enviando ? 'Enviando…' : 'Reenviar e-mails'}
                                </button>
                                {reenvio[pedido.id]?.mensagem && <span className="email-ok">{reenvio[pedido.id].mensagem}</span>}
                                {reenvio[pedido.id]?.erro && <span className="email-erro">{reenvio[pedido.id].erro}</span>}
                              </div>
                              <p className="pdesc">
                                Reenvia o aviso para os e-mails atuais de admin → Loja e, se o cliente preferiu e-mail, a confirmação para ele.
                              </p>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <datalist id="lista-vendedores">
        {vendedores.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
        <button type="button" className="cta-primario" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
          ← Anterior
        </button>
        <span className="mono">
          Página {pagina} de {totalPaginas}
        </span>
        <button type="button" className="cta-primario" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>
          Próxima →
        </button>
      </div>
    </>
  );
}
