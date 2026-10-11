<?php
// Testes da regra do pedido. Rodar: npm test (ou php tests/pedido_test.php).
declare(strict_types=1);
require __DIR__ . '/../public/api/_pedido.php';

$falhas = 0;
$total = 0;
function teste(string $nome, callable $fn): void
{
    global $falhas, $total;
    $total++;
    try {
        $fn();
        echo "ok   - $nome\n";
    } catch (Throwable $e) {
        $falhas++;
        echo "FAIL - $nome: {$e->getMessage()}\n";
    }
}
function verifica(bool $cond, string $msg = 'condição falsa'): void
{
    if (!$cond) throw new RuntimeException($msg);
}
function lanca(callable $fn, string $trecho = ''): void
{
    try {
        $fn();
    } catch (PedidoInvalido $e) {
        verifica($trecho === '' || str_contains($e->getMessage(), $trecho), "mensagem inesperada: {$e->getMessage()}");
        return;
    }
    throw new RuntimeException('esperava PedidoInvalido');
}

$catalogo = json_decode((string)file_get_contents(__DIR__ . '/../public/api/catalogo.json'), true);
$cliente = [
    'razaoSocial' => 'Pet Shop Exemplo Ltda', 'nomeFantasia' => '', 'cnpj' => '11.222.333/0001-81',
    'contato' => 'Maria', 'telefone' => '(11) 98765-4321', 'email' => 'maria@exemplo.com',
    'cidade' => 'Campinas', 'uf' => 'SP', 'observacoes' => "Ligar à tarde\nobrigada",
];

teste('CNPJ válido com e sem máscara', function () {
    verifica(cnpj_valido('11.222.333/0001-81'));
    verifica(cnpj_valido('11222333000181'));
});
teste('CNPJ inválido, curto ou repetido', function () {
    verifica(!cnpj_valido('11.222.333/0001-82'));
    verifica(!cnpj_valido('1122233300018'));
    verifica(!cnpj_valido('00000000000000'));
});
teste('linhas usam preço do catálogo e agrupam repetidos', function () use ($catalogo) {
    $l = montar_linhas([
        ['produtoId' => 'saquinhos-3-rolos', 'quantidade' => 10, 'precoCentavos' => 1],
        ['produtoId' => 'pote-dobravel', 'variacaoId' => 'azul', 'quantidade' => 2],
        ['produtoId' => 'pote-dobravel', 'variacaoId' => 'azul', 'quantidade' => 3],
        ['produtoId' => 'pote-dobravel', 'variacaoId' => 'rosa', 'quantidade' => 1],
    ], $catalogo);
    verifica(count($l) === 3, 'esperava 3 linhas');
    verifica($l[0]['subtotal'] === 11900, 'preço do navegador não pode valer');
    verifica($l[1]['descricao'] === 'Pote dobrável com mosquetão — Azul' && $l[1]['quantidade'] === 5 && $l[1]['subtotal'] === 8450);
    verifica(array_sum(array_column($l, 'subtotal')) === 11900 + 8450 + 1690);
});
teste('recusa itens inválidos', function () use ($catalogo) {
    lanca(fn() => montar_linhas([], $catalogo), 'vazio');
    lanca(fn() => montar_linhas([['produtoId' => 'x', 'quantidade' => 1]], $catalogo), 'inexistente');
    lanca(fn() => montar_linhas([['produtoId' => 'kit-suporte-2-rolos', 'quantidade' => 1]], $catalogo), 'cor');
    lanca(fn() => montar_linhas([['produtoId' => 'kit-suporte-2-rolos', 'variacaoId' => 'roxo', 'quantidade' => 1]], $catalogo), 'cor');
    lanca(fn() => montar_linhas([['produtoId' => 'saquinhos-6-rolos', 'quantidade' => 0]], $catalogo), 'Quantidade');
    lanca(fn() => montar_linhas([['produtoId' => 'saquinhos-6-rolos', 'quantidade' => '2']], $catalogo), 'Quantidade');
});
teste('cliente válido é aceito e normalizado', function () use ($cliente) {
    $c = validar_cliente($cliente);
    verifica($c['razaoSocial'] === 'Pet Shop Exemplo Ltda');
    verifica($c['observacoes'] === "Ligar à tarde\nobrigada");
});
teste('cliente inválido é recusado com o campo certo', function () use ($cliente) {
    foreach ([['email', 'x'], ['uf', 'XX'], ['cnpj', '123'], ['telefone', '123'], ['razaoSocial', ''], ['contato', ['a']]] as [$campo, $valor]) {
        try {
            validar_cliente([$campo => $valor] + $cliente);
            throw new RuntimeException("aceitou $campo inválido");
        } catch (PedidoInvalido $e) {
            verifica($e->campo === "cliente.$campo", "campo {$e->campo} != $campo");
        }
    }
});
teste('quebra de linha em campo simples vira espaço', function () use ($cliente) {
    $c = validar_cliente(['razaoSocial' => "Pet\r\nBcc: x@y.com"] + $cliente);
    verifica(!str_contains($c['razaoSocial'], "\n"));
});
teste('número do pedido tem formato RF-AAAAMMDD-XXXX', function () {
    verifica((bool)preg_match('/^RF-20261011-[A-Z2-9]{4}$/', gerar_numero(new DateTimeImmutable('2026-10-11'))));
});
teste('TXT contém cliente, itens e total', function () use ($catalogo, $cliente) {
    $l = montar_linhas([['produtoId' => 'saquinhos-3-rolos', 'quantidade' => 2]], $catalogo);
    $t = texto_pedido('RF-1', new DateTimeImmutable('2026-10-11 14:30'), validar_cliente($cliente), $l);
    foreach (['PEDIDO RF-1', '11/10/2026 14:30', '11.222.333/0001-81', 'Campinas/SP', 'R$ 23,80', 'TOTAL (2 unidades)'] as $trecho) {
        verifica(str_contains($t, $trecho), "faltou '$trecho'");
    }
});
teste('carregar_env lê chaves, ignora comentários e remove aspas', function () {
    $arq = tempnam(sys_get_temp_dir(), 'env');
    file_put_contents($arq, "# comentário\nA=1\nB=\"dois = 2\"\n\nC='três'\n");
    $env = carregar_env($arq);
    unlink($arq);
    verifica($env === ['A' => '1', 'B' => 'dois = 2', 'C' => 'três'], json_encode($env));
});

echo "\n$total testes, $falhas falha(s)\n";
exit($falhas > 0 ? 1 : 0);
