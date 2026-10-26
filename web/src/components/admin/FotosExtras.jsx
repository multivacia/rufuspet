import { useEffect, useState } from 'react';
import { adminEnviarFoto, adminExcluirFoto, adminLegendaFoto, adminListarFotos, adminOrdenarFotos } from '../../lib/api.js';
import { reduzirImagem } from '../../lib/imagem.js';

const MAX_FOTOS = 8;
const MAX_LEGENDA = 60;

// Fotos extras de um produto (valem para todas as cores). aoMudarTotal avisa a tabela.
export default function FotosExtras({ chave, nome, aoMudarTotal }) {
  const [fotos, setFotos] = useState(null);
  const [erro, setErro] = useState(null);
  const [progresso, setProgresso] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    adminListarFotos(chave)
      .then(setFotos)
      .catch((err) => setErro(err.message));
  }, [chave]);

  function atualizar(lista) {
    setFotos(lista);
    aoMudarTotal(lista.length);
  }

  async function executar(acao) {
    setErro(null);
    setOcupado(true);
    try {
      await acao();
    } catch (err) {
      setErro(err.message);
    } finally {
      setOcupado(false);
    }
  }

  async function aoEscolher(e) {
    const arquivos = Array.from(e.target.files ?? []);
    e.target.value = '';
    const vagas = MAX_FOTOS - fotos.length;
    if (arquivos.length === 0) return;
    if (arquivos.length > vagas) {
      setErro(`Cabem mais ${vagas} foto(s) neste produto (limite de ${MAX_FOTOS}).`);
      return;
    }
    await executar(async () => {
      let lista = fotos;
      try {
        for (const [i, arquivo] of arquivos.entries()) {
          setProgresso(`Enviando ${i + 1} de ${arquivos.length}…`);
          const nova = await adminEnviarFoto(chave, await reduzirImagem(arquivo));
          lista = [...lista, nova];
          atualizar(lista);
        }
      } finally {
        setProgresso(null);
      }
    });
  }

  function mover(indice, direcao) {
    const destino = indice + direcao;
    if (destino < 0 || destino >= fotos.length) return;
    const ids = fotos.map((f) => f.id);
    [ids[indice], ids[destino]] = [ids[destino], ids[indice]];
    executar(async () => atualizar(await adminOrdenarFotos(chave, ids)));
  }

  function salvarLegenda(foto, legenda) {
    if (legenda.trim() === foto.legenda) return;
    executar(async () => {
      const atualizada = await adminLegendaFoto(foto.id, legenda);
      atualizar(fotos.map((f) => (f.id === foto.id ? atualizada : f)));
    });
  }

  function excluir(foto) {
    if (!window.confirm('Excluir esta foto? Não dá para desfazer.')) return;
    executar(async () => {
      await adminExcluirFoto(foto.id);
      atualizar(fotos.filter((f) => f.id !== foto.id));
    });
  }

  if (!fotos) return erro ? <p className="alerta-erro">{erro}</p> : <p className="pdesc">Carregando fotos…</p>;

  return (
    <div className="fotos-extras" aria-busy={ocupado}>
      <div className="fotos-extras-topo">
        <p className="emails-titulo">
          Fotos extras de {nome} — valem para todas as cores ({fotos.length}/{MAX_FOTOS})
        </p>
        <label className={`cta-primario${ocupado || fotos.length >= MAX_FOTOS ? ' desabilitado' : ''}`}>
          Adicionar fotos
          <input type="file" accept="image/*" multiple hidden disabled={ocupado || fotos.length >= MAX_FOTOS} onChange={aoEscolher} />
        </label>
      </div>
      {progresso && <p className="pdesc">{progresso}</p>}
      {erro && <p className="alerta-erro">{erro}</p>}
      {fotos.length === 0 ? (
        <p className="pdesc">Nenhuma foto extra. No site aparece só a foto principal.</p>
      ) : (
        <ol className="fotos-extras-lista">
          {fotos.map((foto, i) => (
            <li key={foto.id}>
              <img src={foto.url} alt="" width="96" height="96" />
              <input
                key={`${foto.id}-${foto.legenda}`}
                type="text"
                maxLength={MAX_LEGENDA}
                defaultValue={foto.legenda}
                placeholder="Legenda curta (opcional)"
                aria-label={`Legenda da foto ${i + 1}`}
                onBlur={(e) => salvarLegenda(foto, e.target.value)}
              />
              <div className="fotos-extras-acoes">
                <button type="button" className="expandir" onClick={() => mover(i, -1)} disabled={ocupado || i === 0} aria-label="Mover para antes">
                  ↑
                </button>
                <button
                  type="button"
                  className="expandir"
                  onClick={() => mover(i, 1)}
                  disabled={ocupado || i === fotos.length - 1}
                  aria-label="Mover para depois"
                >
                  ↓
                </button>
                <button type="button" className="botao-excluir" onClick={() => excluir(foto)} disabled={ocupado}>
                  Excluir
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
