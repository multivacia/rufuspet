import { Fragment, useEffect, useState } from 'react';
import { adminListarPedidos, adminAtualizarPedido } from '../../lib/api.js';
import { brl } from '../../lib/formato.js';

const STATUS_OPCOES = ['novo', 'confirmado', 'faturado', 'cancelado'];

function formatarData(iso) {
  return new Date(iso).toLocaleString('pt-BR');
}

export default function Pedidos() {
  const [dados, setDados] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [expandido, setExpandido] = useState(null);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState({});

  useEffect(() => {
    adminListarPedidos({ pagina })
      .then(setDados)
      .catch((err) => setErro(err.message));
  }, [pagina]);

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

  if (erro && !dados) return <p className="alerta-erro">{erro}</p>;
  if (!dados) return <p className="vazio">Carregando…</p>;

  const totalPaginas = Math.max(1, Math.ceil(dados.total / dados.porPagina));

  return (
    <>
      <h1 className="sec-title">Pedidos</h1>

      {erro && <p className="alerta-erro">{erro}</p>}

      {dados.pedidos.length === 0 && <p className="vazio">Nenhum pedido ainda.</p>}

      {dados.pedidos.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="tabela-admin">
            <thead>
              <tr>
                <th />
                <th>Número</th>
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
                    <td className="mono">{pedido.numero}</td>
                    <td>
                      {pedido.contato_nome}
                      <br />
                      <span className="pdesc">
                        {pedido.contato_email} · {pedido.contato_whatsapp}
                      </span>
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
                      <td colSpan={6}>
                        <table className="tabela-itens">
                          <thead>
                            <tr>
                              <th>SKU</th>
                              <th>Item</th>
                              <th>Qtd caixas</th>
                              <th>Preço/caixa</th>
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
                                <td className="mono">{item.quantidade_caixas}</td>
                                <td className="mono">{brl(item.preco_caixa_snapshot)}</td>
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
