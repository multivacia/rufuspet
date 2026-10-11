import Image from "next/image";
import { ProductCard } from "@/components/ProductCard";
import { Pata } from "@/components/Logo";
import { catalogo } from "@/lib/catalogo";

const vantagens = ["Pronta entrega", "Leve e portátil", "Cores disponíveis", "Ideal para passeios"];

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="container hero-conteudo">
          <div className="hero-texto">
            <p className="selo">Catálogo para lojistas</p>
            <h1>Saquinhos higiênicos e acessórios para passeio com pets</h1>
            <p>
              Escolha os produtos e as quantidades, envie o pedido e um vendedor entra em contato para combinar
              pagamento e entrega.
            </p>
            <a href="#produtos" className="botao botao-grande">
              Ver produtos
            </a>
          </div>
          <div className="hero-foto">
            <Image src="/produtos/kit-suporte-verde.webp" alt="Kit porta-saquinhos Rufus" width={420} height={420} priority />
          </div>
        </div>
      </section>

      <ul className="vantagens container" aria-label="Vantagens">
        {vantagens.map((v) => (
          <li key={v}>
            <Pata className="icone-pata" />
            {v}
          </li>
        ))}
      </ul>

      <section id="produtos" className="container linha-produtos" aria-labelledby="titulo-produtos">
        <h2 id="titulo-produtos">
          <Pata className="icone-pata" /> Saquinhos higiênicos e potes dobráveis
        </h2>
        <div className="grade">
          {catalogo.map((p, i) => (
            <ProductCard key={p.id} produto={p} prioridade={i < 2} />
          ))}
        </div>
        <p className="nota">Preços por unidade. Valores sujeitos à confirmação do vendedor no fechamento do pedido.</p>
      </section>
    </>
  );
}
