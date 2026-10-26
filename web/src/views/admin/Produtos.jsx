import { Fragment, useEffect, useState } from 'react';
import { adminListarProdutos, adminAtualizarProduto, adminTrocarFotoPrincipal } from '../../lib/api.js';
import { reduzirImagem } from '../../lib/imagem.js';
import FotosExtras from '../../components/admin/FotosExtras.jsx';

const CAMPOS_NUMERICOS = new Set(['preco_unitario']);

export default function Produtos() {
  const [produtos, setProdutos] = useState(null);
  const [erroGeral, setErroGeral] = useState(null);
  const [salvando, setSalvando] = useState({});
  const [erroLinha, setErroLinha] = useState({});
  const [extrasAberto, setExtrasAberto] = useState(null);

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

  async function trocarFoto(sku, e) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setSalvando((atual) => ({ ...atual, [sku]: true }));
    setErroLinha((atual) => ({ ...atual, [sku]: null }));
    try {
      const atualizado = await adminTrocarFotoPrincipal(sku, await reduzirImagem(arquivo));
      setProdutos((atual) => atual.map((p) => (p.sku === sku ? { ...p, imagem: atualizado.imagem } : p)));
    } catch (err) {
      setErroLinha((atual) => ({ ...atual, [sku]: err.message }));
    } finally {
      setSalvando((atual) => ({ ...atual, [sku]: false }));
    }
  }

  function mudarTotalExtras(chave, total) {
    setProdutos((atual) => atual.map((p) => (p.chave_fotos === chave ? { ...p, fotos_extras: total } : p)));
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
              <th>Foto principal</th>
              <th>SKU</th>
              <th>Nome</th>
              <th>Cor</th>
              <th>Preço unitário (R$)</th>
              <th>Ativo no site</th>
              <th>Fotos extras</th>
            </tr>
          </thead>
          <tbody>
            {produtos.map((p, i) => {
              const primeiraDaChave = produtos.findIndex((x) => x.chave_fotos === p.chave_fotos) === i;
              const ultimaDaChave = produtos.findLastIndex((x) => x.chave_fotos === p.chave_fotos) === i;
              return (
              <Fragment key={p.sku}>
              <tr className={salvando[p.sku] ? 'salvando' : ''}>
                <td>
                  <div className="foto-principal">
                    <img src={p.imagem} alt="" width="56" height="56" />
                    <label className="link-acao">
                      Trocar
                      <input type="file" accept="image/*" hidden disabled={salvando[p.sku]} onChange={(e) => trocarFoto(p.sku, e)} />
                    </label>
                  </div>
                </td>
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
                <td>
                  {primeiraDaChave && (
                    <button
                      type="button"
                      className="link-acao"
                      aria-expanded={extrasAberto === p.chave_fotos}
                      onClick={() => setExtrasAberto((atual) => (atual === p.chave_fotos ? null : p.chave_fotos))}
                    >
                      {extrasAberto === p.chave_fotos ? 'Fechar' : `Gerenciar (${p.fotos_extras})`}
                    </button>
                  )}
                </td>
              </tr>
              {erroLinha[p.sku] && (
                <tr>
                  <td colSpan={7}>
                    <p className="alerta-erro" style={{ margin: 0 }}>
                      {erroLinha[p.sku]}
                    </p>
                  </td>
                </tr>
              )}
              {ultimaDaChave && extrasAberto === p.chave_fotos && (
                <tr>
                  <td colSpan={7}>
                    <FotosExtras chave={p.chave_fotos} nome={p.nome} aoMudarTotal={(total) => mudarTotalExtras(p.chave_fotos, total)} />
                  </td>
                </tr>
              )}
              </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
