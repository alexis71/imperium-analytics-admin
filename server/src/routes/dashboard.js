const express = require('express');
const prisma = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.get('/stats', auth(), async (req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonth  = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    // N°80 Fase B3 · trend mes vs anterior
    const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const prevMonthEnd   = monthStart;

    const [
      customers,
      modules,
      activeLicenses,
      webhooks,
      recentEvents,
      activeCustomerModules,
      monthInvoices,
      monthPayments,
      unpaidInvoices,
      prevMonthInvoices,    // N°80 B3
      prevMonthPayments,    // N°80 B3
      paidInvoicesThisMonth, // N°80 B3 · # invoices paid (reconciliations signal)
    ] = await Promise.all([
      prisma.customer.count({ where: { status: 'active' } }),
      prisma.module.count({ where: { status: 'active' } }),
      prisma.license.count({ where: { status: 'active' } }),
      prisma.webhookEvent.count(),
      prisma.webhookEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, moduleCode: true, event: true, verified: true, createdAt: true },
      }),
      prisma.customerModule.findMany({
        where: { status: 'active' },
        include: {
          licenses: {
            where: { status: 'active' },
            orderBy: { activatedAt: 'desc' },
            take: 1,
            select: { priceMXN: true },
          },
        },
      }),
      prisma.invoice.findMany({
        where: { periodStart: monthStart },
        select: { totalMXN: true, status: true },
      }),
      prisma.payment.aggregate({
        where: { paidAt: { gte: monthStart, lt: nextMonth } },
        _sum: { amountMXN: true },
      }),
      prisma.invoice.count({
        where: { status: { in: ['sent', 'overdue'] } },
      }),
      // N°80 B3 · prev-month comparators
      prisma.invoice.findMany({
        where: { periodStart: { gte: prevMonthStart, lt: prevMonthEnd } },
        select: { totalMXN: true },
      }),
      prisma.payment.aggregate({
        where: { paidAt: { gte: prevMonthStart, lt: prevMonthEnd } },
        _sum: { amountMXN: true },
      }),
      prisma.invoice.count({
        where: { status: 'paid', updatedAt: { gte: monthStart, lt: nextMonth } },
      }),
    ]);

    const mrrMXN = activeCustomerModules.reduce((sum, cm) => {
      const p = cm.licenses[0]?.priceMXN || 0;
      return sum + p;
    }, 0);

    const monthInvoicedMXN = monthInvoices.reduce((s, i) => s + i.totalMXN, 0);
    const monthPaidMXN = monthPayments._sum.amountMXN || 0;
    // N°80 B3
    const prevMonthInvoicedMXN = prevMonthInvoices.reduce((s, i) => s + i.totalMXN, 0);
    const prevMonthPaidMXN = prevMonthPayments._sum.amountMXN || 0;
    const invoicedDeltaPct = prevMonthInvoicedMXN > 0
      ? Math.round(((monthInvoicedMXN - prevMonthInvoicedMXN) / prevMonthInvoicedMXN) * 100)
      : null;
    const paidDeltaPct = prevMonthPaidMXN > 0
      ? Math.round(((monthPaidMXN - prevMonthPaidMXN) / prevMonthPaidMXN) * 100)
      : null;

    const upcomingExpirations = await prisma.license.findMany({
      where: {
        status: 'active',
        expiresAt: { lte: new Date(Date.now() + 30 * 86400 * 1000) },
      },
      take: 10,
      orderBy: { expiresAt: 'asc' },
      include: { customerModule: { include: { customer: true, module: true } } },
    });

    res.json({
      data: {
        kpis: {
          customers,
          modules,
          licenses: activeLicenses,
          webhooks,
          mrrMXN,
          monthInvoicedMXN,
          monthPaidMXN,
          unpaidInvoices,
          // N°80 B3 · trend mes vs anterior + reconciliations signal
          prevMonthInvoicedMXN,
          prevMonthPaidMXN,
          invoicedDeltaPct,
          paidDeltaPct,
          paidInvoicesThisMonth,
        },
        recentEvents,
        upcomingExpirations: upcomingExpirations.map((l) => ({
          id: l.id,
          tier: l.tier,
          expiresAt: l.expiresAt,
          daysRemaining: Math.ceil((l.expiresAt - Date.now()) / 86400000),
          customerName: l.customerModule.customer.legalName,
          moduleName: l.customerModule.module.name,
        })),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
