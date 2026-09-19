import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminLogin } from '../../lib/api.js';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(evento) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await adminLogin(email, senha);
      navigate('/admin/produtos', { replace: true });
    } catch (err) {
      setErro(err.message || 'Não foi possível entrar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="sec wrap" style={{ maxWidth: 360, margin: '60px auto', float: 'none' }}>
      <h1 className="sec-title">Admin</h1>

      {erro && <p className="alerta-erro">{erro}</p>}

      <form onSubmit={handleSubmit}>
        <div className="form-campo">
          <label htmlFor="email">E-mail</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="form-campo">
          <label htmlFor="senha">Senha</label>
          <input
            id="senha"
            type="password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </div>
        <button type="submit" className="cta-primario" disabled={enviando} style={{ width: '100%' }}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </section>
  );
}
