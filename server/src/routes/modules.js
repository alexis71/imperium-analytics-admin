const express = require('express');
const prisma = require('../db');
const { auth } = require('../middleware/auth');
const { audit } = require('../utils/audit');
const { encrypt, decrypt } = require('../utils/encryption');
const { checkHealth, pull } = require('../utils/vertical-client');

const router = express.Router();
router.use(auth('superadmin'));

// GET /modules — lista con health status
router.get('/', async (req, res) => {
  const modules = await prisma.module.findMany({
    orderBy: { code: 'asc' },
    include: { _count: { select: { customerModules: true, webhookEvents: true } } },
  });
  res.json({
    data: modules.map((m) => ({
      code: m.code, name: m.name, description: m.description,
      apiEndpoint: m.apiEndpoint, status: m.status, version: m.version,
      lastSyncAt: m.lastSyncAt, lastHealthCheck: m.lastHealthCheck, lastHealthStatus: m.lastHealthStatus,
      customersUsing: m._count.customerModules,
      webhooksReceived: m._count.webhookEvents,
    })),
  });
});

// GET /modules/:code — detalle (secretos NO se devuelven)
router.get('/:code', async (req, res) => {
  const m = await prisma.module.findUnique({ where: { code: req.params.code } });
  if (!m) return res.status(404).json({ error: 'Module no existe' });
  const { sharedSecretCipher, apiTokenCipher, ...safe } = m;
  res.json({ data: safe });
});

// POST /modules — registrar nuevo módulo
router.post('/', async (req, res) => {
  const { code, name, description, apiEndpoint, sharedSecret } = req.body;
  if (!code || !name || !apiEndpoint || !sharedSecret) {
    return res.status(400).json({ error: 'code, name, apiEndpoint, sharedSecret requeridos' });
  }
  try {
    const m = await prisma.module.create({
      data: {
        code: code.toLowerCase(),
        name, description,
        apiEndpoint,
        sharedSecretCipher: encrypt(sharedSecret),
        status: 'active',
      },
    });
    await audit(req, 'module.register', 'Module', m.code, { name });
    res.status(201).json({ data: { code: m.code, name: m.name } });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Code ya existe' });
    res.status(500).json({ error: err.message });
  }
});

// POST /modules/:code/health — forzar health check
router.post('/:code/health', async (req, res) => {
  try {
    const data = await checkHealth(req.params.code);
    res.json({ data });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /modules/:code/sync — pull tenants + licencias, actualiza CustomerModules
router.post('/:code/sync', async (req, res) => {
  const code = req.params.code;
  try {
    // RT expone GET /api/v1/admin/tenants
    const { data: tenants } = await pull(code, '/api/v1/admin/tenants');
    let created = 0, updated = 0, linked = 0;

    for (const t of tenants || []) {
      // Busca CustomerModule ya vinculado
      let cm = await prisma.customerModule.findFirst({
        where: { moduleCode: code, tenantIdInModule: t.id },
        include: { customer: true },
      });

      if (cm) {
        // Update state
        await prisma.customerModule.update({
          where: { id: cm.id },
          data: {
            tenantSlug: t.slug || null,
            status: t.status === 'active' ? 'active' : (t.status || 'active'),
            updatedAt: new Date(),
          },
        });
        updated++;
      } else {
        // Crear Customer + CustomerModule si no existen
        const legalName = t.name || t.slug || 'Sin nombre';
        let customer = await prisma.customer.findFirst({ where: { legalName } });
        if (!customer) {
          customer = await prisma.customer.create({
            data: { legalName, status: 'active' },
          });
          created++;
        }
        await prisma.customerModule.create({
          data: {
            customerId: customer.id,
            moduleCode: code,
            tenantIdInModule: t.id,
            tenantSlug: t.slug || null,
            status: t.status === 'active' ? 'active' : (t.status || 'active'),
          },
        });
        linked++;
      }
    }

    await prisma.module.update({
      where: { code },
      data: { lastSyncAt: new Date() },
    });
    await audit(req, 'module.sync', 'Module', code, { created, updated, linked });

    res.json({ data: { created, updated, linked, total: tenants?.length || 0 } });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
