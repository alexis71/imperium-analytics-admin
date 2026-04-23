const express = require('express');
const prisma = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.get('/stats', auth(), async (req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonth  = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

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
    ]);

    const mrrMXN = activeCustomerModules.reduce((sum, cm) => {
      const p = cm.licenses[0]?.priceMXN || 0;
      return sum + p;
    }, 0);

    const monthInvoicedMXN = monthInvoices.reduce((s, i) => s + i.totalMXN, 0);
    const monthPaidMXN = monthPayments._sum.amountMXN || 0;

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
