const express = require('express');
const prisma = require('../db');
const { auth } = require('../middleware/auth');
const { pull, sendCommand } = require('../utils/vertical-client');
const { audit } = require('../utils/audit');

const router = express.Router();
router.use(auth('superadmin'));

// GET /licenses — lista plana cross-module
router.get('/', async (req, res) => {
  const { moduleCode, status, expiringSoon } = req.query;
  const where = {};
  if (status) where.status = status;
  if (expiringSoon === 'true') {
    where.expiresAt = { lte: new Date(Date.now() + 30 * 86400 * 1000) };
    where.status = 'active';
  }

  const licenses = await prisma.license.findMany({
    where,
    orderBy: { expiresAt: 'asc' },
    include: {
      customerModule: {
        include: {
          customer: { select: { id: true, legalName: true } },
          module:   { select: { code: true, name: true } },
        },
      },
    },
  });

  const rows = licenses.map((l) => ({
    id: l.id,
    tier: l.tier,
    key: l.key,
    priceMXN: l.priceMXN,
    activatedAt: l.activatedAt,
    expiresAt: l.expiresAt,
    status: l.status,
    autoRenew: l.autoRenew,
    customerId: l.customerModule.customer.id,
    customerName: l.customerModule.customer.legalName,
    moduleCode: l.customerModule.module.code,
    moduleName: l.customerModule.module.name,
    daysRemaining: Math.ceil((l.expiresAt - Date.now()) / 86400000),
  }));

  res.json({
    data: moduleCode ? rows.filter((r) => r.moduleCode === moduleCode) : rows,
  });
});

// POST /licenses/:id/extend — pass-through a vertical
router.post('/:id/extend', async (req, res) => {
  const days = Number(req.body.days || 30);
  try {
    const lic = await prisma.license.findUnique({
      where: { id: req.params.id },
      include: { customerModule: true },
    });
    if (!lic) return res.status(404).json({ error: 'License no existe' });

    // Push al vertical
    await sendCommand(lic.customerModule.moduleCode, 'license.extend', {
      tenantId: lic.customerModule.tenantIdInModule,
      licenseKey: lic.key,
      days,
    });

    const newExpiry = new Date(Math.max(lic.expiresAt.getTime(), Date.now()) + days * 86400 * 1000);
    const updated = await prisma.license.update({
      where: { id: lic.id },
      data: { expiresAt: newExpiry, status: 'active' },
    });

    await audit(req, 'license.extend', 'License', lic.id, { days, newExpiry },
      { customerId: lic.customerModule.customerId, moduleCode: lic.customerModule.moduleCode });

    res.json({ data: updated });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /licenses/sync/:moduleCode — pull licenses del vertical
router.post('/sync/:moduleCode', async (req, res) => {
  const code = req.params.moduleCode;
  try {
    const { data: licenses } = await pull(code, '/api/v1/admin/licenses');
    let created = 0, updated = 0, skipped = 0;

    for (const l of licenses || []) {
      const cm = await prisma.customerModule.findFirst({
        where: { moduleCode: code, tenantIdInModule: l.tenantId },
      });
      if (!cm) { skipped++; continue; }

      const existing = await prisma.license.findUnique({ where: { key: l.key } });
      if (existing) {
        await prisma.license.update({
          where: { id: existing.id },
          data: {
            tier: l.tier,
            expiresAt: new Date(l.expiresAt),
            status: l.status,
          },
        });
        updated++;
      } else {
        await prisma.license.create({
          data: {
            customerModuleId: cm.id,
            tier: l.tier,
            key: l.key,
            priceMXN: l.priceMXN || 0,
            activatedAt: new Date(l.activatedAt || l.createdAt || Date.now()),
            expiresAt: new Date(l.expiresAt),
            status: l.status || 'active',
          },
        });
        created++;
      }
    }

    await audit(req, 'license.sync', 'Module', code, { created, updated, skipped });
    res.json({ data: { created, updated, skipped } });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
