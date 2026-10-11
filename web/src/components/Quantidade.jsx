const MAXIMO = 9999;

export default function Quantidade({ valor, aoMudar, minimo = 1, rotulo }) {
  const limitar = (n) => Math.min(MAXIMO, Math.max(minimo, n));
  return (
    <div className="qtd" role="group" aria-label={rotulo}>
      <button type="button" onClick={() => aoMudar(limitar(valor - 1))} aria-label="Diminuir">
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={minimo}
        max={MAXIMO}
        value={valor}
        aria-label="Quantidade"
        onChange={(e) => {
          const n = Number.parseInt(e.target.value, 10);
          aoMudar(Number.isNaN(n) ? minimo : limitar(n));
        }}
      />
      <button type="button" onClick={() => aoMudar(limitar(valor + 1))} aria-label="Aumentar">
        +
      </button>
    </div>
  );
}
