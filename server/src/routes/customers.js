const express = require('express');
const prisma = require('../db');
const { auth } = require('../middleware/auth');
const { audit } = require('../utils/audit');
const { pull, sendCommand } = require('../utils/vertical-client');

const router = express.Router();
router.use(auth('superadmin'));

// GET /customers — lista con agregados
router.get('/', async (req, res) => {
  const customers = await prisma.customer.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      modules: {
        include: {
          module: { select: { code: true, name: true } },
          licenses: {
            where: { status: 'active' },
            orderBy: { expiresAt: 'desc' },
            take: 1,
          },
        },
      },
      _count: { select: { invoices: true } },
    },
  });

  res.json({
    data: customers.map((c) => ({
      id: c.id,
      legalName: c.legalName,
      rfc: c.rfc,
      contactEmail: c.contactEmail,
      contactPhone: c.contactPhone,
      status: c.status,
      createdAt: c.createdAt,
      modules: c.modules.map((cm) => ({
        id: cm.id,
        moduleCode: cm.moduleCode,
        moduleName: cm.module.name,
        tenantSlug: cm.tenantSlug,
        status: cm.status,
        currentLicense: cm.licenses[0] || null,
      })),
      invoices: c._count.invoices,
    })),
  });
});

// GET /customers/:id — detalle
router.get('/:id', async (req, res) => {
  const c = await prisma.customer.findUnique({
    where: { id: req.params.id },
    include: {
      modules: {
        include: {
          module: { select: { code: true, name: true, apiEndpoint: true } },
          licenses: { orderBy: { expiresAt: 'desc' } },
        },
      },
      invoices: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  });
  if (!c) return res.status(404).json({ error: 'Customer no existe' });
  res.json({ data: c });
});

// GET /customers/:id/tenant-details/:moduleCode — datos en vivo desde el vertical
router.get('/:id/tenant-details/:moduleCode', async (req, res) => {
  try {
    const cm = await prisma.customerModule.findFirst({
      where: { customerId: req.params.id, moduleCode: req.params.moduleCode },
    });
    if (!cm || !cm.tenantIdInModule) return res.status(404).json({ error: 'Tenant no vinculado en este módulo' });

    const { data: detail } = await pull(req.params.moduleCode, `/api/v1/admin/tenants/${cm.tenantIdInModule}`);
    res.json({ data: detail });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /customers — crear manual
router.post('/', async (req, res) => {
  const { legalName, rfc, contactName, contactEmail, contactPhone, address, notes, isTaxExempt } = req.body;
  if (!legalName) return res.status(400).json({ error: 'legalName requerido' });
  try {
    const c = await prisma.customer.create({
      data: {
        legalName, rfc: rfc || null,
        contactName: contactName || null,
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
        address: address || null,
        notes: notes || null,
        isTaxExempt: !!isTaxExempt,
      },
    });
    await audit(req, 'customer.create', 'Customer', c.id, { legalName }, { customerId: c.id });
    res.status(201).json({ data: c });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /customers/:id — editar
router.patch('/:id', async (req, res) => {
  try {
    const allowed = ['legalName', 'rfc', 'contactName', 'contactEmail', 'contactPhone', 'address', 'notes', 'isTaxExempt', 'status'];
    const data = {};
    for (const k of allowed) if (k in req.body) data[k] = req.body[k];
    const c = await prisma.customer.update({ where: { id: req.params.id }, data });
    await audit(req, 'customer.update', 'Customer', c.id, data, { customerId: c.id });
    res.json({ data: c });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /customers/:id/modules/:moduleCode/suspend — pass-through al vertical
router.patch('/:id/modules/:moduleCode/suspend', async (req, res) => {
  const { id, moduleCode } = req.params;
  try {
    const cm = await prisma.customerModule.findFirst({ where: { customerId: id, moduleCode } });
    if (!cm?.tenantIdInModule) return res.status(404).json({ error: 'Tenant no vinculado' });

    // Pass-through: llama al vertical con HMAC
    await sendCommand(moduleCode, 'tenant.suspend', { tenantId: cm.tenantIdInModule, reason: req.body.reason || null });

    await prisma.customerModule.update({ where: { id: cm.id }, data: { status: 'suspended' } });
    await audit(req, 'customer.module.suspend', 'CustomerModule', cm.id,
      { moduleCode, tenantId: cm.tenantIdInModule },
      { customerId: id, moduleCode });

    res.json({ data: { ok: true } });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// PATCH /customers/:id/modules/:moduleCode/unsuspend
router.patch('/:id/modules/:moduleCode/unsuspend', async (req, res) => {
  const { id, moduleCode } = req.params;
  try {
    const cm = await prisma.customerModule.findFirst({ where: { customerId: id, moduleCode } });
    if (!cm?.tenantIdInModule) return res.status(404).json({ error: 'Tenant no vinculado' });

    await sendCommand(moduleCode, 'tenant.unsuspend', { tenantId: cm.tenantIdInModule });
    await prisma.customerModule.update({ where: { id: cm.id }, data: { status: 'active' } });
    await audit(req, 'customer.module.unsuspend', 'CustomerModule', cm.id,
      { moduleCode },
      { customerId: id, moduleCode });

    res.json({ data: { ok: true } });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /customers/:id/modules · vincular tenant a customer + crear License
// Soporta core modules (Finance/HR/etc.) per-vertical via parentVerticalCode.
// Ej: { moduleCode: 'fin', parentVerticalCode: 'kp' } = Finance × Kompaws.
router.post('/:id/modules', async (req, res) => {
  const { id } = req.params;
  const {
    moduleCode, parentVerticalCode = null,
    tenantIdInModule, tenantSlug,
    tier, priceMXN, licenseDays,
  } = req.body;

  if (!moduleCode || !tenantIdInModule) {
    return res.status(400).json({ error: 'moduleCode y tenantIdInModule requeridos' });
  }

  try {
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) return res.status(404).json({ error: 'Customer no existe' });

    const module = await prisma.module.findUnique({ where: { code: moduleCode } });
    if (!module) return res.status(404).json({ error: 'Module no registrado' });

    // Unique compuesto · permite Finance×KP y Finance×RT como rows separadas
    const existing = await prisma.customerModule.findFirst({
      where: { customerId: id, moduleCode, parentVerticalCode },
    });
    if (existing) {
      const label = parentVerticalCode ? `${moduleCode} × ${parentVerticalCode}` : moduleCode;
      return res.status(409).json({ error: `Customer ya tiene ${label} vinculado`, existingId: existing.id });
    }

    const cm = await prisma.customerModule.create({
      data: {
        customerId: id,
        moduleCode,
        parentVerticalCode,
        tenantIdInModule,
        tenantSlug: tenantSlug || null,
        status: 'active',
      },
    });

    // Crear License · por default trial 30d precio 0 si no especifican
    const { randomBytes } = require('crypto');
    const finalTier = tier || 'trial';
    const finalPrice = priceMXN != null ? Number(priceMXN) : 0;
    const finalDays = licenseDays != null ? Number(licenseDays) : 30;

    const license = await prisma.license.create({
      data: {
        customerModuleId: cm.id,
        tier: finalTier,
        key: `${moduleCode.toUpperCase()}-${finalTier.toUpperCase()}-${randomBytes(4).toString('hex').toUpperCase()}`,
        priceMXN: finalPrice,
        activatedAt: new Date(),
        expiresAt: new Date(Date.now() + finalDays * 86400 * 1000),
        status: 'active',
      },
    });

    await audit(req, 'customer.module.attach', 'CustomerModule', cm.id,
      { moduleCode, tenantIdInModule, tier: finalTier, priceMXN: finalPrice },
      { customerId: id, moduleCode });

    res.status(201).json({ data: { customerModule: cm, license } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /customers/:customerId/available-tenants/:moduleCode · lista tenants del vertical que aún no están vinculados a NINGÚN customer en Admin
router.get('/available-tenants/:moduleCode', async (req, res) => {
  try {
    const moduleCode = req.params.moduleCode;
    const { pull } = require('../utils/vertical-client');

    // Pull todos los tenants del vertical
    const remote = await pull(moduleCode, '/api/v1/admin/tenants');
    const allTenants = remote.data || [];

    // Buscar qué tenant IDs ya están vinculados en Admin (cualquier customer)
    const linked = await prisma.customerModule.findMany({
      where: { moduleCode },
      select: { tenantIdInModule: true },
    });
    const linkedIds = new Set(linked.map((l) => l.tenantIdInModule));

    // Separar: available (no linked) vs taken (ya en uso por otro customer)
    const available = [];
    const taken = [];
    for (const t of allTenants) {
      const entry = {
        id: t.id,
        name: t.name,
        slug: t.slug,
        tier: t.tier,
        status: t.status,
      };
      if (linkedIds.has(t.id)) taken.push(entry);
      else available.push(entry);
    }

    res.json({ data: { available, taken, total: allTenants.length } });
  } catch (err) {
    res.status(502).json({ error: 'No se pudieron cargar tenants: ' + err.message });
  }
});

// DELETE /customers/:id/modules/:moduleCode · desvincular (no borra el tenant en el vertical)
// DELETE /customers/:id/modules/:moduleCode[?parentVerticalCode=kp]
// Para core modules pasa ?parentVerticalCode=<vertical> · para verticales puros omitir
router.delete('/:id/modules/:moduleCode', async (req, res) => {
  const { id, moduleCode } = req.params;
  const parentVerticalCode = req.query.parentVerticalCode || null;
  try {
    const cm = await prisma.customerModule.findFirst({
      where: { customerId: id, moduleCode, parentVerticalCode },
    });
    if (!cm) return res.status(404).json({ error: 'No vinculado' });

    await prisma.customerModule.delete({ where: { id: cm.id } });
    await audit(req, 'customer.module.detach', 'CustomerModule', cm.id,
      { moduleCode, parentVerticalCode, tenantIdInModule: cm.tenantIdInModule },
      { customerId: id, moduleCode });

    res.json({ data: { ok: true, detachedTenantId: cm.tenantIdInModule, parentVerticalCode } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
