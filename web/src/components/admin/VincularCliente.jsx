import { useEffect, useState } from 'react';
import { adminCriarCliente, adminListarClientes, adminSugestoesClientes } from '../../lib/api.js';
import { formatarDocumento } from '../../lib/formato.js';
import FormCliente, { clienteDaSolicitacao } from './FormCliente.jsx';

function Linha({ cliente, extra, onEscolher, ocupado }) {
  return (
    <li className="vinc-linha">
      <div>
        <strong>{cliente.nome}</strong>
        {cliente.nomeFantasia && <span className="pdesc"> · {cliente.nomeFantasia}</span>}
        <br />
        <span className="pdesc mono">
          {[formatarDocumento(cliente.documento), cliente.comprador, cliente.whatsapp, cliente.email, [cliente.cidade, cliente.uf].filter(Boolean).join('/')]
            .filter(Boolean)
            .join(' · ') || 'sem dados de contato'}
        </span>
        {extra}
      </div>
      <button type="button" className="cta-primario" disabled={ocupado} onClick={() => onEscolher(cliente)}>
        Vincular
      </button>
    </li>
  );
}

/**
 * Painel para ligar a solicitação a um cliente: sugestões (CPF/CNPJ, WhatsApp, e-mail), busca,
 * "Venda balcão" ou cadastro novo preenchido com os dados da solicitação.
 * onEscolher(cliente) devolve Promise (o pai grava o vínculo e, se for o caso, o status).
 */
export default function VincularCliente({ pedido, onEscolher, onCancelar, vendedores, aviso }) {
  const [sugestoes, setSugestoes] = useState(null);
  const [balcao, setBalcao] = useState(null);
  const [busca, setBusca] = useState('');
  const [resultado, setResultado] = useState(null);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    adminSugestoesClientes(pedido.id)
      .then((r) => setSugestoes(r.clientes))
      .catch((e) => setErro(e.message));
    adminListarClientes({ busca: 'Venda balcão', porPagina: 5 })
      .then((r) => setBalcao(r.clientes.find((c) => c.nome === 'Venda balcão') ?? null))
      .catch(() => {});
  }, [pedido.id]);

  async function escolher(cliente) {
    setOcupado(true);
    setErro(null);
    try {
      await onEscolher(cliente);
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  }

  async function buscar(e) {
    e.preventDefault();
    if (!busca.trim()) return;
    try {
      setResultado((await adminListarClientes({ busca: busca.trim(), porPagina: 10 })).clientes);
    } catch (err) {
      setErro(err.message);
    }
  }

  return (
    <div className="vincular-cliente">
      <p className="emails-titulo">Vincular cliente</p>
      {aviso && <p className="aviso-vinculo">{aviso}</p>}
      {erro && <p className="alerta-erro">{erro}</p>}

      {criando ? (
        <FormCliente
          inicial={clienteDaSolicitacao(pedido)}
          vendedores={vendedores}
          rotuloBotao="Cadastrar e vincular"
          onCancelar={() => setCriando(false)}
          onSalvar={async (dados) => {
            const novo = await adminCriarCliente(dados);
            await onEscolher(novo);
          }}
        />
      ) : (
        <>
          <p className="pdesc">Sugestões pelos dados da solicitação:</p>
          {sugestoes == null ? (
            <p className="pdesc">Procurando…</p>
          ) : sugestoes.length === 0 ? (
            <p className="pdesc">Nenhum cliente com o mesmo CPF/CNPJ, WhatsApp ou e-mail.</p>
          ) : (
            <ul className="vinc-lista">
              {sugestoes.map((c) => (
                <Linha key={c.id} cliente={c} ocupado={ocupado} onEscolher={escolher} extra={<span className="motivo-vinculo">bate por {c.motivos.join(', ')}</span>} />
              ))}
            </ul>
          )}

          <form className="busca-pedidos" onSubmit={buscar} style={{ marginTop: 12 }}>
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente por nome, CPF/CNPJ, WhatsApp…" aria-label="Buscar cliente" />
            <button type="submit" className="cta-primario">
              Buscar
            </button>
          </form>
          {resultado && (
            resultado.length ? (
              <ul className="vinc-lista">
                {resultado.map((c) => (
                  <Linha key={c.id} cliente={c} ocupado={ocupado} onEscolher={escolher} />
                ))}
              </ul>
            ) : (
              <p className="pdesc">Nenhum cliente encontrado.</p>
            )
          )}

          <div className="emails-acoes">
            <button type="button" className="cta-primario" onClick={() => setCriando(true)}>
              Cadastrar com os dados da solicitação
            </button>
            {balcao && (
              <button type="button" className="botao-sec" disabled={ocupado} onClick={() => escolher(balcao)}>
                Usar “Venda balcão”
              </button>
            )}
            {onCancelar && (
              <button type="button" className="botao-sec" onClick={onCancelar}>
                Cancelar
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
