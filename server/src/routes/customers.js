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
// Soporta ?parentVerticalCode=kp para core modules (fin × kp · fin × rt · fin × nk)
router.patch('/:id/modules/:moduleCode/suspend', async (req, res) => {
  const { id, moduleCode } = req.params;
  const parentVerticalCode = req.query.parentVerticalCode || null;
  try {
    const cm = await prisma.customerModule.findFirst({
      where: { customerId: id, moduleCode, parentVerticalCode },
    });
    if (!cm?.tenantIdInModule) return res.status(404).json({ error: 'Tenant no vinculado' });

    // Pass-through al vertical (target = parentVerticalCode si es core module · si no, moduleCode)
    const target = parentVerticalCode || moduleCode;
    await sendCommand(target, 'tenant.suspend', { tenantId: cm.tenantIdInModule, reason: req.body.reason || null });

    await prisma.customerModule.update({ where: { id: cm.id }, data: { status: 'suspended' } });
    await audit(req, 'customer.module.suspend', 'CustomerModule', cm.id,
      { moduleCode, parentVerticalCode, tenantId: cm.tenantIdInModule },
      { customerId: id, moduleCode });

    res.json({ data: { ok: true } });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// PATCH /customers/:id/modules/:moduleCode/unsuspend
router.patch('/:id/modules/:moduleCode/unsuspend', async (req, res) => {
  const { id, moduleCode } = req.params;
  const parentVerticalCode = req.query.parentVerticalCode || null;
  try {
    const cm = await prisma.customerModule.findFirst({
      where: { customerId: id, moduleCode, parentVerticalCode },
    });
    if (!cm?.tenantIdInModule) return res.status(404).json({ error: 'Tenant no vinculado' });

    const target = parentVerticalCode || moduleCode;
    await sendCommand(target, 'tenant.unsuspend', { tenantId: cm.tenantIdInModule });
    await prisma.customerModule.update({ where: { id: cm.id }, data: { status: 'active' } });
    await audit(req, 'customer.module.unsuspend', 'CustomerModule', cm.id,
      { moduleCode, parentVerticalCode },
      { customerId: id, moduleCode });

    res.json({ data: { ok: true } });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// PATCH /customers/:id/modules/:moduleCode/extend — extiende license actual N días
// Body: { days: number }
router.patch('/:id/modules/:moduleCode/extend', async (req, res) => {
  const { id, moduleCode } = req.params;
  const parentVerticalCode = req.query.parentVerticalCode || null;
  const days = Number(req.body.days);
  if (!days || days <= 0) return res.status(400).json({ error: 'days requerido (entero positivo)' });
  try {
    const cm = await prisma.customerModule.findFirst({
      where: { customerId: id, moduleCode, parentVerticalCode },
      include: { licenses: { where: { status: 'active' }, orderBy: { expiresAt: 'desc' }, take: 1 } },
    });
    if (!cm) return res.status(404).json({ error: 'CustomerModule no existe' });
    const lic = cm.licenses[0];
    if (!lic) return res.status(404).json({ error: 'No hay license activa para extender' });

    const now = new Date();
    const base = lic.expiresAt > now ? lic.expiresAt : now;
    const newExpiry = new Date(base.getTime() + days * 86400 * 1000);
    const updated = await prisma.license.update({
      where: { id: lic.id },
      data: { expiresAt: newExpiry },
    });

    await audit(req, 'customer.module.extend', 'License', lic.id,
      { moduleCode, parentVerticalCode, days, oldExpiresAt: lic.expiresAt, newExpiresAt: newExpiry },
      { customerId: id, moduleCode });

    res.json({ data: { ok: true, license: updated } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /customers/:id/modules/:moduleCode/change-tier — cambia tier + price de license activa
// Body: { tier: string, priceMXN: number }
router.patch('/:id/modules/:moduleCode/change-tier', async (req, res) => {
  const { id, moduleCode } = req.params;
  const parentVerticalCode = req.query.parentVerticalCode || null;
  const { tier, priceMXN } = req.body;
  if (!tier) return res.status(400).json({ error: 'tier requerido' });
  if (priceMXN == null || isNaN(Number(priceMXN)) || Number(priceMXN) < 0) {
    return res.status(400).json({ error: 'priceMXN requerido (>= 0)' });
  }
  try {
    const cm = await prisma.customerModule.findFirst({
      where: { customerId: id, moduleCode, parentVerticalCode },
      include: { licenses: { where: { status: 'active' }, orderBy: { expiresAt: 'desc' }, take: 1 } },
    });
    if (!cm) return res.status(404).json({ error: 'CustomerModule no existe' });
    const lic = cm.licenses[0];
    if (!lic) return res.status(404).json({ error: 'No hay license activa' });

    const updated = await prisma.license.update({
      where: { id: lic.id },
      data: { tier, priceMXN: Number(priceMXN) },
    });

    await audit(req, 'customer.module.change_tier', 'License', lic.id,
      { moduleCode, parentVerticalCode, oldTier: lic.tier, newTier: tier, oldPrice: lic.priceMXN, newPrice: Number(priceMXN) },
      { customerId: id, moduleCode });

    res.json({ data: { ok: true, license: updated } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /customers/:id/module-matrix — payload listo para <ModuleMatrix mode="admin">
// Returns { catalog, verticals, activations } shape compatible con Forge module-matrix
router.get('/:id/module-matrix', async (req, res) => {
  try {
    const customerId = req.params.id;

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) return res.status(404).json({ error: 'Customer no existe' });

    const allModules = await prisma.module.findMany({ where: { status: 'active' } });

    // Heurística: módulos vertical = los que aparecen como CustomerModule con parentVerticalCode=NULL (kp/rt/nk/al/ad/iahb)
    // módulos core = los que aparecen como parentVerticalCode != NULL (fin/hr/sa/inv/crm/...)
    // En la BD Module no hay un flag isCore · usamos lista canónica (convención Forge 4-chars · sa = Imperium Sales).
    const CORE_MODULE_CODES = new Set(['fin', 'fis', 'hr', 'sa', 'inv', 'crm', 'purchasing']);
    const VERTICAL_MODULE_CODES = new Set(['kp', 'rt', 'nk', 'al']);

    const cms = await prisma.customerModule.findMany({
      where: { customerId },
      include: {
        module: { select: { code: true, name: true } },
        licenses: { where: { status: 'active' }, orderBy: { expiresAt: 'desc' }, take: 1 },
      },
    });

    // Verticales activos del customer
    const verticalCMs = cms.filter(cm => !cm.parentVerticalCode && VERTICAL_MODULE_CODES.has(cm.moduleCode));
    const ACCENT = { kp: '#10b981', rt: '#d4a24e', nk: '#3b82f6', al: '#7c3aed' };
    const NAMES = { kp: 'Kompaws', rt: 'RoundTable', nk: 'NetKnight', al: 'Almena' };
    const verticals = verticalCMs.map(cm => ({
      moduleCode: cm.moduleCode,
      moduleName: cm.module.name || NAMES[cm.moduleCode] || cm.moduleCode,
      moduleAccent: ACCENT[cm.moduleCode] || '#94a3b8',
      status: cm.status,
      tier: cm.licenses[0]?.tier || null,
    }));

    // Catalog: módulos core registrados en Admin (filtra por código canónico)
    const CORE_META = {
      fin: { name: 'Finance', accent: '#16a34a', priceMXN: 99, description: 'Contabilidad · Balance · PyG · Libro Mayor' },
      fis: { name: 'Fiscal/SAT', accent: '#ef4444', priceMXN: 149, description: 'Facturación · CFDI · timbrado' },
      hr:  { name: 'RH/Nómina', accent: '#ec4899', priceMXN: 129, description: 'Empleados · nómina · prestaciones' },
      sa:  { name: 'Cotizaciones', accent: '#06b6d4', priceMXN: 499, description: 'Cotizaciones · propuestas · contratos · pipeline cross-vertical' },
      inv: { name: 'Almacén', accent: '#f59e0b', priceMXN: 79, description: 'Inventario · proveedores · stock' },
      crm: { name: 'CRM', accent: '#06b6d4', priceMXN: 89, description: 'Customer relationship management' },
    };
    const catalog = {};
    for (const m of allModules) {
      if (CORE_MODULE_CODES.has(m.code)) {
        const meta = CORE_META[m.code] || {};
        catalog[m.code] = {
          moduleCode: m.code,
          name: meta.name || m.name,
          accent: meta.accent || '#94a3b8',
          priceMXN: meta.priceMXN || 0,
          description: meta.description || '',
        };
      }
    }

    // Activations: cada CustomerModule con parentVerticalCode != null (core × vertical)
    const activations = cms
      .filter(cm => cm.parentVerticalCode && CORE_MODULE_CODES.has(cm.moduleCode))
      .map(cm => ({
        moduleCode: cm.moduleCode,
        verticalCode: cm.parentVerticalCode,
        status: cm.status,
        tier: cm.licenses[0]?.tier || null,
        priceMXN: cm.licenses[0]?.priceMXN || 0,
        tenantSlug: cm.tenantSlug,
        expiresAt: cm.licenses[0]?.expiresAt || null,
      }));

    res.json({ data: { catalog, verticals, activations } });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    autoProvision = false, // N°60 · C-arch · auto-create tenant en módulo destino si miss tenantIdInModule
  } = req.body;

  if (!moduleCode) {
    return res.status(400).json({ error: 'moduleCode requerido' });
  }

  // N°60 · C-arch: si autoProvision=true y miss tenantIdInModule, auto-provision tenant
  // (vs default behavior: require tenantIdInModule explícito · pattern N°41-N°48)
  if (!autoProvision && !tenantIdInModule) {
    return res.status(400).json({ error: 'tenantIdInModule requerido (o usar autoProvision=true)' });
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

    // N°60 · C-arch · auto-provision para HR/CRM si flag set + miss tenantId
    let finalTenantIdInModule = tenantIdInModule;
    let finalTenantSlug = tenantSlug;
    let provisioned = false;
    if (autoProvision && !tenantIdInModule && ['hr', 'crm'].includes(moduleCode)) {
      // Resolve target module endpoint + secret
      const MODULE_ENDPOINTS = {
        hr:  { url: process.env.HR_URL  || 'http://localhost:3040', secret: process.env.HR_EXTERNAL_WRITE_SECRET },
        crm: { url: process.env.CRM_URL || 'http://localhost:3060', secret: process.env.CRM_EXTERNAL_WRITE_SECRET },
      };
      const cfg = MODULE_ENDPOINTS[moduleCode];
      if (!cfg.secret) return res.status(500).json({ error: `${moduleCode.toUpperCase()}_EXTERNAL_WRITE_SECRET no configurado en Admin .env` });

      // Naming convention: <module>-<customer-slug-base>-<vertical-suffix>
      const customerSlugBase = (customer.legalName || 'customer').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
      const verticalSuffix = parentVerticalCode ? `-${parentVerticalCode}` : '';
      const newSlug = `${moduleCode}-${customerSlugBase}${verticalSuffix}`;
      const customerName = `Imperium ${moduleCode.toUpperCase()} · ${customer.legalName}${parentVerticalCode ? ` · ${parentVerticalCode.toUpperCase()}` : ''}`;
      const ownerEmail = customer.contactEmail || `${customerSlugBase}@local.com`;
      const ownerName = customer.contactName || customer.legalName;

      try {
        const provRes = await fetch(`${cfg.url}/api/v1/external/tenants`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.secret}` },
          body: JSON.stringify({ slug: newSlug, name: customerName, ownerEmail, ownerName, tier: tier || 'herald', verticalCode: parentVerticalCode, verticalTenantSlug: null }),
          signal: AbortSignal.timeout(8000),
        });
        if (!provRes.ok) {
          const txt = await provRes.text();
          return res.status(502).json({ error: `Auto-provision ${moduleCode} falló: ${provRes.status}`, detail: txt.slice(0, 300) });
        }
        const provData = await provRes.json();
        finalTenantIdInModule = provData.data?.id;
        finalTenantSlug = provData.data?.slug;
        provisioned = true;
      } catch (e) {
        return res.status(502).json({ error: `Auto-provision ${moduleCode} unreachable: ${e.message}` });
      }
    }

    const cm = await prisma.customerModule.create({
      data: {
        customerId: id,
        moduleCode,
        parentVerticalCode,
        tenantIdInModule: finalTenantIdInModule,
        tenantSlug: finalTenantSlug || null,
        status: 'active',
      },
    });

    // N°61 · C-arch auto-sync staff/customers post-provision · cierra E2E del flow
    // Si provisionamos tenant HR/CRM + tenemos parentVerticalCode, jalar staff/customers
    // desde el vertical origen y empujarlos al nuevo tenant automáticamente.
    let synced = null;
    if (autoProvision && provisioned && parentVerticalCode && ['hr', 'crm'].includes(moduleCode)) {
      try {
        // Resolver slug del vertical padre desde CustomerModule (donde parentVerticalCode IS NULL)
        const parentCm = await prisma.customerModule.findFirst({
          where: { customerId: id, moduleCode: parentVerticalCode, parentVerticalCode: null },
          select: { tenantSlug: true },
        });
        const sourceTenantSlug = parentCm?.tenantSlug;

        if (sourceTenantSlug) {
          const VERTICAL_BASES = {
            kp:    { url: process.env.KP_URL    || 'http://localhost:3006', secret: process.env.KP_EXTERNAL_READ_SECRET },
            rt:    { url: process.env.RT_URL    || 'http://localhost:3003', secret: process.env.RT_EXTERNAL_READ_SECRET },
            nk:    { url: process.env.NK_URL    || 'http://localhost:3001', secret: process.env.NK_EXTERNAL_READ_SECRET },
            sales: { url: process.env.SALES_URL || 'http://localhost:3050', secret: process.env.SALES_EXTERNAL_READ_SECRET },
          };
          // RT/NK NO exportan customers (decisión N°42) · solo HR sync para esos verticales
          // N°66 · fix bug E2E · pull+push URLs faltaban prefix /api/v1/ (verticales montan /external bajo /api/v1)
          const PULL_ENDPOINTS = {
            'hr':  { kp: '/api/v1/external/staff-for-hr',   rt: '/api/v1/external/staff-for-hr',   nk: '/api/v1/external/staff-for-hr',  sales: '/api/v1/external/staff-for-hr' },
            'crm': { kp: '/api/v1/external/owners-for-crm', sales: '/api/v1/external/customers-for-crm' /* rt/nk skip */ },
          };
          const TARGET_SYNC = {
            'hr':  { url: process.env.HR_URL  || 'http://localhost:3040', secret: process.env.HR_EXTERNAL_WRITE_SECRET, path: '/api/v1/external/employees/sync', payloadKey: 'employees' },
            'crm': { url: process.env.CRM_URL || 'http://localhost:3060', secret: process.env.CRM_EXTERNAL_WRITE_SECRET, path: '/api/v1/external/customers/sync', payloadKey: 'customers' },
          };

          const vcfg = VERTICAL_BASES[parentVerticalCode];
          const pullPath = PULL_ENDPOINTS[moduleCode]?.[parentVerticalCode];
          const target = TARGET_SYNC[moduleCode];

          if (vcfg && vcfg.secret && pullPath && target?.secret) {
            // Pull source data
            const pullUrl = `${vcfg.url}${pullPath}?tenantSlug=${encodeURIComponent(sourceTenantSlug)}`;
            const pullRes = await fetch(pullUrl, {
              headers: { Authorization: `Bearer ${vcfg.secret}` },
              signal: AbortSignal.timeout(8000),
            });
            if (pullRes.ok) {
              const pullJ = await pullRes.json();
              const items = pullJ.data || [];
              if (items.length > 0) {
                // Push to target module sync endpoint
                const pushRes = await fetch(`${target.url}${target.path}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${target.secret}` },
                  body: JSON.stringify({ tenantId: finalTenantIdInModule, [target.payloadKey]: items }),
                  signal: AbortSignal.timeout(15000),
                });
                if (pushRes.ok) {
                  const pushJ = await pushRes.json();
                  synced = { source: parentVerticalCode, sourceTenant: sourceTenantSlug, pulled: items.length, ...pushJ.data };
                } else {
                  synced = { source: parentVerticalCode, error: `sync push ${pushRes.status}` };
                }
              } else {
                synced = { source: parentVerticalCode, sourceTenant: sourceTenantSlug, pulled: 0, note: 'source sin data' };
              }
            } else {
              synced = { source: parentVerticalCode, error: `pull ${pullRes.status}` };
            }
          } else {
            synced = { source: parentVerticalCode, skipped: 'config missing or vertical no exporta este módulo (rt/nk no exportan customers)' };
          }
        } else {
          synced = { skipped: 'parent vertical tenant slug no encontrado' };
        }
      } catch (e) {
        synced = { error: e.message };
      }
    }

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
      { moduleCode, tenantIdInModule: finalTenantIdInModule, tier: finalTier, priceMXN: finalPrice, autoProvisioned: provisioned, synced },
      { customerId: id, moduleCode });

    res.status(201).json({ data: { customerModule: cm, license }, meta: { autoProvisioned: provisioned, synced } });
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

// GET /customers/:id/vertical-kpis/:moduleCode · proxy a vertical's /admin/finanzas-kpis
// Usado por Hub para alimentar Preview cross-vertical con datos reales (N°20)
router.get('/:id/vertical-kpis/:moduleCode', async (req, res) => {
  const { id, moduleCode } = req.params;
  try {
    const cm = await prisma.customerModule.findFirst({
      where: { customerId: id, moduleCode, parentVerticalCode: null },
    });
    if (!cm?.tenantIdInModule) {
      return res.status(404).json({ error: 'Tenant no vinculado en este vertical' });
    }

    // Verticales con slug field (kp, rt) usan tenantSlug · NK usa tenantId
    const useSlug = ['kp', 'rt'].includes(moduleCode) && cm.tenantSlug;
    const qp = useSlug
      ? `tenantSlug=${encodeURIComponent(cm.tenantSlug)}`
      : `tenantId=${encodeURIComponent(cm.tenantIdInModule)}`;

    const result = await pull(moduleCode, `/api/v1/admin/finanzas-kpis?${qp}`);
    res.json({ data: result.data });
  } catch (err) {
    res.status(502).json({ error: err.message, code: 'VERTICAL_PULL_FAILED' });
  }
});

module.exports = router;
