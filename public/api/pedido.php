<?php
// Recebe o pedido do site (POST JSON), grava um TXT e, se configurado, envia por e-mail.
// Configuração: arquivo rufus.env FORA do public_html (veja .env.servidor.example).

declare(strict_types=1);
require __DIR__ . '/_pedido.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function responder(int $status, array $corpo): never
{
    http_response_code($status);
    echo json_encode($corpo, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') responder(405, ['erro' => 'Método não permitido.']);

// Procura a configuração: variável RUFUS_ENV ou rufus.env um nível acima do public_html (em dev, a raiz do projeto).
$arquivosEnv = array_filter([getenv('RUFUS_ENV') ?: null, dirname(__DIR__, 2) . '/rufus.env']);
$env = [];
foreach ($arquivosEnv as $arq) {
    if (is_readable($arq)) { $env = carregar_env($arq); break; }
}
$cfg = fn(string $k, string $padrao = '') => trim($env[$k] ?? '') !== '' ? trim($env[$k]) : $padrao;

date_default_timezone_set($cfg('FUSO_HORARIO', 'America/Sao_Paulo'));
$pasta = $cfg('PEDIDOS_PASTA', dirname(__DIR__, 2) . '/rufus-pedidos');
if (!is_dir($pasta) && !@mkdir($pasta, 0750, true)) {
    error_log("rufus: não foi possível criar a pasta de pedidos $pasta");
    responder(500, ['erro' => 'Não foi possível registrar o pedido agora. Fale com a gente pelo telefone.']);
}

// Limite simples: 5 pedidos a cada 10 minutos por IP.
$ip = $_SERVER['REMOTE_ADDR'] ?? 'desconhecido';
$arqLimite = $pasta . '/.limite-' . hash('sha256', $ip);
$agoraTs = time();
$recentes = array_filter(
    array_map('intval', is_readable($arqLimite) ? file($arqLimite, FILE_IGNORE_NEW_LINES) : []),
    fn(int $t) => $agoraTs - $t < 600,
);
if (count($recentes) >= 5) responder(429, ['erro' => 'Muitos pedidos em pouco tempo. Tente novamente em alguns minutos.']);
$recentes[] = $agoraTs;
@file_put_contents($arqLimite, implode("\n", $recentes));

$corpo = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($corpo)) responder(400, ['erro' => 'Requisição inválida.']);

$agora = new DateTimeImmutable();
$numero = gerar_numero($agora);

// Robô preencheu o campo invisível: finge sucesso e não registra nada.
if (!empty($corpo['website'])) responder(200, ['numero' => $numero]);

try {
    if (($corpo['aceite'] ?? false) !== true) throw new PedidoInvalido('É necessário autorizar o contato.', 'aceite');
    $catalogo = json_decode((string)file_get_contents(__DIR__ . '/catalogo.json'), true, 512, JSON_THROW_ON_ERROR);
    $linhas = montar_linhas($corpo['itens'] ?? null, $catalogo);
    $cliente = validar_cliente($corpo['cliente'] ?? null);
} catch (PedidoInvalido $e) {
    responder(400, ['erro' => $e->getMessage(), 'erros' => [['campo' => $e->campo, 'mensagem' => $e->getMessage()]]]);
}

$texto = texto_pedido($numero, $agora, $cliente, $linhas);
$arquivo = sprintf('%s/%s_%s.txt', $pasta, $agora->format('Y-m-d_His'), $numero);
if (file_put_contents($arquivo, $texto, LOCK_EX) === false) {
    error_log("rufus: falha ao gravar $arquivo");
    responder(500, ['erro' => 'Não foi possível registrar o pedido agora. Fale com a gente pelo telefone.']);
}

// E-mail opcional (desligado até PEDIDOS_ENVIAR_EMAIL=true). Falha no e-mail não perde o pedido: o TXT já foi gravado.
if ($cfg('PEDIDOS_ENVIAR_EMAIL', 'false') === 'true' && $cfg('PEDIDOS_EMAIL_DESTINO') !== '') {
    $loja = $cfg('LOJA_NOME', 'Rufus');
    $remetente = $cfg('PEDIDOS_EMAIL_REMETENTE', $cfg('PEDIDOS_EMAIL_DESTINO'));
    $cab = fn(string $replyTo) => implode("\r\n", [
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        'From: ' . mb_encode_mimeheader("$loja Pedidos") . " <$remetente>",
        "Reply-To: $replyTo",
    ]);
    $total = formatar_preco(array_sum(array_column($linhas, 'subtotal')));
    $assunto = "Novo pedido $numero — " . ($cliente['nomeFantasia'] ?: $cliente['razaoSocial']) . " ($total)";
    if (!mail($cfg('PEDIDOS_EMAIL_DESTINO'), mb_encode_mimeheader($assunto), $texto, $cab($cliente['email']))) {
        error_log("rufus: falha ao enviar e-mail do pedido $numero");
    }
    if ($cfg('PEDIDOS_COPIA_CLIENTE', 'false') === 'true') {
        $msg = "Olá, {$cliente['contato']}!\n\nRecebemos seu pedido. Um vendedor entrará em contato para confirmar "
             . "condições de pagamento e entrega.\n\n$texto\n$loja\n";
        @mail($cliente['email'], mb_encode_mimeheader("$loja: recebemos seu pedido $numero"), $msg, $cab($remetente));
    }
}

responder(200, ['numero' => $numero]);
