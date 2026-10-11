"use client";

import Image from "next/image";
import { useState } from "react";
import { formatarPreco, type Produto } from "@/lib/catalogo";
import { useCarrinho } from "./CartProvider";
import { Quantidade } from "./Quantidade";

export function ProductCard({ produto, prioridade = false }: { produto: Produto; prioridade?: boolean }) {
  const { adicionar } = useCarrinho();
  const [variacaoId, setVariacaoId] = useState(produto.variacoes?.[0]?.id);
  const [quantidade, setQuantidade] = useState(1);
  const [adicionado, setAdicionado] = useState(false);

  const variacao = produto.variacoes?.find((v) => v.id === variacaoId);
  const imagem = variacao?.imagem ?? produto.imagem;

  function aoAdicionar() {
    adicionar({ produtoId: produto.id, variacaoId, quantidade });
    setQuantidade(1);
    setAdicionado(true);
    setTimeout(() => setAdicionado(false), 1800);
  }

  return (
    <article className="card">
      <div className="card-foto">
        <Image
          src={imagem}
          alt={variacao ? `${produto.nome} — ${variacao.nome}` : produto.nome}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          priority={prioridade}
        />
      </div>
      <div className="card-corpo">
        <p className="card-linha">{produto.linha}</p>
        <h3>{produto.nome}</h3>
        <ul className="card-destaques">
          {produto.destaques.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
        <p className="card-preco">
          {formatarPreco(produto.precoCentavos)} <span>/ unidade</span>
        </p>

        {produto.variacoes && (
          <fieldset className="cores">
            <legend>
              Cor: <b>{variacao?.nome}</b>
            </legend>
            <div>
              {produto.variacoes.map((v) => (
                <label key={v.id} className="cor" title={v.nome}>
                  <input
                    type="radio"
                    name={`cor-${produto.id}`}
                    value={v.id}
                    checked={v.id === variacaoId}
                    onChange={() => setVariacaoId(v.id)}
                  />
                  <span style={{ background: v.cor }} />
                  <span className="sr-only">{v.nome}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="card-acoes">
          <Quantidade valor={quantidade} aoMudar={setQuantidade} rotulo={`Quantidade de ${produto.nome}`} />
          <button type="button" className="botao" onClick={aoAdicionar}>
            {adicionado ? "Adicionado ✓" : "Adicionar"}
          </button>
        </div>
        <p className="sr-only" aria-live="polite">
          {adicionado ? `${produto.nome} adicionado ao pedido.` : ""}
        </p>
      </div>
    </article>
  );
}
