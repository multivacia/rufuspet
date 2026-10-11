"use client";

type Props = { valor: number; aoMudar: (valor: number) => void; minimo?: number; rotulo: string };

export function Quantidade({ valor, aoMudar, minimo = 1, rotulo }: Props) {
  return (
    <div className="qtd" role="group" aria-label={rotulo}>
      <button type="button" onClick={() => aoMudar(Math.max(minimo, valor - 1))} aria-label="Diminuir">
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={minimo}
        max={9999}
        value={valor}
        aria-label="Quantidade"
        onChange={(e) => {
          const n = Number.parseInt(e.target.value, 10);
          aoMudar(Number.isNaN(n) ? minimo : Math.min(9999, Math.max(minimo, n)));
        }}
      />
      <button type="button" onClick={() => aoMudar(Math.min(9999, valor + 1))} aria-label="Aumentar">
        +
      </button>
    </div>
  );
}
