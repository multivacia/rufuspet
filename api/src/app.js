import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pool } from './db.js';
import { catalogoRouter } from './routes/catalogo.js';
import { pedidosRouter } from './routes/pedidos.js';
import { adminRouter } from './routes/admin.js';
import { notFoundHandler, errorHandler } from './middleware/errors.js';

export const app = express();

app.set('trust proxy', 1); // atrás do nginx: IP real para o rate limit
app.use(cors());
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());

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
app.use('/api', adminRouter);

app.use(notFoundHandler);
app.use(errorHandler);
