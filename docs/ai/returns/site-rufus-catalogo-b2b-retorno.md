# Retorno — site-rufus-catalogo-b2b

- **TASK_ID:** site-rufus-catalogo-b2b
- **Data/hora:** 2026-10-11
- **Objetivo:** criar do zero o site B2B da Rufus: catálogo com fotos e preços, montagem de pedido e envio por e-mail para a loja; o vendedor fecha a venda por telefone.
- **Status final:** MVP concluído e validado localmente; aguardando criação do repositório remoto e configuração de SMTP/hospedagem.
- **Branch:** main (repositório local novo, sem remoto)
- **SHA inicial:** — (repositório criado nesta atividade)
- **SHA final:** ver `git log -1` (commit inicial)

## O que foi feito
- Next.js 15 (App Router) + TypeScript; sem banco de dados, sem login, sem pagamento, sem estoque.
- Catálogo em `src/lib/catalogo.ts`: kit 3 rolos (R$ 11,90), kit 6 rolos (R$ 18,90), kit porta-saquinhos + 2 rolos (R$ 12,90; verde/azul/rosa), pote dobrável (R$ 16,90; preto/azul/vermelho/rosa). Foto troca conforme a cor.
- Pedido no navegador (persistido em localStorage), página de revisão com ajuste de quantidades e formulário: razão social, nome fantasia, CNPJ (validação de dígitos), responsável, telefone, e-mail, cidade/UF, observações, aceite LGPD.
- `POST /api/pedido`: validação com zod, preços recalculados no servidor, número `RF-AAAAMMDD-XXXX`, e-mail à loja (reply-to = cliente) e cópia opcional ao cliente; honeypot anti-robô e limite de 5 pedidos/10 min por IP (melhor esforço).
- Envio por SMTP (nodemailer). Sem SMTP em dev: e-mail impresso no terminal; em produção: erro 502 ao cliente.
- Rodapé e nome da loja lidos de variáveis de ambiente (`LOJA_*`), com dados fictícios em `.env.example`.
- PWA: manifest + ícones, instalável na tela inicial.

## Arquivos
Criados: estrutura completa do projeto (`src/`, `public/produtos/*.webp`, `public/icones/*`, `tests/pedido.test.ts`, `.env.example`, `README.md`, configs). `.env.local` criado localmente com `PEDIDOS_EMAIL_DESTINO=gustavoramosalmeida@gmail.com` (não versionado).

## Migrations
Nenhuma (não há banco).

## Decisões
- Preços tratados como preço por unidade para o lojista, sem pedido mínimo (não informado).
- E-mail de destino fica só no `.env.local`/painel da hospedagem, para não expor no repositório.
- Fotos convertidas de PNG (~1,5 MB cada) para WebP 900px (~50 KB cada).

## Validação executada
- `npx tsc --noEmit` → OK
- `npx vitest run` → 7/7 testes passaram (1 falha inicial no próprio teste por espaço não separável em "R$", corrigida)
- `npm run lint` → sem avisos ou erros
- `npm run build` → OK
- E2E com Playwright/Chromium em `next dev`: adicionar 3 itens com cores → CNPJ inválido recusado → envio com CNPJ válido → página de sucesso → carrinho limpo; e-mail simulado com total R$ 239,50 conferido; sem erros JS em desktop e mobile.

## Pendências e riscos
- Repositório GitHub ainda não criado (aguarda autorização).
- Configurar SMTP real (ex.: Gmail com senha de app) e testar envio de verdade.
- Substituir dados fictícios do rodapé; definir domínio e hospedagem (sugestão: Vercel).
- Logo recriado em CSS/SVG; trocar pelo arquivo original quando disponível.
- Limite por IP é em memória (por instância); suficiente para o volume esperado.

## Próximo passo recomendado
Criar o repositório, publicar na Vercel com as variáveis configuradas e fazer um pedido de teste real.

## Git
Working tree limpo após commit inicial local; sem push (sem remoto).

Uso/tokens disponíveis: INDISPONÍVEL — a sessão não fornece métrica confiável.
