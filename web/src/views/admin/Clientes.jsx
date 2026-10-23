import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminListarClientes } from '../../lib/api.js';
import { brl, dataBr, formatarDocumento } from '../../lib/formato.js';

export default function Clientes() {
  const navigate = useNavigate();
  const [dados, setDados] = useState(null);
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [pagina, setPagina] = useState(1);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    adminListarClientes({ busca: buscaAplicada, pagina })
      .then(setDados)
      .catch((e) => setErro(e.message));
  }, [buscaAplicada, pagina]);

  if (erro && !dados) return <p className="alerta-erro">{erro}</p>;
  if (!dados) return <p className="vazio">Carregando…</p>;
  const totalPaginas = Math.max(1, Math.ceil(dados.total / dados.porPagina));

  return (
    <>
      <div className="titulo-acoes">
        <h1 className="sec-title" style={{ margin: 0 }}>
          Clientes
        </h1>
        <Link to="/admin/clientes/novo" className="cta-primario">
          + Novo cliente
        </Link>
      </div>

      <form
        className="busca-pedidos"
        onSubmit={(e) => {
          e.preventDefault();
          setPagina(1);
          setBuscaAplicada(busca.trim());
        }}
      >
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, fantasia, CPF/CNPJ, WhatsApp, comprador, vendedor…" aria-label="Buscar cliente" />
        <button type="submit" className="cta-primario">
          Buscar
        </button>
      </form>

      {dados.clientes.length === 0 ? (
        <p className="vazio">Nenhum cliente encontrado.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="tabela-admin tabela-larga">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Comprador</th>
                <th>Cidade/UF</th>
                <th>Vendedor</th>
                <th className="num">Compras</th>
                <th className="num">Total comprado</th>
                <th>Última compra</th>
              </tr>
            </thead>
            <tbody>
              {dados.clientes.map((c) => (
                <tr key={c.id} className={`linha-clicavel ${c.ativo ? '' : 'esgotado'}`} onClick={() => navigate(`/admin/clientes/${c.id}`)}>
                  <td>
                    <Link to={`/admin/clientes/${c.id}`} className="link-produto" onClick={(e) => e.stopPropagation()}>
                      {c.nomeFantasia || c.nome}
                    </Link>
                    <br />
                    <span className="pdesc mono">
                      {[c.nomeFantasia ? c.nome : null, formatarDocumento(c.documento), c.ativo ? null : 'inativo'].filter(Boolean).join(' · ')}
                    </span>
                  </td>
                  <td>
                    {c.comprador || '—'}
                    {c.whatsapp && (
                      <>
                        <br />
                        <span className="pdesc mono">{c.whatsapp}</span>
                      </>
                    )}
                  </td>
                  <td>{[c.cidade, c.uf].filter(Boolean).join('/') || '—'}</td>
                  <td>{c.vendedor || '—'}</td>
                  <td className="num mono">{c.compras}</td>
                  <td className="num mono">{brl(c.totalComprado)}</td>
                  <td className="mono">{dataBr(c.ultimaCompra)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPaginas > 1 && (
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
      )}
      <p className="pdesc" style={{ marginTop: 12 }}>
        Compras = pedidos confirmados ou faturados. Solicitações e cancelados não contam.
      </p>
    </>
  );
}
