import rateLimit from 'express-rate-limit';

export const pedidosRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: { codigo: 'LIMITE_EXCEDIDO', mensagem: 'Muitos pedidos deste IP. Tente novamente mais tarde.' } },
});

export const adminLoginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: { codigo: 'LIMITE_EXCEDIDO', mensagem: 'Muitas tentativas de login. Tente novamente mais tarde.' } },
});
