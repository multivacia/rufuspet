import { Fragment, useEffect, useState } from 'react';
import { adminListarProdutos, adminAtualizarProduto } from '../../lib/api.js';
import { brl } from '../../lib/formato.js';

const CAMPOS_NUMERICOS = new Set(['preco_atacado', 'preco_revenda_sugerido', 'limite_caixas', 'estoque_caixas']);

export default function Produtos() {
  const [produtos, setProdutos] = useState(null);
  const [erroGeral, setErroGeral] = useState(null);
  const [salvando, setSalvando] = useState({});
  const [erroLinha, setErroLinha] = useState({});

  useEffect(() => {
    adminListarProdutos()
      .then(setProdutos)
      .catch((err) => setErroGeral(err.message));
  }, []);

  async function salvarCampo(sku, campo, valorBruto, valorAtual) {
    const valor = CAMPOS_NUMERICOS.has(campo) ? Number(valorBruto) : valorBruto;
    if (valor === valorAtual) return;

    setSalvando((atual) => ({ ...atual, [sku]: true }));
    setErroLinha((atual) => ({ ...atual, [sku]: null }));

    try {
      const atualizado = await adminAtualizarProduto(sku, { [campo]: valor });
      setProdutos((atual) => atual.map((p) => (p.sku === sku ? atualizado : p)));
    } catch (err) {
      setErroLinha((atual) => ({ ...atual, [sku]: err.message }));
    } finally {
      setSalvando((atual) => ({ ...atual, [sku]: false }));
    }
  }

  if (erroGeral) return <p className="alerta-erro">{erroGeral}</p>;
  if (!produtos) return <p className="vazio">Carregando…</p>;

  return (
    <>
      <h1 className="sec-title">Produtos</h1>
      <div style={{ overflowX: 'auto' }}>
        <table className="tabela-admin">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Nome</th>
              <th>Cor</th>
              <th>Atacado</th>
              <th>Revenda sug.</th>
              <th>Caixa</th>
              <th>Preço/caixa</th>
              <th>Margem</th>
              <th>Limite cx</th>
              <th>Estoque cx</th>
              <th>Ativo</th>
            </tr>
          </thead>
          <tbody>
            {produtos.map((p) => (
              <Fragment key={p.sku}>
              <tr className={salvando[p.sku] ? 'salvando' : ''}>
                <td className="mono">{p.sku}</td>
                <td>{p.nome}</td>
                <td>{p.cor ?? '—'}</td>
                <td>
                  <input
                    key={`atacado-${p.sku}-${p.preco_atacado}`}
                    type="number"
                    step="0.01"
                    min="0.01"
                    defaultValue={p.preco_atacado}
                    onBlur={(e) => salvarCampo(p.sku, 'preco_atacado', e.target.value, p.preco_atacado)}
                  />
                </td>
                <td>
                  <input
                    key={`revenda-${p.sku}-${p.preco_revenda_sugerido}`}
                    type="number"
                    step="0.01"
                    min="0.01"
                    defaultValue={p.preco_revenda_sugerido}
                    onBlur={(e) => salvarCampo(p.sku, 'preco_revenda_sugerido', e.target.value, p.preco_revenda_sugerido)}
                  />
                </td>
                <td className="mono">
                  {p.qtd_por_caixa} {p.unidade}
                </td>
                <td className="mono">{brl(p.preco_caixa)}</td>
                <td className="mono">{p.margem_pct}%</td>
                <td>
                  <input
                    key={`limite-${p.sku}-${p.limite_caixas}`}
                    type="number"
                    min="1"
                    defaultValue={p.limite_caixas}
                    onBlur={(e) => salvarCampo(p.sku, 'limite_caixas', e.target.value, p.limite_caixas)}
                  />
                </td>
                <td>
                  <input
                    key={`estoque-${p.sku}-${p.estoque_caixas}`}
                    type="number"
                    min="0"
                    defaultValue={p.estoque_caixas}
                    onBlur={(e) => salvarCampo(p.sku, 'estoque_caixas', e.target.value, p.estoque_caixas)}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={p.ativo}
                    onChange={(e) => salvarCampo(p.sku, 'ativo', e.target.checked, p.ativo)}
                  />
                </td>
              </tr>
              {erroLinha[p.sku] && (
                <tr>
                  <td colSpan={11}>
                    <p className="alerta-erro" style={{ margin: 0 }}>
                      {erroLinha[p.sku]}
                    </p>
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
