import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProdutosProvider } from './lib/produtos.jsx';
import { CarrinhoProvider } from './lib/carrinho.jsx';
import Topbar from './components/Topbar.jsx';
import Rodape from './components/Rodape.jsx';
import Catalogo from './views/Catalogo.jsx';
import Carrinho from './views/Carrinho.jsx';
import Checkout from './views/Checkout.jsx';
import Confirmacao from './views/Confirmacao.jsx';
import AdminLayout from './components/admin/AdminLayout.jsx';
import AdminLogin from './views/admin/Login.jsx';
import AdminProdutos from './views/admin/Produtos.jsx';
import AdminPedidos from './views/admin/Pedidos.jsx';

function Loja() {
  return (
    <ProdutosProvider>
      <CarrinhoProvider>
        <Topbar />
        <Routes>
          <Route path="/" element={<Catalogo />} />
          <Route path="/carrinho" element={<Carrinho />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/confirmacao" element={<Confirmacao />} />
        </Routes>
        <Rodape />
      </CarrinhoProvider>
    </ProdutosProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="produtos" replace />} />
          <Route path="produtos" element={<AdminProdutos />} />
          <Route path="pedidos" element={<AdminPedidos />} />
        </Route>
        <Route path="/*" element={<Loja />} />
      </Routes>
    </BrowserRouter>
  );
}
