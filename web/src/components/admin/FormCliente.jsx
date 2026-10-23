import { useState } from 'react';
import { formatarDocumento } from '../../lib/formato.js';

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

export const CLIENTE_VAZIO = {
  tipo: 'PJ',
  nome: '',
  nomeFantasia: '',
  documento: '',
  inscricaoEstadual: '',
  comprador: '',
  whatsapp: '',
  email: '',
  cidade: '',
  uf: '',
  endereco: '',
  vendedor: '',
  observacoes: '',
  ativo: true,
};

/** Monta um cadastro a partir dos dados que vieram numa solicitação do site. */
export function clienteDaSolicitacao(pedido) {
  const doc = String(pedido.cnpj ?? '');
  return {
    ...CLIENTE_VAZIO,
    tipo: doc.length === 11 || (!doc && !pedido.razao_social) ? 'PF' : 'PJ',
    nome: pedido.razao_social || pedido.contato_nome || '',
    nomeFantasia: pedido.nome_fantasia || '',
    documento: doc,
    comprador: pedido.contato_nome || '',
    whatsapp: pedido.contato_whatsapp || '',
    email: pedido.contato_email || '',
    cidade: pedido.cidade || '',
    uf: pedido.uf || '',
    vendedor: pedido.vendedor || '',
  };
}

/**
 * Formulário de cadastro do cliente (novo, edição e "criar a partir da solicitação").
 * onSalvar(dados) deve devolver uma Promise; erros com .campo marcam o campo.
 */
export default function FormCliente({ inicial, onSalvar, onCancelar, rotuloBotao = 'Salvar', vendedores = [] }) {
  const [c, setC] = useState(() => ({ ...CLIENTE_VAZIO, ...inicial, documento: formatarDocumento(inicial?.documento ?? '') }));
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(false);

  const set = (campo) => (e) => {
    const valor = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setC((x) => ({ ...x, [campo]: valor }));
    setOk(false);
  };
  const classe = (campo) => (erro?.campo === campo ? 'form-campo com-erro' : 'form-campo');

  async function enviar(e) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      await onSalvar(c);
      setOk(true);
    } catch (err) {
      setErro({ mensagem: err.message, campo: err.campo });
    } finally {
      setSalvando(false);
    }
  }

  const campo = (nome, rotulo, extra = {}) => (
    <div className={classe(nome)}>
      <label htmlFor={`cli-${nome}`}>{rotulo}</label>
      <input id={`cli-${nome}`} value={c[nome]} onChange={set(nome)} {...extra} />
    </div>
  );

  return (
    <form className="form-cliente" onSubmit={enviar}>
      <div className="grade-cliente">
        <div className={classe('tipo')}>
          <label htmlFor="cli-tipo">Tipo</label>
          <select id="cli-tipo" value={c.tipo} onChange={set('tipo')}>
            <option value="PJ">Pessoa jurídica</option>
            <option value="PF">Pessoa física</option>
          </select>
        </div>
        {campo('nome', c.tipo === 'PF' ? 'Nome *' : 'Razão social *', { required: true, maxLength: 150 })}
        {campo('nomeFantasia', 'Nome fantasia', { maxLength: 150 })}
        {campo('documento', c.tipo === 'PF' ? 'CPF' : 'CNPJ', { inputMode: 'numeric', maxLength: 18 })}
        {campo('inscricaoEstadual', 'Inscrição estadual', { maxLength: 20, placeholder: 'número ou ISENTO' })}
        {campo('comprador', 'Comprador responsável', { maxLength: 100 })}
        {campo('whatsapp', 'WhatsApp do comprador', { inputMode: 'tel', maxLength: 20 })}
        {campo('email', 'E-mail do comprador', { type: 'email', maxLength: 150 })}
        {campo('cidade', 'Cidade', { maxLength: 100 })}
        <div className={classe('uf')}>
          <label htmlFor="cli-uf">UF</label>
          <select id="cli-uf" value={c.uf} onChange={set('uf')}>
            <option value="">—</option>
            {UFS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </div>
        <div className={`${classe('endereco')} largo`}>
          <label htmlFor="cli-endereco">Endereço</label>
          <input id="cli-endereco" value={c.endereco} onChange={set('endereco')} maxLength={300} />
        </div>
        <div className={classe('vendedor')}>
          <label htmlFor="cli-vendedor">Vendedor responsável</label>
          <input id="cli-vendedor" list="cli-vendedores" autoComplete="off" value={c.vendedor} onChange={set('vendedor')} maxLength={80} />
          <datalist id="cli-vendedores">
            {vendedores.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </div>
        <div className={`${classe('observacoes')} largo`}>
          <label htmlFor="cli-obs">Observações</label>
          <input id="cli-obs" value={c.observacoes} onChange={set('observacoes')} maxLength={1000} />
        </div>
        <label className="check-ativo">
          <input type="checkbox" checked={c.ativo} onChange={set('ativo')} /> Ativo
        </label>
      </div>
      <div className="emails-acoes">
        <button type="submit" className="cta-primario" disabled={salvando}>
          {salvando ? 'Salvando…' : rotuloBotao}
        </button>
        {onCancelar && (
          <button type="button" className="botao-sec" onClick={onCancelar}>
            Cancelar
          </button>
        )}
        {ok && <span className="email-ok">✓ Salvo.</span>}
        {erro && <span className="email-erro">{erro.mensagem}</span>}
      </div>
    </form>
  );
}
