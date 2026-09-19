import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';

const migrationsDir = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      nome TEXT PRIMARY KEY,
      aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const arquivos = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const { rows: aplicadas } = await pool.query('SELECT nome FROM schema_migrations');
  const jaAplicadas = new Set(aplicadas.map((r) => r.nome));

  for (const arquivo of arquivos) {
    if (jaAplicadas.has(arquivo)) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, arquivo), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (nome) VALUES ($1)', [arquivo]);
      await client.query('COMMIT');
      console.log(`aplicada: ${arquivo}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`falhou: ${arquivo}`);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log('migrations em dia.');
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
