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
 * @returns { items[], subtotalMXN, ivaMXN, totalMXN }
 */
async function buildItems(customerId) {
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
 */
async function generateInvoice(customerId, year, month) {
  const { start, end } = periodRange(year, month);

  const existing = await prisma.invoice.findFirst({
    where: { customerId, periodStart: start, periodEnd: end },
  });
  if (existing) return { invoice: existing, created: false };

  const { customer, items, subtotalMXN, ivaMXN, totalMXN } = await buildItems(customerId);
  if (items.length === 0) {
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
 * @returns { generated, skipped, errors }
 */
async function generateAllForPeriod(year, month) {
  const customers = await prisma.customer.findMany({
    where: { status: 'active', modules: { some: { status: 'active' } } },
    select: { id: true, legalName: true },
  });

  let generated = 0;
  let skipped = 0;
  const errors = [];

  for (const c of customers) {
    try {
      const { created } = await generateInvoice(c.id, year, month);
      if (created) generated++;
      else skipped++;
    } catch (err) {
      errors.push({ customerId: c.id, name: c.legalName, error: err.message });
    }
  }

  return { generated, skipped, errors, total: customers.length };
}

module.exports = { generateInvoice, generateAllForPeriod, buildItems, nextInvoiceNumber };
