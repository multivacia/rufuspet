import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProdutosProvider } from './lib/produtos.jsx';
import { CarrinhoProvider } from './lib/carrinho.jsx';
import { LojaProvider } from './lib/dadosLoja.jsx';
import Topbar from './components/Topbar.jsx';
import Rodape from './components/Rodape.jsx';
import Catalogo from './views/Catalogo.jsx';
import Pedido from './views/Pedido.jsx';
import Confirmacao from './views/Confirmacao.jsx';
import BarraPedido from './components/BarraPedido.jsx';
import AdminLayout from './components/admin/AdminLayout.jsx';
import AdminLogin from './views/admin/Login.jsx';
import AdminProdutos from './views/admin/Produtos.jsx';
import AdminPedidos from './views/admin/Pedidos.jsx';
import AdminLoja from './views/admin/Loja.jsx';

function Loja() {
  return (
    <ProdutosProvider>
      <CarrinhoProvider>
        <div className="loja">
          <Topbar />
          <main>
            <Routes>
              <Route path="/" element={<Catalogo />} />
              <Route path="/pedido" element={<Pedido />} />
              <Route path="/pedido/enviado" element={<Confirmacao />} />
              <Route path="/carrinho" element={<Navigate to="/pedido" replace />} />
              <Route path="/checkout" element={<Navigate to="/pedido" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <Rodape />
          <BarraPedido />
        </div>
      </CarrinhoProvider>
    </ProdutosProvider>
  );
}

export default function App() {
  return (
    <LojaProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="produtos" replace />} />
          <Route path="produtos" element={<AdminProdutos />} />
          <Route path="pedidos" element={<AdminPedidos />} />
          <Route path="loja" element={<AdminLoja />} />
        </Route>
        <Route path="/*" element={<Loja />} />
      </Routes>
    </BrowserRouter>
    </LojaProvider>
  );
}
