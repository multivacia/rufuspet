import { Router } from 'express';
import { criarPedido, ErroPedido } from '../services/pedido.service.js';
import { processarPedido } from '../services/notificacao.service.js';
import { pedidosRateLimit } from '../middleware/ratelimit.js';

export const pedidosRouter = Router();

pedidosRouter.post('/pedidos', pedidosRateLimit, async (req, res, next) => {
  try {
    // Campo invisível do formulário: se veio preenchido, é robô. Finge sucesso e não grava nada.
    if (req.body?.website) {
      return res.status(201).json({ numero: 'RFS-0000-0000', valorTotal: 0 });
    }

    const resultado = await criarPedido(req.body ?? {});
    res.status(resultado.reaproveitado ? 200 : 201).json({
      numero: resultado.numero,
      valorTotal: resultado.valorTotal,
    });

    // Depois de responder: TXT + e-mails. O pedido já está salvo no banco.
    processarPedido(resultado.id).catch((err) => console.error(`pos-pedido ${resultado.numero}:`, err));
  } catch (err) {
    if (err instanceof ErroPedido) {
      return res
        .status(err.status)
        .json({ erro: { codigo: err.codigo, mensagem: err.message, ...(err.campo ? { campo: err.campo } : {}) } });
    }
    next(err);
  }
});
