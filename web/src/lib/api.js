const BASE = '/api';

async function requisitar(caminho, opcoes) {
  const resposta = await fetch(BASE + caminho, {
    headers: { 'Content-Type': 'application/json' },
    ...opcoes,
  });

  const dados = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    const erro = dados?.erro ?? { codigo: 'ERRO_DESCONHECIDO', mensagem: 'Erro inesperado, tente novamente.' };
    throw Object.assign(new Error(erro.mensagem), { codigo: erro.codigo, campo: erro.campo, status: resposta.status });
  }

  return dados;
}

export function buscarProdutos() {
  return requisitar('/produtos');
}

export function buscarLoja() {
  return requisitar('/loja');
}

export function adminBuscarLoja() {
  return requisitar('/admin/loja');
}

export function adminAtualizarLoja(campos) {
  return requisitar('/admin/loja', { method: 'PUT', body: JSON.stringify(campos) });
}

export function criarPedido(payload) {
  return requisitar('/pedidos', { method: 'POST', body: JSON.stringify(payload) });
}

export function adminMe() {
  return requisitar('/admin/me');
}

export function adminLogin(email, senha) {
  return requisitar('/admin/login', { method: 'POST', body: JSON.stringify({ email, senha }) });
}

export function adminLogout() {
  return requisitar('/admin/logout', { method: 'POST' });
}

export function adminListarProdutos() {
  return requisitar('/admin/produtos');
}

export function adminAtualizarProduto(sku, campos) {
  return requisitar(`/admin/produtos/${encodeURIComponent(sku)}`, { method: 'PATCH', body: JSON.stringify(campos) });
}

export function adminListarPedidos({ pagina = 1, porPagina = 20, busca = '' } = {}) {
  const params = new URLSearchParams({ pagina, porPagina });
  if (busca) params.set('busca', busca);
  return requisitar(`/admin/pedidos?${params}`);
}

export function adminReenviarEmails(id) {
  return requisitar(`/admin/pedidos/${id}/reenviar-emails`, { method: 'POST' });
}

export function adminAtualizarPedido(id, campos) {
  return requisitar(`/admin/pedidos/${id}`, { method: 'PATCH', body: JSON.stringify(campos) });
}

async function enviarArquivo(caminho, metodo, arquivo, extras = {}) {
  const form = new FormData();
  form.append('foto', arquivo, 'foto.jpg');
  for (const [campo, valor] of Object.entries(extras)) form.append(campo, valor);
  const resposta = await fetch(BASE + caminho, { method: metodo, body: form });
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const erro = dados?.erro ?? { codigo: 'ERRO_DESCONHECIDO', mensagem: 'Não foi possível enviar a foto.' };
    throw Object.assign(new Error(erro.mensagem), { codigo: erro.codigo, status: resposta.status });
  }
  return dados;
}

export function adminListarFotos(chave) {
  return requisitar(`/admin/produtos/${encodeURIComponent(chave)}/fotos`);
}

export function adminEnviarFoto(chave, arquivo) {
  return enviarArquivo(`/admin/produtos/${encodeURIComponent(chave)}/fotos`, 'POST', arquivo);
}

export function adminLegendaFoto(id, legenda) {
  return requisitar(`/admin/fotos/${id}`, { method: 'PATCH', body: JSON.stringify({ legenda }) });
}

export function adminOrdenarFotos(chave, ids) {
  return requisitar(`/admin/produtos/${encodeURIComponent(chave)}/fotos/ordem`, { method: 'PUT', body: JSON.stringify({ ids }) });
}

export function adminExcluirFoto(id) {
  return requisitar(`/admin/fotos/${id}`, { method: 'DELETE' });
}

export function adminTrocarFotoPrincipal(sku, arquivo) {
  return enviarArquivo(`/admin/produtos/${encodeURIComponent(sku)}/imagem`, 'PUT', arquivo);
}

// Achata a resposta agrupada de GET /api/produtos numa lista de SKUs
// compráveis (uma linha por variante), pra facilitar consulta por sku
// no pedido.
export function achatarItensComprariveis(produtos) {
  const itens = [];
  for (const produto of produtos) {
    const variantes = produto.variantes ?? [{ sku: produto.sku, cor: null, hex: null, imagem: produto.imagem }];
    for (const variante of variantes) {
      itens.push({
        sku: variante.sku,
        grupo: produto.grupo,
        nome: produto.nome,
        descricao: produto.descricao,
        cor: variante.cor,
        hex: variante.hex,
        imagem: variante.imagem,
        unidade: produto.unidade,
        precoUnitario: produto.precoUnitario,
      });
    }
  }
  return itens;
}
