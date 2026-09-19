import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';

// Hash de custo 12 de uma senha que nunca vai bater — usado quando o
// e-mail não existe, pra não vazar por timing se o e-mail está cadastrado.
const HASH_DUMMY = bcrypt.hashSync('nenhuma-senha-bate-aqui', 12);

export async function autenticar(email, senha) {
  const { rows } = await pool.query(
    'SELECT id, email, senha_hash, ativo FROM admin_usuarios WHERE email = $1',
    [String(email ?? '').trim().toLowerCase()],
  );
  const usuario = rows[0];

  const senhaValida = await bcrypt.compare(String(senha ?? ''), usuario?.senha_hash ?? HASH_DUMMY);
  if (!usuario || !usuario.ativo || !senhaValida) {
    return null;
  }

  return jwt.sign({ sub: usuario.id, email: usuario.email }, process.env.JWT_SECRET, { expiresIn: '8h' });
}
