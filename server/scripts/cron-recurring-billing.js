/**
 * Cron worker · factura mensual recurrente (N°80 · motor de revenue recurrente).
 *
 * Espejo del patrón cron-expire-licenses / cron-reconcile. Corre a diario (idempotente):
 * genera la factura del mes actual para todos los customers activos, saltando módulos
 * cubiertos por su factura de activación (anti doble-cobro).
 *
 * Heartbeat → Desktop/_ops/logs/recurring-billing-cron.log
 *
 * ⚠ Genera facturas DRAFT para TODOS los customers activos (incluye demos en dev).
 *   Registrar en pm2 solo tras validar el modelo en el entorno objetivo.
 */
const path = require('path');
const fs = require('fs');

(async () => {
  let exitCode = 0;
  const startTs = new Date();

  // __dirname = Admin/server/scripts · 3 niveles arriba = Desktop
  const logDir = path.resolve(__dirname, '../../../_ops/logs');
  const logFile = path.join(logDir, 'recurring-billing-cron.log');
  function heartbeat(line) {
    try {
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      fs.appendFileSync(logFile, `${startTs.toISOString()} · ${line}\n`);
    } catch (e) { /* silencioso · no romper cron */ }
  }

  try {
    const prisma = require('../src/db');
    const { recurringBillingSweep } = require('../src/lib/recurring-billing');
    const logger = {
      info: (msg, ctx) => console.log(`[INFO] ${msg}`, ctx ? JSON.stringify(ctx) : ''),
      warn: (msg, ctx) => console.log(`[WARN] ${msg}`, ctx ? JSON.stringify(ctx) : ''),
    };

    const r = await recurringBillingSweep({ logger });
    const ym = `${r.year}-${String(r.month).padStart(2, '0')}`;
    heartbeat(`fired · ${ym} · generated=${r.generated} skipped=${r.skipped} errors=${r.errors.length} total=${r.total}`);
    if (r.generated > 0) console.log(`[OK] generated ${r.generated} monthly invoice(s) for ${ym}`);
    if (r.errors.length) console.log(`[WARN] ${r.errors.length} error(s):`, JSON.stringify(r.errors));
    await prisma.$disconnect();
  } catch (err) {
    heartbeat(`error · ${err.message}`);
    console.error('[ERROR] recurring-billing-cron:', err.message);
    exitCode = 1;
  }
  process.exit(exitCode);
})();
