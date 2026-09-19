import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pool } from './db.js';
import { catalogoRouter } from './routes/catalogo.js';
import { pedidosRouter } from './routes/pedidos.js';
import { notFoundHandler, errorHandler } from './middleware/errors.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: true });
  } catch (err) {
    res.status(503).json({ ok: true, db: false });
  }
});

app.use('/api', catalogoRouter);
app.use('/api', pedidosRouter);

app.use(notFoundHandler);
app.use(errorHandler);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`rufus-api ouvindo na porta ${port}`);
});
