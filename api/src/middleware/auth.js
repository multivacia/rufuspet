import jwt from 'jsonwebtoken';

export const COOKIE_ADMIN = 'rufus_admin_token';

export function autenticarAdmin(req, res, next) {
  const token = req.cookies?.[COOKIE_ADMIN];
  if (!token) {
    return res.status(401).json({ erro: { codigo: 'NAO_AUTENTICADO', mensagem: 'Login necessário' } });
  }

  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.clearCookie(COOKIE_ADMIN);
    return res.status(401).json({ erro: { codigo: 'NAO_AUTENTICADO', mensagem: 'Sessão inválida ou expirada' } });
  }
}
