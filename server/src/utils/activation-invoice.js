/**
 * Activation Invoice Generator · N°80 Fase B1.
 *
 * Genera factura draft cuando se activa un módulo (License creado).
 * Espejo simplificado de invoice-generator.js (que es monthly consolidated).
 *
 * Decisión arquitectónica:
 *  - 1 invoice por activación (no mensual consolidado · ese sigue funcionando por separado)
 *  - billingMode='prepaid' (default) → dueAt = activatedAt (cobro inmediato)
 *  - billingMode='arrears'           → dueAt = expiresAt + 15d (gracia post-período)
 *  - periodStart = License.activatedAt · periodEnd = License.expiresAt
 *  - IVA 16% si Customer no es tax-exempt
 *  - numero IA-YYYY-MM-NNNN siguiendo el mismo correlativo mensual
 *  - Falla NO debe bloquear activación · caller envuelve en try/catch + log
 */
const prisma = require('../db');

const IVA_RATE = 0.16;

async function nextInvoiceNumber(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const prefix = `IA-${year}-${String(month).padStart(2, '0')}`;
  const last = await prisma.invoice.findFirst({
    where: { numero: { startsWith: prefix } },
    orderBy: { numero: 'desc' },
    select: { numero: true },
  });
  const lastSeq = last ? Number(last.numero.split('-').pop()) || 0 : 0;
  return `${prefix}-${String(lastSeq + 1).padStart(4, '0')}`;
}

/**
 * Genera Invoice draft para una activación específica.
 *
 * @param {object} ctx
 * @param {string} ctx.customerId            Customer.id
 * @param {object} ctx.customerModule        CustomerModule recién creado (con moduleCode · parentVerticalCode · etc)
 * @param {object} ctx.license               License recién creado (con priceMXN · billingMode · activatedAt · expiresAt · tier · key)
 * @param {object} ctx.module                Module catalog row (con code · name)
 * @returns {Promise<{ invoice, items, totals }>}
 */
async function generateActivationInvoice({ customerId, customerModule, license, module }) {
  // 1. Customer + tax exempt
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, legalName: true, isTaxExempt: true },
  });
  if (!customer) throw new Error('Customer no existe');

  // 2. Item descriptor · description incluye vertical si aplica (core × vertical)
  const verticalSuffix = customerModule.parentVerticalCode ? ` × ${customerModule.parentVerticalCode.toUpperCase()}` : '';
  const description = `${module.name}${verticalSuffix} · tier ${license.tier} · activación`;

  const items = [{
    customerModuleId: customerModule.id,
    moduleCode: customerModule.moduleCode,
    parentVerticalCode: customerModule.parentVerticalCode || null,
    moduleName: module.name,
    tier: license.tier,
    licenseKey: license.key,
    billingMode: license.billingMode,
    description,
    quantity: 1,
    unitPriceMXN: license.priceMXN,
    totalMXN: license.priceMXN,
    activationEvent: true, // marca que es invoice de activación · no de cierre mensual
  }];

  // 3. Totals
  const subtotal = license.priceMXN || 0;
  const iva = customer.isTaxExempt ? 0 : Math.round(subtotal * IVA_RATE);
  const total = subtotal + iva;

  // 4. periodStart/End desde License · dueAt según billingMode
  const periodStart = license.activatedAt;
  const periodEnd = license.expiresAt;
  const dueAt = license.billingMode === 'arrears'
    ? new Date(periodEnd.getTime() + 15 * 86400 * 1000) // 15d gracia post-período
    : periodStart;                                       // prepaid · due immediately

  // 5. Numero correlativo
  const numero = await nextInvoiceNumber(new Date());

  // 6. Create invoice draft (idempotency: si ya existe invoice con este customerModuleId + activationEvent, skip)
  const existing = await prisma.invoice.findFirst({
    where: {
      customerId,
      items: { path: ['0', 'customerModuleId'], equals: customerModule.id },
      // Filter más estrictamente: status no cancelled (permite re-gen post-cancel)
      status: { in: ['draft', 'sent', 'paid', 'overdue'] },
    },
  });
  if (existing) {
    return { invoice: existing, items, totals: { subtotal, iva, total }, created: false };
  }

  const invoice = await prisma.invoice.create({
    data: {
      customerId,
      numero,
      periodStart,
      periodEnd,
      subtotalMXN: subtotal,
      ivaMXN: iva,
      totalMXN: total,
      status: 'draft',
      items,
      dueAt,
      notes: `Activación ${customerModule.moduleCode}${verticalSuffix} · ${license.billingMode === 'prepaid' ? 'pago adelantado' : 'cobro al cierre del período'}`,
    },
  });

  return { invoice, items, totals: { subtotal, iva, total }, created: true };
}

module.exports = { generateActivationInvoice, nextInvoiceNumber };
