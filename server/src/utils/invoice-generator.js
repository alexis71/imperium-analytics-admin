/**
 * Invoice generator · calcula factura mensual consolidada por Customer.
 *
 * Snapshot de todos los CustomerModule activos + License vigente de cada uno.
 * IVA 16% default (omisible si Customer.isTaxExempt = true).
 * Número correlativo: IA-YYYY-MM-NNNN
 */
const prisma = require('../db');

const IVA_RATE = 0.16;

function periodRange(year, month) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end   = new Date(Date.UTC(year, month, 1)); // primero del mes siguiente (exclusive)
  return { start, end };
}

async function nextInvoiceNumber(year, month) {
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
 * Construye items + totales desde los CustomerModule activos del customer.
 *
 * N°80 · opts.skipActivatedInPeriod + periodStart/End: excluye módulos cuya License
 * fue activada DENTRO del período facturado. Razón: la factura de activación (B1)
 * ya cobró el primer mes de ese módulo · sin esto el mensual lo cobraría doble.
 * La mensual toma el relevo a partir del mes siguiente.
 *
 * @returns { items[], subtotalMXN, ivaMXN, totalMXN }
 */
async function buildItems(customerId, { skipActivatedInPeriod = false, periodStart = null, periodEnd = null } = {}) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      modules: {
        where: { status: 'active' },
        include: {
          module: { select: { code: true, name: true } },
          licenses: {
            where: { status: 'active' },
            orderBy: { activatedAt: 'desc' },
            take: 1,
          },
        },
      },
    },
  });
  if (!customer) throw new Error('Customer no existe');

  const items = [];
  let subtotal = 0;

  for (const cm of customer.modules) {
    const license = cm.licenses[0];
    if (!license) continue;
    // N°80 · anti-doble-cobro: si la licencia se activó en este período, B1 ya lo cubrió → skip
    if (skipActivatedInPeriod && periodStart && periodEnd) {
      const act = new Date(license.activatedAt);
      if (act >= periodStart && act < periodEnd) continue;
    }
    const description = `${cm.module.name} · tier ${license.tier}`;
    const amount = license.priceMXN || 0;
    items.push({
      customerModuleId: cm.id,
      moduleCode: cm.moduleCode,
      moduleName: cm.module.name,
      tier: license.tier,
      licenseKey: license.key,
      description,
      quantity: 1,
      unitPriceMXN: amount,
      totalMXN: amount,
    });
    subtotal += amount;
  }

  const iva = customer.isTaxExempt ? 0 : Math.round(subtotal * IVA_RATE);
  const total = subtotal + iva;

  return { customer, items, subtotalMXN: subtotal, ivaMXN: iva, totalMXN: total };
}

/**
 * Genera invoice en estado draft para el customer y período dado.
 * Idempotente por customer+period: si ya existe, retorna la previa.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.skipActivatedInPeriod] excluye módulos cubiertos por su factura B1 (ver buildItems)
 * @param {boolean} [opts.skipEmptyOk] si tras el filtro no quedan items, retorna {created:false, skipped:true} en vez de throw
 */
async function generateInvoice(customerId, year, month, opts = {}) {
  const { start, end } = periodRange(year, month);

  const existing = await prisma.invoice.findFirst({
    where: { customerId, periodStart: start, periodEnd: end },
  });
  if (existing) return { invoice: existing, created: false };

  const { customer, items, subtotalMXN, ivaMXN, totalMXN } = await buildItems(customerId, {
    skipActivatedInPeriod: opts.skipActivatedInPeriod, periodStart: start, periodEnd: end,
  });
  if (items.length === 0) {
    if (opts.skipEmptyOk) return { invoice: null, created: false, skipped: true, reason: 'sin módulos facturables (cubiertos por activación o sin licencia)' };
    throw new Error(`Customer ${customer.legalName} no tiene módulos activos con licencias vigentes`);
  }

  const numero = await nextInvoiceNumber(year, month);
  const dueAt = new Date(end.getTime() + 15 * 86400 * 1000); // 15 días de gracia

  const invoice = await prisma.invoice.create({
    data: {
      customerId,
      numero,
      periodStart: start,
      periodEnd: end,
      subtotalMXN,
      ivaMXN,
      totalMXN,
      status: 'draft',
      items,
      dueAt,
    },
  });

  return { invoice, created: true };
}

/**
 * Genera facturas para TODOS los customers con módulos activos en el período.
 * @param {object} [opts] reenviado a generateInvoice (skipActivatedInPeriod · skipEmptyOk)
 * @returns { generated, skipped, errors, total }
 */
async function generateAllForPeriod(year, month, opts = {}) {
  const where = { status: 'active', modules: { some: { status: 'active' } } };
  if (opts.excludeCustomerIds?.length) where.id = { notIn: opts.excludeCustomerIds }; // N°80 · excluir demos/internos
  const customers = await prisma.customer.findMany({
    where,
    select: { id: true, legalName: true },
  });

  let generated = 0;
  let skipped = 0;
  const errors = [];

  for (const c of customers) {
    try {
      const { created } = await generateInvoice(c.id, year, month, opts);
      if (created) generated++;
      else skipped++;
    } catch (err) {
      errors.push({ customerId: c.id, name: c.legalName, error: err.message });
    }
  }

  return { generated, skipped, errors, total: customers.length };
}

module.exports = { generateInvoice, generateAllForPeriod, buildItems, nextInvoiceNumber };
