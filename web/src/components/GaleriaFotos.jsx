import { useEffect, useRef, useState } from 'react';

// Visualizador em tela cheia: rolagem horizontal com scroll-snap (swipe no celular, setas no desktop).
// fotos: [{ url, legenda }]. Só é montado quando aberto, então as extras só baixam nessa hora.
export default function GaleriaFotos({ titulo, fotos, aoFechar }) {
  const dialogo = useRef();
  const trilho = useRef();
  const [atual, setAtual] = useState(0);

  useEffect(() => {
    const el = dialogo.current;
    el.showModal();
    const raiz = document.documentElement;
    const overflowAnterior = raiz.style.overflow;
    raiz.style.overflow = 'hidden';
    return () => {
      raiz.style.overflow = overflowAnterior;
    };
  }, []);

  function aoRolar() {
    const el = trilho.current;
    setAtual(Math.round(el.scrollLeft / el.clientWidth));
  }

  function irPara(indice) {
    const el = trilho.current;
    const destino = Math.max(0, Math.min(fotos.length - 1, indice));
    el.scrollTo({ left: destino * el.clientWidth, behavior: 'smooth' });
  }

  function aoTeclar(e) {
    if (e.key === 'ArrowRight') irPara(atual + 1);
    if (e.key === 'ArrowLeft') irPara(atual - 1);
  }

  return (
    <dialog
      ref={dialogo}
      className="galeria"
      aria-label={`Fotos de ${titulo}`}
      onClose={aoFechar}
      onKeyDown={aoTeclar}
      onClick={(e) => e.target === dialogo.current && dialogo.current.close()}
    >
      <div className="galeria-topo">
        <span className="galeria-contador" aria-live="polite">
          {atual + 1} / {fotos.length}
        </span>
        <button type="button" className="galeria-fechar" onClick={() => dialogo.current.close()} aria-label="Fechar fotos">
          ×
        </button>
      </div>

      <div className="galeria-trilho" ref={trilho} onScroll={aoRolar}>
        {fotos.map((foto, i) => (
          <figure key={foto.url} className="galeria-foto">
            <img src={foto.url} alt={foto.legenda || `${titulo} — foto ${i + 1}`} loading={i < 2 ? 'eager' : 'lazy'} />
            {foto.legenda && <figcaption>{foto.legenda}</figcaption>}
          </figure>
        ))}
      </div>

      {fotos.length > 1 && (
        <>
          <button type="button" className="galeria-seta anterior" onClick={() => irPara(atual - 1)} disabled={atual === 0} aria-label="Foto anterior">
            ‹
          </button>
          <button
            type="button"
            className="galeria-seta proxima"
            onClick={() => irPara(atual + 1)}
            disabled={atual === fotos.length - 1}
            aria-label="Próxima foto"
          >
            ›
          </button>
          <div className="galeria-pontos" aria-hidden="true">
            {fotos.map((foto, i) => (
              <span key={foto.url} className={i === atual ? 'on' : ''} />
            ))}
          </div>
        </>
      )}
    </dialog>
  );
}
