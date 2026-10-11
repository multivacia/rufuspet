"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { buscarProduto, formatarPreco } from "@/lib/catalogo";
import { UFS, somenteDigitos } from "@/lib/pedido";
import { useCarrinho } from "./CartProvider";
import { Quantidade } from "./Quantidade";

function mascaraCnpj(v: string) {
  const d = somenteDigitos(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function mascaraTelefone(v: string) {
  const d = somenteDigitos(v).slice(0, 11);
  if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}

const vazio = {
  razaoSocial: "",
  nomeFantasia: "",
  cnpj: "",
  contato: "",
  telefone: "",
  email: "",
  cidade: "",
  uf: "",
  observacoes: "",
};

export function CheckoutForm() {
  const { itens, carregado, definirQuantidade, remover, limpar, totalUnidades, totalCentavos } = useCarrinho();
  const router = useRouter();
  const [cliente, setCliente] = useState(vazio);
  const [aceite, setAceite] = useState(false);
  const [website, setWebsite] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [errosCampo, setErrosCampo] = useState<Record<string, string>>({});

  const campo = (nome: keyof typeof vazio) => ({
    id: nome,
    name: nome,
    value: cliente[nome],
    "aria-invalid": errosCampo[`cliente.${nome}`] ? true : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      let valor = e.target.value;
      if (nome === "cnpj") valor = mascaraCnpj(valor);
      if (nome === "telefone") valor = mascaraTelefone(valor);
      setCliente((c) => ({ ...c, [nome]: valor }));
    },
  });
  const erroDe = (nome: string) =>
    errosCampo[`cliente.${nome}`] && <span className="erro-campo">{errosCampo[`cliente.${nome}`]}</span>;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro("");
    setErrosCampo({});
    try {
      const resp = await fetch("/api/pedido.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens, cliente, aceite, website }),
      });
      const dados = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const mapa: Record<string, string> = {};
        for (const item of dados.erros ?? []) mapa[item.campo] ??= item.mensagem;
        setErrosCampo(mapa);
        setErro(dados.erro ?? "Não foi possível enviar o pedido.");
        return;
      }
      limpar();
      router.push(`/pedido/enviado?numero=${encodeURIComponent(dados.numero)}`);
    } catch {
      setErro("Sem conexão. Verifique a internet e tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  if (!carregado) return <p className="aviso">Carregando pedido…</p>;

  if (itens.length === 0) {
    return (
      <div className="vazio">
        <p>Seu pedido ainda está vazio.</p>
        <Link href="/#produtos" className="botao">
          Ver produtos
        </Link>
      </div>
    );
  }

  return (
    <div className="checkout">
      <section aria-labelledby="titulo-itens" className="painel">
        <h2 id="titulo-itens">Itens do pedido</h2>
        <ul className="itens">
          {itens.map((item) => {
            const produto = buscarProduto(item.produtoId)!;
            const variacao = produto.variacoes?.find((v) => v.id === item.variacaoId);
            const chave = `${item.produtoId}:${item.variacaoId ?? ""}`;
            return (
              <li key={chave} className="item">
                <Image src={variacao?.imagem ?? produto.imagem} alt="" width={72} height={72} />
                <div className="item-info">
                  <p className="item-nome">{produto.nome}</p>
                  {variacao && <p className="item-cor">Cor: {variacao.nome}</p>}
                  <p className="item-preco">{formatarPreco(produto.precoCentavos)} / un.</p>
                </div>
                <div className="item-acoes">
                  <Quantidade
                    valor={item.quantidade}
                    aoMudar={(q) => definirQuantidade(item.produtoId, item.variacaoId, q)}
                    rotulo={`Quantidade de ${produto.nome}`}
                  />
                  <p className="item-subtotal">{formatarPreco(produto.precoCentavos * item.quantidade)}</p>
                  <button type="button" className="link-remover" onClick={() => remover(item.produtoId, item.variacaoId)}>
                    Remover
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="total">
          <span>
            Total estimado ({totalUnidades} {totalUnidades === 1 ? "unidade" : "unidades"})
          </span>
          <b>{formatarPreco(totalCentavos)}</b>
        </div>
        <Link href="/#produtos" className="link-continuar">
          ← Continuar escolhendo
        </Link>
      </section>

      <form onSubmit={enviar} className="painel formulario" noValidate>
        <h2>Dados da sua empresa</h2>
        <p className="ajuda">Não há pagamento pelo site. Um vendedor entrará em contato para confirmar o pedido.</p>

        <div className="grade-campos">
          <label className="campo largo">
            Razão social *
            <input {...campo("razaoSocial")} required autoComplete="organization" />
            {erroDe("razaoSocial")}
          </label>
          <label className="campo largo">
            Nome fantasia
            <input {...campo("nomeFantasia")} />
          </label>
          <label className="campo">
            CNPJ *
            <input {...campo("cnpj")} required inputMode="numeric" placeholder="00.000.000/0000-00" />
            {erroDe("cnpj")}
          </label>
          <label className="campo">
            Responsável *
            <input {...campo("contato")} required autoComplete="name" />
            {erroDe("contato")}
          </label>
          <label className="campo">
            Telefone / WhatsApp *
            <input {...campo("telefone")} required type="tel" autoComplete="tel" placeholder="(00) 00000-0000" />
            {erroDe("telefone")}
          </label>
          <label className="campo">
            E-mail *
            <input {...campo("email")} required type="email" autoComplete="email" />
            {erroDe("email")}
          </label>
          <label className="campo">
            Cidade *
            <input {...campo("cidade")} required autoComplete="address-level2" />
            {erroDe("cidade")}
          </label>
          <label className="campo">
            UF *
            <select {...campo("uf")} required>
              <option value="">Selecione</option>
              {UFS.map((uf) => (
                <option key={uf}>{uf}</option>
              ))}
            </select>
            {erroDe("uf")}
          </label>
          <label className="campo largo">
            Observações
            <textarea {...campo("observacoes")} rows={3} placeholder="Ex.: melhor horário para contato, prazo desejado…" />
          </label>
        </div>

        <label className="armadilha" aria-hidden="true">
          Não preencha
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>

        <label className="aceite">
          <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
          <span>
            Autorizo o uso destes dados para contato sobre este pedido, conforme a LGPD. *
          </span>
        </label>
        {errosCampo.aceite && <span className="erro-campo">{errosCampo.aceite}</span>}

        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}

        <button type="submit" className="botao botao-grande" disabled={enviando}>
          {enviando ? "Enviando…" : "Enviar pedido"}
        </button>
      </form>
    </div>
  );
}
