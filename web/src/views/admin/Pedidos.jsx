import { Fragment, useEffect, useState } from 'react';
import { adminListarPedidos, adminAtualizarPedido, adminReenviarEmails } from '../../lib/api.js';
import { brl } from '../../lib/formato.js';
import { useLoja } from '../../lib/dadosLoja.jsx';
import { linkWhatsApp, mensagemLojaParaCliente } from '../../lib/whatsapp.js';

const STATUS_OPCOES = ['novo', 'confirmado', 'faturado', 'cancelado'];

function formatarDocumento(doc) {
  const d = String(doc ?? '');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function formatarData(iso) {
  return new Date(iso).toLocaleString('pt-BR');
}

export default function Pedidos() {
  const loja = useLoja();
  const [dados, setDados] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [expandido, setExpandido] = useState(null);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState({});
  const [reenvio, setReenvio] = useState({}); // por pedido: { enviando, mensagem, erro }

  useEffect(() => {
    adminListarPedidos({ pagina, busca: buscaAplicada })
      .then(setDados)
      .catch((err) => setErro(err.message));
  }, [pagina, buscaAplicada]);

  async function aplicarPatch(pedido, campos) {
    setSalvando((atual) => ({ ...atual, [pedido.id]: true }));
    setErro(null);
    try {
      const atualizado = await adminAtualizarPedido(pedido.id, campos);
      setDados((atual) => ({
        ...atual,
        pedidos: atual.pedidos.map((p) => (p.id === pedido.id ? { ...p, ...atualizado, itens: p.itens } : p)),
      }));
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando((atual) => ({ ...atual, [pedido.id]: false }));
    }
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

  return (
    <>
      <h1 className="sec-title">Pedidos</h1>

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
            className="expandir"
            style={{ width: 'auto', padding: '0 10px', height: 38 }}
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

      {erro && <p className="alerta-erro">{erro}</p>}
      {dados.emailConfigurado === false && (
        <p className="alerta-erro">
          O envio de e-mail não está configurado no servidor (SMTP no .env da API). Os pedidos são gravados, mas os avisos
          por e-mail não saem.
        </p>
      )}

      {dados.pedidos.length === 0 && (
        <p className="vazio">{buscaAplicada ? `Nenhum pedido encontrado para "${buscaAplicada}".` : 'Nenhum pedido ainda.'}</p>
      )}

      {dados.pedidos.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="tabela-admin">
            <thead>
              <tr>
                <th />
                <th>Número / código do cliente</th>
                <th>Cliente (nome/razão social)</th>
                <th>Contato</th>
                <th>Total</th>
                <th>Status</th>
                <th>Criado em</th>
              </tr>
            </thead>
            <tbody>
              {dados.pedidos.map((pedido) => (
                <Fragment key={pedido.id}>
                  <tr className={salvando[pedido.id] ? 'salvando' : ''}>
                    <td>
                      <button
                        type="button"
                        className="expandir"
                        onClick={() => setExpandido((atual) => (atual === pedido.id ? null : pedido.id))}
                      >
                        {expandido === pedido.id ? '−' : '+'}
                      </button>
                    </td>
                    <td className="mono">
                      {pedido.numero}
                      <br />
                      <span className="codigo-cliente" title="Código mostrado ao cliente">
                        {pedido.codigo_publico}
                      </span>
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
                      {pedido.nome_fantasia || pedido.razao_social || <span className="pdesc">Não informada</span>}
                      {(pedido.cnpj || pedido.cidade || pedido.uf) && (
                        <>
                          <br />
                          <span className="pdesc">
                            {[formatarDocumento(pedido.cnpj), [pedido.cidade, pedido.uf].filter(Boolean).join('/')]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </>
                      )}
                    </td>
                    <td>
                      {pedido.contato_nome}
                      <br />
                      <span className="pdesc">
                        {[pedido.contato_email, pedido.contato_whatsapp].filter(Boolean).join(' · ')} · prefere{' '}
                        {pedido.canal_preferido === 'email' ? 'e-mail' : 'WhatsApp'}
                      </span>
                      {linkWhatsApp(pedido.contato_whatsapp) && (
                        <>
                          <br />
                          <a
                            className="link-whatsapp mono"
                            href={linkWhatsApp(pedido.contato_whatsapp, mensagemLojaParaCliente(pedido, loja.nome))}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Falar no WhatsApp ↗
                          </a>
                        </>
                      )}
                    </td>
                    <td className="mono">{brl(pedido.valor_total)}</td>
                    <td>
                      <select value={pedido.status} onChange={(e) => aplicarPatch(pedido, { status: e.target.value })}>
                        {STATUS_OPCOES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="mono">{formatarData(pedido.criado_em)}</td>
                  </tr>

                  {expandido === pedido.id && (
                    <tr>
                      <td colSpan={7}>
                        <table className="tabela-itens">
                          <thead>
                            <tr>
                              <th>SKU</th>
                              <th>Item</th>
                              <th>Qtd</th>
                              <th>Preço un.</th>
                              <th>Subtotal</th>
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
                                <td className="mono">{item.quantidade}</td>
                                <td className="mono">{brl(item.preco_unitario_snapshot)}</td>
                                <td className="mono">{brl(item.valor_item)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        <div className="form-campo" style={{ marginTop: 12, maxWidth: 420 }}>
                          <label htmlFor={`obs-${pedido.id}`}>Observações</label>
                          <input
                            id={`obs-${pedido.id}`}
                            type="text"
                            key={`obs-${pedido.id}-${pedido.observacoes ?? ''}`}
                            defaultValue={pedido.observacoes ?? ''}
                            onBlur={(e) => {
                              if (e.target.value !== (pedido.observacoes ?? '')) {
                                aplicarPatch(pedido, { observacoes: e.target.value });
                              }
                            }}
                          />
                        </div>

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
                                      {e.status === 'enviado' && e.enviado_em
                                        ? formatarData(e.enviado_em)
                                        : e.ultimo_erro || (e.status === 'pendente' ? 'ainda não enviado' : '')}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p className="pdesc">Nenhum e-mail registrado para este pedido.</p>
                          )}
                          <div className="emails-acoes">
                            <button
                              type="button"
                              className="cta-primario"
                              disabled={reenvio[pedido.id]?.enviando}
                              onClick={() => reenviar(pedido)}
                            >
                              {reenvio[pedido.id]?.enviando ? 'Enviando…' : 'Reenviar e-mails'}
                            </button>
                            {reenvio[pedido.id]?.mensagem && <span className="email-ok">{reenvio[pedido.id].mensagem}</span>}
                            {reenvio[pedido.id]?.erro && <span className="email-erro">{reenvio[pedido.id].erro}</span>}
                          </div>
                          <p className="pdesc">
                            Reenvia o aviso para os e-mails atuais de admin → Loja e, se o cliente preferiu e-mail, a
                            confirmação para ele.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
        <button type="button" className="cta-primario" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
          ← Anterior
        </button>
        <span className="mono">
          Página {pagina} de {totalPaginas}
        </span>
        <button
          type="button"
          className="cta-primario"
          disabled={pagina >= totalPaginas}
          onClick={() => setPagina((p) => p + 1)}
        >
          Próxima →
        </button>
      </div>
    </>
  );
}
