import { useCallback, useEffect, useState } from 'react';
import {
  adminEstoqueBaixa,
  adminEstoqueEntrada,
  adminEstoqueExcluirEntrada,
  adminEstoqueFornecedores,
  adminEstoqueLotes,
  adminEstoqueMovimentos,
  adminEstoqueSaldos,
} from '../../lib/api.js';
import { brl, brlCusto } from '../../lib/formato.js';

const TIPOS = {
  entrada: 'Entrada (compra)',
  saida_pedido: 'Saída — pedido',
  estorno_pedido: 'Estorno — pedido',
  baixa_manual: 'Baixa manual',
  entrada_excluida: 'Entrada excluída',
};

function hoje() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function dataBr(iso) {
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

function nomeProduto(p) {
  return `${p.nome}${p.cor ? ` — ${p.cor}` : ''}`;
}

const ENTRADA_VAZIA = { sku: '', quantidade: '', custoUnitario: '', data: hoje(), fornecedor: '', documento: '', observacao: '' };
const BAIXA_VAZIA = { sku: '', quantidade: '', motivo: '' };

export default function Estoque() {
  const [saldos, setSaldos] = useState(null);
  const [lotes, setLotes] = useState([]);
  const [movimentos, setMovimentos] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [filtro, setFiltro] = useState('');
  const [erroGeral, setErroGeral] = useState(null);

  const [entrada, setEntrada] = useState(ENTRADA_VAZIA);
  const [baixa, setBaixa] = useState(BAIXA_VAZIA);
  const [envio, setEnvio] = useState({}); // { entrada|baixa: { enviando, erro, campo, ok } }

  const recarregar = useCallback(async () => {
    try {
      const [s, l, m, f] = await Promise.all([
        adminEstoqueSaldos(),
        adminEstoqueLotes(filtro),
        adminEstoqueMovimentos(filtro),
        adminEstoqueFornecedores(),
      ]);
      setFornecedores(f.fornecedores);
      setSaldos(s.saldos);
      setLotes(l.lotes);
      setMovimentos(m.movimentos);
      setErroGeral(null);
    } catch (err) {
      setErroGeral(err.message);
    }
  }, [filtro]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  async function enviar(qual, acao, campos, limpar) {
    setEnvio((e) => ({ ...e, [qual]: { enviando: true } }));
    try {
      await acao(campos);
      limpar();
      setEnvio((e) => ({ ...e, [qual]: { ok: qual === 'entrada' ? '✓ Entrada lançada.' : '✓ Baixa registrada.' } }));
      await recarregar();
    } catch (err) {
      setEnvio((e) => ({ ...e, [qual]: { erro: err.message, campo: err.campo } }));
    }
  }

  async function excluir(lote) {
    const texto = `Excluir a entrada de ${lote.quantidadeInicial} un. de ${nomeProduto(lote)} (${dataBr(lote.dataEntrada)}, ${brlCusto(lote.custoUnitario)}/un.)?`;
    if (!window.confirm(texto)) return;
    try {
      await adminEstoqueExcluirEntrada(lote.id);
      await recarregar();
    } catch (err) {
      setErroGeral(err.message);
    }
  }

  if (erroGeral && !saldos) return <p className="alerta-erro">{erroGeral}</p>;
  if (!saldos) return <p className="vazio">Carregando…</p>;

  const produtoSelect = (valor, onChange, id) => (
    <select id={id} value={valor} onChange={(e) => onChange(e.target.value)} required>
      <option value="">Selecione…</option>
      {saldos.map((p) => (
        <option key={p.sku} value={p.sku}>
          {nomeProduto(p)} ({p.sku})
        </option>
      ))}
    </select>
  );

  const classeCampo = (qual, campo) => (envio[qual]?.campo === campo ? 'form-campo com-erro' : 'form-campo');
  const totalEstoque = saldos.reduce((s, p) => s + p.custoEstoque, 0);

  return (
    <>
      <h1 className="sec-title">
        Estoque
        <small>Custo por compra · saídas consomem as compras mais antigas primeiro (PEPS)</small>
      </h1>

      {erroGeral && <p className="alerta-erro">{erroGeral}</p>}

      <div style={{ overflowX: 'auto' }}>
        <table className="tabela-admin tabela-estoque">
          <thead>
            <tr>
              <th>Produto</th>
              <th className="num">Saldo (un.)</th>
              <th className="num">Próximo custo</th>
              <th className="num">Custo médio</th>
              <th className="num">Valor em estoque</th>
              <th className="num">Preço de venda</th>
            </tr>
          </thead>
          <tbody>
            {saldos.map((p) => (
              <tr key={p.sku} className={filtro === p.sku ? 'selecionado' : ''}>
                <td>
                  <button type="button" className="link-produto" onClick={() => setFiltro((f) => (f === p.sku ? '' : p.sku))}>
                    {nomeProduto(p)}
                  </button>
                  <br />
                  <span className="pdesc mono">
                    {p.sku}
                    {!p.ativo && ' · inativo no site'}
                  </span>
                </td>
                <td className={`num mono saldo ${p.saldo === 0 ? 'zerado' : ''}`}>{p.saldo}</td>
                <td className="num mono" title="Custo da compra mais antiga com saldo — é o que sai na próxima venda">
                  {brlCusto(p.proximoCusto)}
                </td>
                <td className="num mono">{brlCusto(p.custoMedio)}</td>
                <td className="num mono">{brl(p.custoEstoque)}</td>
                <td className="num mono">{brl(p.precoUnitario)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="pdesc">
                Clique no produto para filtrar compras e movimentos.
              </td>
              <td className="num mono">
                <strong>{brl(totalEstoque)}</strong>
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="estoque-forms">
        <form
          className="estoque-form"
          onSubmit={(e) => {
            e.preventDefault();
            enviar('entrada', adminEstoqueEntrada, entrada, () => setEntrada({ ...ENTRADA_VAZIA, data: hoje() }));
          }}
        >
          <p className="emails-titulo">Entrada (compra)</p>
          <div className={classeCampo('entrada', 'sku')}>
            <label htmlFor="ent-sku">Produto</label>
            {produtoSelect(entrada.sku, (sku) => setEntrada((x) => ({ ...x, sku })), 'ent-sku')}
          </div>
          <div className="estoque-linha">
            <div className={classeCampo('entrada', 'quantidade')}>
              <label htmlFor="ent-qtd">Quantidade (un.)</label>
              <input id="ent-qtd" inputMode="numeric" value={entrada.quantidade} onChange={(e) => setEntrada((x) => ({ ...x, quantidade: e.target.value }))} required />
            </div>
            <div className={classeCampo('entrada', 'custoUnitario')}>
              <label htmlFor="ent-custo">Custo unitário (R$)</label>
              <input id="ent-custo" inputMode="decimal" placeholder="4,35" value={entrada.custoUnitario} onChange={(e) => setEntrada((x) => ({ ...x, custoUnitario: e.target.value }))} required />
            </div>
            <div className={classeCampo('entrada', 'data')}>
              <label htmlFor="ent-data">Data da compra</label>
              <input id="ent-data" type="date" max={hoje()} value={entrada.data} onChange={(e) => setEntrada((x) => ({ ...x, data: e.target.value }))} required />
            </div>
          </div>
          <div className="estoque-linha estoque-linha-2">
            <div className={classeCampo('entrada', 'fornecedor')}>
              <label htmlFor="ent-forn">Fornecedor</label>
              <input
                id="ent-forn"
                list="lista-fornecedores"
                maxLength={120}
                autoComplete="off"
                value={entrada.fornecedor}
                onChange={(e) => setEntrada((x) => ({ ...x, fornecedor: e.target.value }))}
              />
              <datalist id="lista-fornecedores">
                {fornecedores.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </div>
            <div className={classeCampo('entrada', 'documento')}>
              <label htmlFor="ent-doc">Nota fiscal / documento</label>
              <input id="ent-doc" maxLength={60} value={entrada.documento} onChange={(e) => setEntrada((x) => ({ ...x, documento: e.target.value }))} />
            </div>
          </div>
          <div className="form-campo">
            <label htmlFor="ent-obs">Observação</label>
            <input id="ent-obs" maxLength={300} value={entrada.observacao} onChange={(e) => setEntrada((x) => ({ ...x, observacao: e.target.value }))} />
          </div>
          {totalPrevisto(entrada) && <p className="pdesc">Total da compra: {totalPrevisto(entrada)}</p>}
          <div className="emails-acoes">
            <button type="submit" className="cta-primario" disabled={envio.entrada?.enviando}>
              {envio.entrada?.enviando ? 'Lançando…' : 'Lançar entrada'}
            </button>
            {envio.entrada?.ok && <span className="email-ok">{envio.entrada.ok}</span>}
            {envio.entrada?.erro && <span className="email-erro">{envio.entrada.erro}</span>}
          </div>
        </form>

        <form
          className="estoque-form"
          onSubmit={(e) => {
            e.preventDefault();
            enviar('baixa', adminEstoqueBaixa, baixa, () => setBaixa(BAIXA_VAZIA));
          }}
        >
          <p className="emails-titulo">Baixa manual (perda, avaria, amostra)</p>
          <div className={classeCampo('baixa', 'sku')}>
            <label htmlFor="bx-sku">Produto</label>
            {produtoSelect(baixa.sku, (sku) => setBaixa((x) => ({ ...x, sku })), 'bx-sku')}
          </div>
          <div className={classeCampo('baixa', 'quantidade')}>
            <label htmlFor="bx-qtd">Quantidade (un.)</label>
            <input id="bx-qtd" inputMode="numeric" value={baixa.quantidade} onChange={(e) => setBaixa((x) => ({ ...x, quantidade: e.target.value }))} required />
          </div>
          <div className={classeCampo('baixa', 'motivo')}>
            <label htmlFor="bx-motivo">Motivo</label>
            <input id="bx-motivo" maxLength={300} value={baixa.motivo} onChange={(e) => setBaixa((x) => ({ ...x, motivo: e.target.value }))} required />
          </div>
          <div className="emails-acoes">
            <button type="submit" className="cta-primario" disabled={envio.baixa?.enviando}>
              {envio.baixa?.enviando ? 'Registrando…' : 'Registrar baixa'}
            </button>
            {envio.baixa?.ok && <span className="email-ok">{envio.baixa.ok}</span>}
            {envio.baixa?.erro && <span className="email-erro">{envio.baixa.erro}</span>}
          </div>
          <p className="pdesc">Para corrigir saldo para mais, lance uma entrada com o custo.</p>
        </form>
      </div>

      <div className="estoque-filtro">
        <h2 className="sec-title" style={{ margin: 0 }}>
          Compras
        </h2>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar por produto">
          <option value="">Todos os produtos</option>
          {saldos.map((p) => (
            <option key={p.sku} value={p.sku}>
              {nomeProduto(p)}
            </option>
          ))}
        </select>
      </div>
      {lotes.length === 0 ? (
        <p className="pdesc">Nenhuma compra lançada{filtro ? ' para este produto' : ''}.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="tabela-admin tabela-larga">
            <thead>
              <tr>
                <th>Data</th>
                <th>Produto</th>
                <th className="num">Comprado</th>
                <th className="num">Restante</th>
                <th className="num">Custo un.</th>
                <th>Fornecedor</th>
                <th>Documento</th>
                <th>Observação</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lotes.map((l) => (
                <tr key={l.id} className={l.quantidadeRestante === 0 ? 'esgotado' : ''}>
                  <td className="mono">{dataBr(l.dataEntrada)}</td>
                  <td>{nomeProduto(l)}</td>
                  <td className="num mono">{l.quantidadeInicial}</td>
                  <td className="num mono">{l.quantidadeRestante}</td>
                  <td className="num mono">{brlCusto(l.custoUnitario)}</td>
                  <td>{l.fornecedor || <span className="pdesc">—</span>}</td>
                  <td className="mono pdesc">{l.documento}</td>
                  <td className="pdesc">{l.observacao}</td>
                  <td>
                    {l.podeExcluir && (
                      <button type="button" className="expandir" style={{ width: 'auto', padding: '0 8px' }} onClick={() => excluir(l)}>
                        excluir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="sec-title" style={{ marginTop: 32 }}>
        Movimentos
      </h2>
      {movimentos.length === 0 ? (
        <p className="pdesc">Nenhum movimento{filtro ? ' para este produto' : ''}.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="tabela-admin tabela-larga">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Produto</th>
                <th>Tipo</th>
                <th className="num">Qtd</th>
                <th className="num">Custo</th>
                <th>Referência</th>
              </tr>
            </thead>
            <tbody>
              {movimentos.map((m) => (
                <tr key={m.id}>
                  <td className="mono">{new Date(m.criadoEm).toLocaleString('pt-BR')}</td>
                  <td>{nomeProduto(m)}</td>
                  <td>{TIPOS[m.tipo] ?? m.tipo}</td>
                  <td className={`num mono ${m.quantidade < 0 ? 'neg' : 'pos'}`}>
                    {m.quantidade > 0 ? `+${m.quantidade}` : m.quantidade}
                  </td>
                  <td className="num mono">{brl(m.custoTotal)}</td>
                  <td className="pdesc">
                    {[m.pedidoCodigo && `${m.pedidoNumero} · ${m.pedidoCodigo}`, m.fornecedor, m.documento, m.motivo, m.criadoPor].filter(Boolean).join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function totalPrevisto({ quantidade, custoUnitario }) {
  const q = Number(String(quantidade).trim());
  let t = String(custoUnitario).trim();
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const c = Number(t);
  if (!Number.isInteger(q) || q <= 0 || !(c >= 0) || t === '') return null;
  return brl(q * c);
}
