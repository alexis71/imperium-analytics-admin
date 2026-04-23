const express = require('express');
const prisma = require('../db');
const { auth } = require('../middleware/auth');
const { audit } = require('../utils/audit');
const { generateInvoice, generateAllForPeriod } = require('../utils/invoice-generator');
const { invoiceToPdfBuffer } = require('../utils/invoice-pdf');

const router = express.Router();
router.use(auth('superadmin'));

// GET /invoices — lista con filtros
router.get('/', async (req, res) => {
  const { status, customerId, year, month } = req.query;
  const where = {};
  if (status) where.status = status;
  if (customerId) where.customerId = customerId;
  if (year && month) {
    const y = Number(year), m = Number(month);
    where.periodStart = new Date(Date.UTC(y, m - 1, 1));
  }

  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      customer: { select: { id: true, legalName: true, rfc: true } },
      payments: true,
      _count: { select: { payments: true } },
    },
  });

  res.json({
    data: invoices.map((i) => ({
      id: i.id,
      numero: i.numero,
      customerId: i.customerId,
      customerName: i.customer.legalName,
      customerRfc: i.customer.rfc,
      periodStart: i.periodStart,
      periodEnd: i.periodEnd,
      subtotalMXN: i.subtotalMXN,
      ivaMXN: i.ivaMXN,
      totalMXN: i.totalMXN,
      paidMXN: i.payments.reduce((s, p) => s + p.amountMXN, 0),
      status: i.status,
      issuedAt: i.issuedAt,
      dueAt: i.dueAt,
      paymentsCount: i._count.payments,
    })),
  });
});

// GET /invoices/:id — detalle
router.get('/:id', async (req, res) => {
  const inv = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    include: {
      customer: true,
      payments: { orderBy: { paidAt: 'desc' } },
    },
  });
  if (!inv) return res.status(404).json({ error: 'Invoice no existe' });
  res.json({ data: inv });
});

// POST /invoices/generate — genera factura manual (un customer o todos)
router.post('/generate', async (req, res) => {
  const { customerId, year, month } = req.body;
  const y = Number(year) || new Date().getFullYear();
  const m = Number(month) || new Date().getMonth() + 1;

  try {
    if (customerId) {
      const { invoice, created } = await generateInvoice(customerId, y, m);
      await audit(req, created ? 'invoice.generate' : 'invoice.generate.noop', 'Invoice', invoice.id,
        { year: y, month: m }, { customerId });
      return res.json({ data: { invoice, created } });
    }

    // Todos los customers del período
    const result = await generateAllForPeriod(y, m);
    await audit(req, 'invoice.generate.bulk', 'Period', `${y}-${m}`, result);
    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /invoices/:id/payments — registrar pago
router.post('/:id/payments', async (req, res) => {
  const { amountMXN, method, reference, notes } = req.body;
  if (!amountMXN || amountMXN < 1) return res.status(400).json({ error: 'amountMXN requerido' });
  if (!method) return res.status(400).json({ error: 'method requerido' });

  try {
    const inv = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: { payments: true },
    });
    if (!inv) return res.status(404).json({ error: 'Invoice no existe' });

    const payment = await prisma.payment.create({
      data: {
        invoiceId: inv.id,
        amountMXN: Number(amountMXN),
        method,
        reference: reference || null,
        notes: notes || null,
      },
    });

    const paidBefore = inv.payments.reduce((s, p) => s + p.amountMXN, 0);
    const paidNow = paidBefore + Number(amountMXN);

    let newStatus = inv.status;
    if (paidNow >= inv.totalMXN) newStatus = 'paid';
    else if (inv.status === 'draft') newStatus = 'sent';

    if (newStatus !== inv.status) {
      await prisma.invoice.update({
        where: { id: inv.id },
        data: {
          status: newStatus,
          issuedAt: inv.issuedAt || new Date(),
        },
      });
    }

    await audit(req, 'invoice.payment.add', 'Invoice', inv.id,
      { amountMXN, method, newStatus }, { customerId: inv.customerId });

    res.json({ data: { payment, invoiceStatus: newStatus, paidTotal: paidNow } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /invoices/:id — cambiar estado manual (cancel, etc.)
router.patch('/:id', async (req, res) => {
  const { status } = req.body;
  if (status && !['draft', 'sent', 'paid', 'overdue', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'status inválido' });
  }
  try {
    const inv = await prisma.invoice.update({
      where: { id: req.params.id },
      data: { status },
    });
    await audit(req, 'invoice.status.change', 'Invoice', inv.id, { status },
      { customerId: inv.customerId });
    res.json({ data: inv });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /invoices/:id/pdf — descargar PDF
router.get('/:id/pdf', async (req, res) => {
  try {
    const inv = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: { customer: true, payments: true },
    });
    if (!inv) return res.status(404).json({ error: 'Invoice no existe' });

    const buf = await invoiceToPdfBuffer(inv);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${inv.numero}.pdf"`);
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
