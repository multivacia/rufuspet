import { Router } from 'express';
import { criarPedido, ErroPedido } from '../services/pedido.service.js';
import { pedidosRateLimit } from '../middleware/ratelimit.js';

export const pedidosRouter = Router();

pedidosRouter.post('/pedidos', pedidosRateLimit, async (req, res, next) => {
  try {
    const resultado = await criarPedido(req.body ?? {});
    res.status(resultado.reaproveitado ? 200 : 201).json({
      numero: resultado.numero,
      valorTotal: resultado.valorTotal,
    });
  } catch (err) {
    if (err instanceof ErroPedido) {
      return res.status(err.status).json({ erro: { codigo: err.codigo, mensagem: err.message } });
    }
    next(err);
  }
});
