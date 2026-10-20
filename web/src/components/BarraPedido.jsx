import { Link, useLocation } from 'react-router-dom';
import { useCarrinho } from '../lib/carrinho.jsx';
import { useProdutos } from '../lib/produtos.jsx';
import { brl } from '../lib/formato.js';
import { useLoja } from '../lib/dadosLoja.jsx';

export default function BarraPedido() {
  const { itens, totalItens } = useCarrinho();
  const { itensPorSku } = useProdutos();
  const { pathname } = useLocation();
  const { pedidoMinimo } = useLoja();
  if (totalItens === 0 || pathname.startsWith('/pedido')) return null;

  const total = Object.entries(itens).reduce((soma, [sku, qtd]) => soma + (itensPorSku.get(sku)?.precoUnitario ?? 0) * qtd, 0);
  return (
    <div className="barra-pedido">
      <div>
        <b>{totalItens}</b> {totalItens === 1 ? 'unidade' : 'unidades'} · <b>{brl(total)}</b>
        {total < pedidoMinimo && <div className="barra-falta">Faltam {brl(pedidoMinimo - total)} para o pedido mínimo</div>}
      </div>
      <Link to="/pedido" className="botao botao-claro">
        Revisar pedido →
      </Link>
    </div>
  );
}
