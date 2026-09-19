import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { adminMe, adminLogout } from '../../lib/api.js';

export default function AdminLayout() {
  const [email, setEmail] = useState(null);
  const [verificando, setVerificando] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelado = false;
    adminMe()
      .then((dados) => {
        if (!cancelado) {
          setEmail(dados.email);
          setVerificando(false);
        }
      })
      .catch(() => {
        if (!cancelado) navigate('/admin/login', { replace: true });
      });
    return () => {
      cancelado = true;
    };
  }, [navigate]);

  async function handleLogout() {
    await adminLogout().catch(() => {});
    navigate('/admin/login', { replace: true });
  }

  if (verificando) {
    return <p className="vazio">Verificando sessão…</p>;
  }

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div className="admin-topbar-in wrap">
          <span className="brand-name" style={{ fontSize: 18 }}>
            Ruf<i>u</i>s <span className="admin-tag mono">ADMIN</span>
          </span>
          <nav className="admin-nav">
            <NavLink to="/admin/produtos" className={({ isActive }) => (isActive ? 'on' : '')}>
              Produtos
            </NavLink>
            <NavLink to="/admin/pedidos" className={({ isActive }) => (isActive ? 'on' : '')}>
              Pedidos
            </NavLink>
          </nav>
          <div className="admin-topbar-user mono">
            {email}
            <button type="button" onClick={handleLogout}>
              sair
            </button>
          </div>
        </div>
      </header>
      <main className="wrap sec">
        <Outlet />
      </main>
    </div>
  );
}
