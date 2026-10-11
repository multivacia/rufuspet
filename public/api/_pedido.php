<?php
// Regras do pedido: validação, cálculo com preços do catálogo e texto do TXT/e-mail.
// Arquivo de biblioteca: o .htaccess bloqueia acesso direto a arquivos que começam com "_".

declare(strict_types=1);

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA',
             'PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

final class PedidoInvalido extends Exception
{
    public function __construct(string $mensagem, public readonly string $campo = '')
    {
        parent::__construct($mensagem);
    }
}

/** Lê um arquivo no formato .env (CHAVE=valor). Aspas externas são removidas. */
function carregar_env(string $arquivo): array
{
    $vars = [];
    if (!is_readable($arquivo)) return $vars;
    foreach (file($arquivo, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $linha) {
        $linha = trim($linha);
        if ($linha === '' || $linha[0] === '#' || !str_contains($linha, '=')) continue;
        [$chave, $valor] = array_map('trim', explode('=', $linha, 2));
        if (strlen($valor) >= 2 && ($valor[0] === '"' || $valor[0] === "'") && $valor[-1] === $valor[0]) {
            $valor = substr($valor, 1, -1);
        }
        $vars[$chave] = $valor;
    }
    return $vars;
}

function somente_digitos(string $v): string
{
    return preg_replace('/\D/', '', $v) ?? '';
}

function cnpj_valido(string $valor): bool
{
    $c = somente_digitos($valor);
    if (strlen($c) !== 14 || preg_match('/^(\d)\1{13}$/', $c)) return false;
    $digito = function (string $base): int {
        $soma = 0;
        $peso = strlen($base) - 7;
        foreach (str_split($base) as $d) {
            $soma += (int)$d * $peso--;
            if ($peso < 2) $peso = 9;
        }
        $resto = $soma % 11;
        return $resto < 2 ? 0 : 11 - $resto;
    };
    $d1 = $digito(substr($c, 0, 12));
    $d2 = $digito(substr($c, 0, 12) . $d1);
    return str_ends_with($c, "$d1$d2");
}

function formatar_cnpj(string $v): string
{
    return preg_replace('/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/', '$1.$2.$3/$4-$5', somente_digitos($v)) ?? $v;
}

function formatar_preco(int $centavos): string
{
    return 'R$ ' . number_format($centavos / 100, 2, ',', '.');
}

function texto_campo(array $dados, string $campo, int $min, int $max, string $mensagem): string
{
    $v = $dados[$campo] ?? '';
    if (!is_string($v)) throw new PedidoInvalido($mensagem, "cliente.$campo");
    // Remove quebras de linha e caracteres de controle (evita bagunçar o TXT e cabeçalhos de e-mail).
    $v = trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $v) ?? '');
    $tam = mb_strlen($v);
    if ($tam < $min || $tam > $max) throw new PedidoInvalido($mensagem, "cliente.$campo");
    return $v;
}

/** Valida o JSON recebido e devolve o cliente normalizado. */
function validar_cliente(mixed $c): array
{
    if (!is_array($c)) throw new PedidoInvalido('Dados da empresa ausentes.');
    $cliente = [
        'razaoSocial'  => texto_campo($c, 'razaoSocial', 2, 150, 'Informe a razão social.'),
        'nomeFantasia' => texto_campo($c, 'nomeFantasia', 0, 150, 'Nome fantasia muito longo.'),
        'cnpj'         => texto_campo($c, 'cnpj', 1, 20, 'CNPJ inválido.'),
        'contato'      => texto_campo($c, 'contato', 2, 100, 'Informe o nome do responsável.'),
        'telefone'     => texto_campo($c, 'telefone', 1, 20, 'Telefone inválido.'),
        'email'        => texto_campo($c, 'email', 3, 150, 'E-mail inválido.'),
        'cidade'       => texto_campo($c, 'cidade', 2, 100, 'Informe a cidade.'),
        'uf'           => texto_campo($c, 'uf', 2, 2, 'Selecione a UF.'),
        'observacoes'  => '',
    ];
    // Observações podem ter várias linhas.
    $obs = $c['observacoes'] ?? '';
    if (!is_string($obs) || mb_strlen($obs) > 1000) throw new PedidoInvalido('Observações muito longas.', 'cliente.observacoes');
    $cliente['observacoes'] = trim(preg_replace('/[\x00-\x09\x0B-\x1F\x7F]+/u', ' ', $obs) ?? '');

    if (!cnpj_valido($cliente['cnpj'])) throw new PedidoInvalido('CNPJ inválido.', 'cliente.cnpj');
    if (!in_array(strlen(somente_digitos($cliente['telefone'])), [10, 11], true)) {
        throw new PedidoInvalido('Telefone inválido.', 'cliente.telefone');
    }
    if (!filter_var($cliente['email'], FILTER_VALIDATE_EMAIL)) throw new PedidoInvalido('E-mail inválido.', 'cliente.email');
    if (!in_array($cliente['uf'], UFS, true)) throw new PedidoInvalido('Selecione a UF.', 'cliente.uf');
    return $cliente;
}

