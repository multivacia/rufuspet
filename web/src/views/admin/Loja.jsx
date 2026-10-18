import { useEffect, useState } from 'react';
import { adminBuscarLoja, adminAtualizarLoja } from '../../lib/api.js';

const CAMPOS = [
  ['nome', 'Nome da loja', 'Aparece no rodapé e nos e-mails.'],
  ['razaoSocial', 'Razão social', ''],
  ['cnpj', 'CNPJ', '00.000.000/0000-00'],
  ['telefone', 'Telefone', '(11) 0000-0000'],
  ['whatsapp', 'WhatsApp', '(11) 90000-0000 — vira link para conversa'],
  ['emailContato', 'E-mail de contato', 'Também é o "responder" da confirmação enviada ao cliente.'],
  ['endereco', 'Endereço ou região', 'Ex.: Grande São Paulo'],
  ['horario', 'Horário de atendimento', 'Ex.: Seg. a sex., 8h às 18h'],
  ['instagram', 'Instagram', '@usuario'],
];

export default function Loja() {
  const [dados, setDados] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    adminBuscarLoja()
      .then(setDados)
      .catch((err) => setErro({ mensagem: err.message }));
  }, []);

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    setSalvo(false);
    try {
      setDados(await adminAtualizarLoja(dados));
      setSalvo(true);
    } catch (err) {
      setErro({ mensagem: err.message, campo: err.campo });
    } finally {
      setSalvando(false);
    }
  }

  if (!dados) return erro ? <p className="alerta-erro">{erro.mensagem}</p> : <p className="vazio">Carregando…</p>;

  return (
    <>
      <h1 className="sec-title">
        Dados da loja
        <small>Exibidos no rodapé do site e nos e-mails. Campos vazios não aparecem.</small>
      </h1>
      <form onSubmit={salvar} style={{ maxWidth: 560 }}>
        {CAMPOS.map(([campo, rotulo, ajuda]) => (
          <div className="form-campo" key={campo}>
            <label htmlFor={`loja-${campo}`}>{rotulo}</label>
            <input
              id={`loja-${campo}`}
              type="text"
              value={dados[campo] ?? ''}
              aria-invalid={erro?.campo === campo || undefined}
              onChange={(e) => {
                setSalvo(false);
                setDados((d) => ({ ...d, [campo]: e.target.value }));
              }}
            />
            {erro?.campo === campo ? (
              <p className="alerta-erro" style={{ margin: '6px 0 0' }}>{erro.mensagem}</p>
            ) : (
              ajuda && <p className="pdesc">{ajuda}</p>
            )}
          </div>
        ))}
        {erro && !erro.campo && <p className="alerta-erro">{erro.mensagem}</p>}
        <button type="submit" className="cta-primario" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
        {salvo && (
          <span className="mono" style={{ marginLeft: 14, color: 'var(--lime-deep)' }}>
            ✓ Salvo — já aparece no site
          </span>
        )}
      </form>
    </>
  );
}
