import { loja } from '../lib/loja.js';

export default function Rodape() {
  const whatsapp = loja.whatsapp.replace(/\D/g, '');
  return (
    <footer className="rodape">
      <div className="conteudo rodape-grade">
        <div>
          <p className="rodape-nome">{loja.nome}</p>
          {loja.razaoSocial && <p>{loja.razaoSocial}</p>}
          {loja.cnpj && <p>CNPJ {loja.cnpj}</p>}
          {loja.endereco && <p>{loja.endereco}</p>}
        </div>
        <div>
          <p className="rodape-titulo">Atendimento</p>
          {loja.telefone && (
            <p>
              Telefone: <a href={`tel:${loja.telefone.replace(/[^\d+]/g, '')}`}>{loja.telefone}</a>
            </p>
          )}
          {whatsapp && (
            <p>
              WhatsApp:{' '}
              <a href={`https://wa.me/${whatsapp.length <= 11 ? `55${whatsapp}` : whatsapp}`} target="_blank" rel="noopener noreferrer">
                {loja.whatsapp}
              </a>
            </p>
          )}
          {loja.email && (
            <p>
              E-mail: <a href={`mailto:${loja.email}`}>{loja.email}</a>
            </p>
          )}
          {loja.horario && <p>{loja.horario}</p>}
          {loja.instagram && (
            <p>
              Instagram:{' '}
              <a href={`https://instagram.com/${loja.instagram.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer">
                {loja.instagram}
              </a>
            </p>
          )}
        </div>
        <div>
          <p className="rodape-titulo">Venda para lojistas</p>
          <p>Catálogo exclusivo para pet shops. Preços por unidade; frete e pagamento são combinados com o vendedor.</p>
        </div>
      </div>
      <div className="conteudo">
        <p className="rodape-copy">
          © {new Date().getFullYear()} {loja.nome}. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
