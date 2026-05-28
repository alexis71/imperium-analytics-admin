/**
 * Cron worker · suspende licencias vencidas ≥30d (N°80 · siguiente fase billing).
 *
 * Espejo del patrón de Hub/scripts/cron-reconcile.js: script standalone con
 * PrismaClient propio + lib + heartbeat log + pm2 cron_restart.
 *
 * Idempotente · solo actúa sobre Licenses status='active' vencidas.
 * Heartbeat → Desktop/_ops/logs/expire-licenses-cron.log
 */
const path = require('path');
const fs = require('fs');

(async () => {
  let exitCode = 0;
  const startTs = new Date();

  // __dirname = Admin/server/scripts · 3 niveles arriba = Desktop
  const logDir = path.resolve(__dirname, '../../../_ops/logs');
  const logFile = path.join(logDir, 'expire-licenses-cron.log');
  function heartbeat(line) {
    try {
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      fs.appendFileSync(logFile, `${startTs.toISOString()} · ${line}\n`);
    } catch (e) { /* silencioso · no romper cron */ }
  }

  try {
    const { PrismaClient } = require('@prisma/client');
    const { expireLicensesSweep } = require('../src/lib/expire-licenses');
    let sendCommand = null;
    try { ({ sendCommand } = require('../src/utils/vertical-client')); } catch (e) { /* push opcional */ }

    const prisma = new PrismaClient();
    const logger = {
      info: (msg, ctx) => console.log(`[INFO] ${msg}`, ctx ? JSON.stringify(ctx) : ''),
      warn: (msg, ctx) => console.log(`[WARN] ${msg}`, ctx ? JSON.stringify(ctx) : ''),
    };

    const r = await expireLicensesSweep({ prisma, logger, sendCommand });
    heartbeat(`fired · checked=${r.checked} suspended=${r.suspended} inGrace=${r.inGrace} quarantineCand=${r.quarantineCandidates} archiveCand=${r.archiveCandidates} errors=${r.errors}`);
    if (r.suspended > 0) {
      console.log(`[OK] auto-suspended ${r.suspended} license(s) ≥30d overdue · customers: ${r.actions.map(a => a.customerId).join(', ')}`);
    }
    await prisma.$disconnect();
  } catch (err) {
    heartbeat(`error · ${err.message}`);
    console.error('[ERROR] expire-licenses-cron:', err.message);
    exitCode = 1;
  }
  process.exit(exitCode);
})();
