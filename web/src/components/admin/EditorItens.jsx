import { brl } from '../../lib/formato.js';

export function lerPrecoBr(valor) {
  let t = String(valor ?? '').trim();
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return t !== '' && Number.isFinite(n) ? n : null;
}

/** Itens do pedido (snapshot) → linhas editáveis. */
export function itensParaEdicao(itens) {
  return itens.map((i) => ({
    sku: i.sku,
    quantidade: String(i.quantidade),
    precoUnitario: Number(i.preco_unitario_snapshot ?? i.precoUnitario).toFixed(2).replace('.', ','),
  }));
}

/**
 * Editor de itens com saldo de estoque ao lado.
 * - saldos: Map sku → saldo atual.
 * - proprio: Map sku → quanto este pedido já baixou (entra no "disponível" de pedido confirmado).
 * - checarEstoque: se true, destaca quantidade acima do disponível (pedido que terá baixa).
 */
export default function EditorItens({ itens, onChange, produtos, saldos, proprio = new Map(), checarEstoque = false }) {
  const porSku = new Map(produtos.map((p) => [p.sku, p]));
  const atualizar = (i, campo, valor) => {
    const novos = itens.map((it, j) => (j === i ? { ...it, [campo]: valor } : it));
    if (campo === 'sku') {
      const p = porSku.get(valor);
      novos[i].precoUnitario = p ? Number(p.preco_unitario).toFixed(2).replace('.', ',') : '';
    }
    onChange(novos);
  };
  const total = itens.reduce((s, it) => s + (lerPrecoBr(it.precoUnitario) ?? 0) * (Number(it.quantidade) || 0), 0);

  return (
    <div className="editor-itens">
      <table className="tabela-itens">
        <thead>
          <tr>
            <th>Produto</th>
            <th className="num">Qtd</th>
            <th className="num">Preço un. (R$)</th>
            <th className="num">{checarEstoque ? 'Disponível' : 'Em estoque'}</th>
            <th className="num">Subtotal</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {itens.map((it, i) => {
            const disponivel = (saldos.get(it.sku) ?? 0) + (proprio.get(it.sku) ?? 0);
            const qtd = Number(it.quantidade) || 0;
            const acima = it.sku && qtd > disponivel;
            const usados = new Set(itens.filter((_, j) => j !== i).map((x) => x.sku));
            return (
              <tr key={i}>
                <td>
                  <select value={it.sku} onChange={(e) => atualizar(i, 'sku', e.target.value)} aria-label={`Produto do item ${i + 1}`}>
                    <option value="">Selecione…</option>
                    {produtos.map((p) => (
                      <option key={p.sku} value={p.sku} disabled={usados.has(p.sku)}>
                        {p.nome}
                        {p.cor ? ` — ${p.cor}` : ''}
                        {p.ativo ? '' : ' (inativo)'}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="num">
                  <input
                    className={`qtd ${acima && checarEstoque ? 'acima' : ''}`}
                    inputMode="numeric"
                    value={it.quantidade}
                    onChange={(e) => atualizar(i, 'quantidade', e.target.value.replace(/\D/g, ''))}
                    aria-label={`Quantidade do item ${i + 1}`}
                  />
                </td>
                <td className="num">
                  <input
                    className="preco"
                    inputMode="decimal"
                    value={it.precoUnitario}
                    onChange={(e) => atualizar(i, 'precoUnitario', e.target.value)}
                    aria-label={`Preço do item ${i + 1}`}
                  />
                </td>
                <td className={`num mono ${acima ? 'neg' : ''}`} title={checarEstoque ? 'Saldo + o que este pedido já baixou' : 'Saldo atual'}>
                  {it.sku ? (checarEstoque ? disponivel : saldos.get(it.sku) ?? 0) : '—'}
                </td>
                <td className="num mono">{brl((lerPrecoBr(it.precoUnitario) ?? 0) * qtd)}</td>
                <td>
                  <button type="button" className="expandir" onClick={() => onChange(itens.filter((_, j) => j !== i))} aria-label="Remover item" disabled={itens.length === 1}>
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}>
              <button type="button" className="botao-sec" onClick={() => onChange([...itens, { sku: '', quantidade: '1', precoUnitario: '' }])}>
                + item
              </button>
            </td>
            <td className="num mono">
              <strong>{brl(total)}</strong>
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
      {!checarEstoque && <p className="pdesc">Solicitação não reserva estoque — o saldo é conferido ao confirmar.</p>}
    </div>
  );
}

/** Linhas do editor → corpo da API. */
export function itensParaApi(itens) {
  return itens.map((it) => ({ sku: it.sku, quantidade: it.quantidade, precoUnitario: it.precoUnitario }));
}
