/**
 * Imperium Analytics Admin · API server
 * Puerto 3010 · Postgres via DATABASE_URL
 */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const logger = require('./utils/logger');
const prisma = require('./db');
const rawBody = require('./middleware/rawBody');

const app = express();
const PORT = process.env.PORT || 3010;

// Security
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || corsOrigins.length === 0 || corsOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('CORS bloqueado'));
  },
  credentials: true,
}));

// Webhooks con rawBody antes de JSON parse (para verificar HMAC)
app.use('/api/v1/webhooks', rawBody, require('./routes/webhooks'));

// JSON parser para rutas normales
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Rate limiting general
app.use('/api/', rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 900000),
  max: Number(process.env.RATE_LIMIT_MAX || 300),
  standardHeaders: true,
  legacyHeaders: false,
}));

// Health check
const pkg = require('../package.json');
app.get('/api/v1/health', async (req, res) => {
  let dbOk = false;
  try { await prisma.$queryRaw`SELECT 1`; dbOk = true; } catch {}
  const mem = process.memoryUsage();
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    module: 'ia-admin',
    verticalCode: 'ia-admin',
    version: pkg.version || '0.1.0',
    db: dbOk ? 'ok' : 'fail',
    uptime: Math.round(process.uptime()),
    memory: {
      rssMB: +(mem.rss / 1024 / 1024).toFixed(1),
      heapUsedMB: +(mem.heapUsed / 1024 / 1024).toFixed(1),
    },
    nodeVersion: process.version,
    features: {
      auth: true, mfa: true, webhooks: true, customers: false, licenses: false, invoices: false,
    },
    timestamp: new Date().toISOString(),
  });
});

// Rutas
app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/dashboard', require('./routes/dashboard'));
app.use('/api/v1/modules', require('./routes/modules'));
app.use('/api/v1/customers', require('./routes/customers'));
app.use('/api/v1/licenses', require('./routes/licenses'));
app.use('/api/v1/webhooks-inbox', require('./routes/webhooks-inbox'));
app.use('/api/v1/audit-log', require('./routes/audit'));
app.use('/api/v1/invoices', require('./routes/invoices'));
app.use('/api/v1/billing-proxy', require('./routes/billing-proxy')); // N°80 C2 · Admin → Hub reconcile
app.use('/api/v1/settings', require('./routes/settings'));
app.use('/api/v1/admin-override', require('./routes/admin-override'));

// 404
app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada', path: req.path }));

// Error handler
app.use((err, req, res, next) => {
  logger.error('unhandled', { error: err.message, stack: err.stack, path: req.path });
  res.status(500).json({ error: 'Error interno', code: 'INTERNAL' });
});

const server = app.listen(PORT, () => {
  logger.info(`Imperium Analytics Admin API en :${PORT}`);
});

const shutdown = async (sig) => {
  logger.info(`${sig} recibido · cerrando`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
