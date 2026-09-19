import 'dotenv/config';
import bcrypt from 'bcrypt';
import { pool } from '../src/db.js';

const [, , email, senha] = process.argv;

if (!email || !senha) {
  console.error('uso: node scripts/criar-admin.js <email> <senha>');
  process.exit(1);
}

const senhaHash = await bcrypt.hash(senha, 12);

await pool.query(
  `INSERT INTO admin_usuarios (email, senha_hash)
   VALUES ($1, $2)
   ON CONFLICT (email) DO UPDATE SET senha_hash = EXCLUDED.senha_hash, ativo = true`,
  [email.trim().toLowerCase(), senhaHash],
);

console.log(`admin ${email} criado/atualizado.`);
await pool.end();