/**
 * Monta as linhas com o preço do catálogo (o preço enviado pelo navegador é ignorado)
 * e agrupa itens repetidos.
 */
function montar_linhas(mixed $itens, array $catalogo): array
{
    if (!is_array($itens) || count($itens) === 0) throw new PedidoInvalido('O pedido está vazio.');
    if (count($itens) > 50) throw new PedidoInvalido('Itens demais no pedido.');
    $produtos = array_column($catalogo['produtos'], null, 'id');
    $linhas = [];
    foreach ($itens as $item) {
        $id = is_array($item) ? ($item['produtoId'] ?? null) : null;
        $qtd = is_array($item) ? ($item['quantidade'] ?? null) : null;
        if (!is_string($id) || !isset($produtos[$id])) throw new PedidoInvalido('Produto inexistente no pedido.');
        if (!is_int($qtd) || $qtd < 1 || $qtd > 9999) throw new PedidoInvalido('Quantidade inválida.');
        $p = $produtos[$id];
        $descricao = $p['nome'];
        $variacaoId = '';
        if (!empty($p['variacoes'])) {
            $variacoes = array_column($p['variacoes'], null, 'id');
            $vid = $item['variacaoId'] ?? null;
            if (!is_string($vid) || !isset($variacoes[$vid])) throw new PedidoInvalido("Selecione a cor de {$p['nome']}.");
            $descricao .= ' — ' . $variacoes[$vid]['nome'];
            $variacaoId = $vid;
        }
        $chave = "$id:$variacaoId";
        $quantidade = ($linhas[$chave]['quantidade'] ?? 0) + $qtd;
        $linhas[$chave] = [
            'descricao' => $descricao,
            'quantidade' => $quantidade,
            'unitario' => (int)$p['precoCentavos'],
            'subtotal' => $quantidade * (int)$p['precoCentavos'],
        ];
    }
    return array_values($linhas);
}

function gerar_numero(DateTimeImmutable $agora): string
{
    $alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $sufixo = '';
    for ($i = 0; $i < 4; $i++) $sufixo .= $alfabeto[random_int(0, strlen($alfabeto) - 1)];
    return 'RF-' . $agora->format('Ymd') . '-' . $sufixo;
}

function texto_pedido(string $numero, DateTimeImmutable $data, array $cliente, array $linhas): string
{
    $total = array_sum(array_column($linhas, 'subtotal'));
    $unidades = array_sum(array_column($linhas, 'quantidade'));
    $sep = str_repeat('=', 60);
    $sub = str_repeat('-', 60);
    $t = "$sep\nPEDIDO $numero\nRecebido em: {$data->format('d/m/Y H:i')}\n$sep\n\n";
    $t .= "CLIENTE\n$sub\n";
    $campos = [
        'Razão social' => $cliente['razaoSocial'],
        'Nome fantasia' => $cliente['nomeFantasia'] ?: '—',
        'CNPJ' => formatar_cnpj($cliente['cnpj']),
        'Responsável' => $cliente['contato'],
        'Telefone/WhatsApp' => $cliente['telefone'],
        'E-mail' => $cliente['email'],
        'Cidade/UF' => "{$cliente['cidade']}/{$cliente['uf']}",
    ];
    foreach ($campos as $k => $v) $t .= str_pad($k . ':', 20 + strlen($k) - mb_strlen($k)) . "$v\n";
    $t .= "\nITENS\n$sub\n";
    foreach ($linhas as $l) {
        $t .= sprintf("%4dx  %s\n       %s/un.  =  %s\n", $l['quantidade'], $l['descricao'], formatar_preco($l['unitario']), formatar_preco($l['subtotal']));
    }
    $t .= "$sub\nTOTAL ($unidades unidades): " . formatar_preco($total) . "\n";
    $t .= "\nOBSERVAÇÕES\n$sub\n" . ($cliente['observacoes'] ?: '—') . "\n";
    return $t;
}
