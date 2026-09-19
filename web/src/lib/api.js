const BASE = '/api';

async function requisitar(caminho, opcoes) {
  const resposta = await fetch(BASE + caminho, {
    headers: { 'Content-Type': 'application/json' },
    ...opcoes,
  });

  const dados = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    const erro = dados?.erro ?? { codigo: 'ERRO_DESCONHECIDO', mensagem: 'Erro inesperado, tente novamente.' };
    throw Object.assign(new Error(erro.mensagem), { codigo: erro.codigo, status: resposta.status });
  }

  return dados;
}

export function buscarProdutos() {
  return requisitar('/produtos');
}

export function criarPedido(payload) {
  return requisitar('/pedidos', { method: 'POST', body: JSON.stringify(payload) });
}

// Achata a resposta agrupada de GET /api/produtos numa lista de SKUs
// comprariveis (uma linha por variante), pra facilitar consulta por sku
// no carrinho e no checkout.
export function achatarItensComprariveis(produtos) {
  const itens = [];
  for (const produto of produtos) {
    if (produto.variantes) {
      for (const variante of produto.variantes) {
        itens.push({
          sku: variante.sku,
          grupo: produto.grupo,
          nome: produto.nome,
          descricao: produto.descricao,
          cor: variante.cor,
          hex: variante.hex,
          imagem: variante.imagem,
          unidade: produto.unidade,
          precoCaixa: produto.precoCaixa,
          qtdPorCaixa: produto.qtdPorCaixa,
          limiteCaixas: variante.limiteCaixas,
        });
      }
    } else {
      itens.push({
        sku: produto.sku,
        grupo: null,
        nome: produto.nome,
        descricao: produto.descricao,
        cor: null,
        hex: null,
        imagem: produto.imagem,
        unidade: produto.unidade,
        precoCaixa: produto.precoCaixa,
        qtdPorCaixa: produto.qtdPorCaixa,
        limiteCaixas: produto.limiteCaixas,
      });
    }
  }
  return itens;
}
