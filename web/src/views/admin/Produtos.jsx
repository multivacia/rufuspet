import { Fragment, useEffect, useState } from 'react';
import { adminListarProdutos, adminAtualizarProduto } from '../../lib/api.js';

const CAMPOS_NUMERICOS = new Set(['preco_unitario']);

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
    if (CAMPOS_NUMERICOS.has(campo) ? valor === Number(valorAtual) : valor === valorAtual) return;

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
              <th>Preço unitário (R$)</th>
              <th>Ativo no site</th>
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
                    key={`preco-${p.sku}-${p.preco_unitario}`}
                    type="number"
                    step="0.01"
                    min="0.01"
                    defaultValue={p.preco_unitario}
                    aria-label={`Preço unitário de ${p.sku}`}
                    onBlur={(e) => salvarCampo(p.sku, 'preco_unitario', e.target.value, p.preco_unitario)}
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
                  <td colSpan={5}>
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
