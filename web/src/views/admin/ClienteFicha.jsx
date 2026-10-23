import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminAtualizarCliente, adminBuscarCliente, adminCriarCliente, adminVendedores } from '../../lib/api.js';
import { brl, dataBr, ROTULO_STATUS } from '../../lib/formato.js';
import FormCliente, { CLIENTE_VAZIO } from '../../components/admin/FormCliente.jsx';

function pct(margem, total) {
  return total > 0 ? ` (${((margem / total) * 100).toFixed(1).replace('.', ',')}%)` : '';
}

export default function ClienteFicha() {
  const { id } = useParams();
  const novo = id === 'novo';
  const navigate = useNavigate();
  const [ficha, setFicha] = useState(null);
  const [vendedores, setVendedores] = useState([]);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(() => {
    if (novo) return;
    adminBuscarCliente(id)
      .then(setFicha)
      .catch((e) => setErro(e.message));
  }, [id, novo]);

  useEffect(() => {
    carregar();
    adminVendedores()
      .then((v) => setVendedores(v.vendedores))
      .catch(() => {});
  }, [carregar]);

  if (erro) return <p className="alerta-erro">{erro}</p>;
  if (!novo && !ficha) return <p className="vazio">Carregando…</p>;

  const r = ficha?.resumo;

  return (
    <>
      <p className="pdesc">
        <Link to="/admin/clientes">← Clientes</Link>
      </p>
      <div className="titulo-acoes">
        <h1 className="sec-title" style={{ margin: 0 }}>
          {novo ? 'Novo cliente' : ficha.cliente.nomeFantasia || ficha.cliente.nome}
        </h1>
        {!novo && (
          <Link to={`/admin/pedidos/novo?cliente=${ficha.cliente.id}`} className="cta-primario">
            + Novo pedido
          </Link>
        )}
      </div>

      {!novo && (
        <div className="resumo-cliente">
          <div>
            <span className="emails-titulo">Compras</span>
            <strong className="mono">{r.compras}</strong>
          </div>
          <div>
            <span className="emails-titulo">Total comprado</span>
            <strong className="mono">{brl(r.totalComprado)}</strong>
          </div>
          <div>
            <span className="emails-titulo">Margem</span>
            <strong className="mono">
              {brl(r.margem)}
              <small>{pct(r.margem, r.totalComprado)}</small>
            </strong>
          </div>
          <div>
            <span className="emails-titulo">Última compra</span>
            <strong className="mono">{dataBr(r.ultimaCompra)}</strong>
          </div>
        </div>
      )}

      <div className="bloco-detalhe">
        <p className="emails-titulo">Cadastro</p>
        <FormCliente
          key={novo ? 'novo' : ficha.cliente.atualizadoEm}
          inicial={novo ? CLIENTE_VAZIO : ficha.cliente}
          vendedores={vendedores}
          rotuloBotao={novo ? 'Cadastrar' : 'Salvar alterações'}
          onSalvar={async (dados) => {
            if (novo) {
              const criado = await adminCriarCliente(dados);
              navigate(`/admin/clientes/${criado.id}`, { replace: true });
            } else {
              await adminAtualizarCliente(ficha.cliente.id, dados);
              carregar();
            }
          }}
        />
      </div>

      {!novo && (
        <>
          <h2 className="sec-title" style={{ marginTop: 28 }}>
            Histórico de pedidos
          </h2>
          {ficha.pedidos.length === 0 ? (
            <p className="pdesc">Nenhum pedido vinculado.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="tabela-admin tabela-larga">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Número / código</th>
                    <th>Situação</th>
                    <th>Itens</th>
                    <th>Vendedor</th>
                    <th className="num">Total</th>
                    <th className="num">Custo</th>
                    <th className="num">Margem</th>
                  </tr>
                </thead>
                <tbody>
                  {ficha.pedidos.map((p) => (
                    <tr key={p.id} className={['confirmado', 'faturado'].includes(p.status) ? '' : 'esgotado'}>
                      <td className="mono">{dataBr(p.criadoEm)}</td>
                      <td className="mono">
                        {p.numero}
                        <br />
                        <span className="codigo-cliente">{p.codigo}</span>
                        {p.origem === 'admin' && <span className="etiqueta"> admin</span>}
                      </td>
                      <td>{ROTULO_STATUS[p.status]}</td>
                      <td className="pdesc">
                        {p.itens.map((i) => `${i.quantidade}× ${i.nome}${i.cor ? ` ${i.cor}` : ''}`).join(', ')}
                      </td>
                      <td>{p.vendedor || '—'}</td>
                      <td className="num mono">{brl(p.valorTotal)}</td>
                      <td className="num mono">{p.custo == null ? '—' : brl(p.custo)}</td>
                      <td className="num mono">{p.margem == null ? '—' : brl(p.margem)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="pdesc" style={{ marginTop: 8 }}>
            Totais consideram só pedidos confirmados ou faturados; os demais aparecem esmaecidos.
          </p>
        </>
      )}
    </>
  );
}
