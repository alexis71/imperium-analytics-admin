/**
 * Recurring monthly billing sweep · N°80 (motor de revenue recurrente).
 *
 * Genera la factura mensual consolidada del MES ACTUAL para todos los customers
 * con módulos activos, SALTANDO los módulos cuya factura de activación (B1) ya
 * cubrió ese mes (anti doble-cobro · ver invoice-generator.buildItems). La mensual
 * toma el relevo a partir del mes siguiente a cada activación.
 *
 * Idempotente: generateInvoice no re-crea si ya existe el invoice del período
 * (customer+periodStart+periodEnd), así que correrlo a diario genera 1 vez por mes.
 *
 * Usa el prisma compartido (../db) vía invoice-generator · no inyecta cliente.
 */
const prisma = require('../db');
const { generateAllForPeriod } = require('../utils/invoice-generator');

// N°80 · cuentas demo/internas que NO se facturan (no son clientes reales).
// Override por env RECURRING_BILLING_EXCLUDE_EMAILS (coma-separado). Clientes reales
// NO usan estos dominios/emails → entran a facturación automáticamente.
const DEFAULT_EXCLUDE_EMAILS = [
  'demo1@local.com', 'demo2@local.com', 'demo1@vet1.test',
  'sandbox@test.local', 'alejandro.rodriguez@muselecom.com',
];

function excludeEmails() {
  const env = (process.env.RECURRING_BILLING_EXCLUDE_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean);
  return env.length ? env : DEFAULT_EXCLUDE_EMAILS;
}

async function recurringBillingSweep({ logger = {}, now = new Date() } = {}) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  const emails = excludeEmails();
  const excluded = await prisma.customer.findMany({ where: { contactEmail: { in: emails } }, select: { id: true } });
  const excludeCustomerIds = excluded.map(c => c.id);

  const r = await generateAllForPeriod(year, month, { skipActivatedInPeriod: true, skipEmptyOk: true, excludeCustomerIds });
  const out = { year, month, excludedCustomers: excludeCustomerIds.length, ...r };
  logger.info?.('recurring-billing.sweep', out);
  return out;
}

module.exports = { recurringBillingSweep, DEFAULT_EXCLUDE_EMAILS };
