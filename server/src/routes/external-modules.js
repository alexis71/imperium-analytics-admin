/**
 * External · módulos del customer resueltos por tenant de un vertical · N°80 (item A / M3).
 *
 * Permite a un VERTICAL (KP/RT/NK) preguntar "para mi tenant, ¿qué módulos tiene contratado
 * este customer?" — sin que el vertical conozca el customerId (fuente de verdad = Admin).
 * Auth: X-Imperium-Admin-Key (el sharedSecret del Module del vertical · verifyServiceKey).
 */
const express = require('express');
const prisma = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();
router.use(auth()); // acepta service key (X-Imperium-Admin-Key) del vertical o JWT superadmin

// GET /external/customer-modules?moduleCode=kp&tenantSlug=kp-acme
// → resuelve el customer dueño de ese tenant del vertical · devuelve TODOS sus módulos activos
router.get('/customer-modules', async (req, res) => {
  try {
    const { moduleCode, tenantSlug } = req.query;
    if (!moduleCode || !tenantSlug) {
      return res.status(400).json({ error: 'moduleCode y tenantSlug requeridos' });
    }
    const anchor = await prisma.customerModule.findFirst({
      where: { moduleCode: String(moduleCode), tenantSlug: String(tenantSlug) },
      select: { customerId: true },
    });
    if (!anchor) return res.status(404).json({ error: 'No se encontró customer para ese tenant', code: 'NOT_FOUND' });

    const mods = await prisma.customerModule.findMany({
      where: { customerId: anchor.customerId, status: 'active' },
      include: {
        module: { select: { code: true, name: true } },
        licenses: { where: { status: 'active' }, orderBy: { expiresAt: 'desc' }, take: 1 },
      },
      orderBy: [{ parentVerticalCode: 'asc' }, { moduleCode: 'asc' }],
    });

    const data = mods.map((m) => {
      const lic = m.licenses[0];
      return {
        moduleCode: m.moduleCode,
        moduleName: m.module?.name || m.moduleCode,
        parentVerticalCode: m.parentVerticalCode || null,
        isVertical: !m.parentVerticalCode,
        tier: lic?.tier || null,
        status: m.status,
        expiresAt: lic?.expiresAt || null,
        daysRemaining: lic?.expiresAt ? Math.max(0, Math.ceil((new Date(lic.expiresAt) - Date.now()) / 86400000)) : null,
      };
    });

    res.json({
      data,
      meta: {
        customerId: anchor.customerId,
        verticals: data.filter((d) => d.isVertical).length,
        cores: data.filter((d) => !d.isVertical).length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
