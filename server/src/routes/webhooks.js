/**
 * Webhook receiver · verificación HMAC por módulo emisor.
 *
 * POST /api/v1/webhooks/ingest
 *   Headers:
 *     X-Imperium-Signature: <hex HMAC-SHA256 del raw body>
 *     X-Imperium-Module:    rt | nk | kp
 *   Body JSON: { event, payload, moduleCode?, timestamp? }
 *
 * Middleware rawBody está aplicado a nivel index.js · req.rawBody disponible.
 */
const express = require('express');
const prisma = require('../db');
const logger = require('../utils/logger');
const { decrypt } = require('../utils/encryption');
const { verify } = require('../utils/imperium-signature');

const router = express.Router();

router.post('/ingest', async (req, res) => {
  const sig = req.headers['x-imperium-signature'];
  const mod = String(req.headers['x-imperium-module'] || '').toLowerCase();
  const event = req.body?.event;
  const payload = req.body?.payload || req.body || {};

  if (!sig || !mod || !event) {
    return res.status(400).json({ error: 'Headers y event requeridos' });
  }

  try {
    const module = await prisma.module.findUnique({ where: { code: mod } });
    if (!module) {
      return res.status(404).json({ error: 'Módulo no registrado', code: 'MODULE_UNKNOWN' });
    }
    if (module.status !== 'active') {
      return res.status(403).json({ error: 'Módulo pausado' });
    }

    const secret = decrypt(module.sharedSecretCipher);
    const verified = verify(req.rawBody, sig, secret);

    const saved = await prisma.webhookEvent.create({
      data: {
        moduleCode: mod,
        event,
        payload,
        signature: String(sig),
        headers: {
          moduleHeader: mod,
          userAgent: req.headers['user-agent'] || null,
        },
        verified,
        ip: req.ip,
        error: verified ? null : 'Signature mismatch',
      },
    });

    if (!verified) {
      logger.warn('webhook.ingest.unverified', { module: mod, event, id: saved.id });
      return res.status(401).json({ error: 'Firma inválida', code: 'INVALID_SIGNATURE' });
    }

    // Handlers por tipo de evento
    let handlerError = null;
    try {
      await handleEvent(mod, event, payload);
    } catch (err) {
      handlerError = err.message;
      logger.error('webhook.handler.fail', { module: mod, event, error: err.message });
    }

    logger.info('webhook.ingest', { module: mod, event, id: saved.id });
    await prisma.webhookEvent.update({
      where: { id: saved.id },
      data: { processedAt: new Date(), error: handlerError },
    });

    res.json({ data: { received: true, id: saved.id, handled: !handlerError } });
  } catch (err) {
    logger.error('webhook.ingest.error', { error: err.message });
    res.status(500).json({ error: 'Error al procesar webhook' });
  }
});

async function handleEvent(moduleCode, event, payload) {
  switch (event) {
    case 'tenant.created': {
      // Auto-vincula: crea Customer si no existe, crea CustomerModule
      const legalName = payload.name || payload.slug || 'Sin nombre';
      let customer = await prisma.customer.findFirst({ where: { legalName } });
      if (!customer) customer = await prisma.customer.create({ data: { legalName, status: 'active' } });

      const existing = await prisma.customerModule.findFirst({
        where: { customerId: customer.id, moduleCode },
      });
      if (!existing) {
        await prisma.customerModule.create({
          data: {
            customerId: customer.id,
            moduleCode,
            tenantIdInModule: payload.tenantId || payload.id,
            tenantSlug: payload.slug || null,
            status: 'active',
          },
        });
      }
      return;
    }

    case 'tenant.suspended': {
      const cm = await prisma.customerModule.findFirst({
        where: { moduleCode, tenantIdInModule: payload.tenantId || payload.id },
      });
      if (cm) await prisma.customerModule.update({ where: { id: cm.id }, data: { status: 'suspended' } });
      return;
    }

    case 'tenant.unsuspended': {
      const cm = await prisma.customerModule.findFirst({
        where: { moduleCode, tenantIdInModule: payload.tenantId || payload.id },
      });
      if (cm) await prisma.customerModule.update({ where: { id: cm.id }, data: { status: 'active' } });
      return;
    }

    case 'tenant.tier.changed': {
      // El tier vive en License. Si el payload trae licenseKey + nuevo tier, actualizamos.
      // Si solo trae tenantId, log y dejamos para reconcile manual (script reconcile-empresa.js).
      const key = payload.licenseKey || payload.key || null;
      const newTier = payload.tier || payload.newTier || null;
      if (!key || !newTier) {
        logger.info('webhook.tenant.tier.changed.skipped', { moduleCode, reason: 'sin licenseKey o tier en payload' });
        return;
      }
      const lic = await prisma.license.findUnique({ where: { key } });
      if (!lic) {
        logger.warn('webhook.tenant.tier.changed.no_license', { moduleCode, key });
        return;
      }
      await prisma.license.update({ where: { id: lic.id }, data: { tier: newTier } });
      logger.info('webhook.tenant.tier.changed.applied', { moduleCode, key, tier: newTier });
      return;
    }

    case 'license.activated': {
      // Vertical reportó que una License existente fue activada/reactivada.
      // No crea License automáticamente: License nace en Admin UI (Customer → Issue License)
      // y la key viaja al vertical después.
      const key = payload.licenseKey || payload.key;
      if (!key) {
        logger.warn('webhook.license.activated.no_key', { moduleCode, payload });
        return;
      }
      const lic = await prisma.license.findUnique({ where: { key } });
      if (!lic) {
        logger.warn('webhook.license.activated.no_license', { moduleCode, key });
        return;
      }
      await prisma.license.update({
        where: { id: lic.id },
        data: {
          status: 'active',
          activatedAt: payload.activatedAt ? new Date(payload.activatedAt) : new Date(),
        },
      });
      logger.info('webhook.license.activated.applied', { moduleCode, key });
      return;
    }

    case 'license.extended': {
      // Vertical extendió fecha de expiración. Update expiresAt + status=active.
      const key = payload.licenseKey || payload.key;
      const newExpiresAt = payload.expiresAt || payload.newExpiresAt;
      if (!key || !newExpiresAt) {
        logger.warn('webhook.license.extended.invalid_payload', { moduleCode, hasKey: !!key, hasExpiry: !!newExpiresAt });
        return;
      }
      const lic = await prisma.license.findUnique({ where: { key } });
      if (!lic) {
        logger.warn('webhook.license.extended.no_license', { moduleCode, key });
        return;
      }
      await prisma.license.update({
        where: { id: lic.id },
        data: { expiresAt: new Date(newExpiresAt), status: 'active' },
      });
      logger.info('webhook.license.extended.applied', { moduleCode, key, until: newExpiresAt });
      return;
    }

    case 'license.expired': {
      // Vertical detectó expiración local. Marcamos status=expired en Admin.
      const key = payload.licenseKey || payload.key;
      if (!key) {
        logger.warn('webhook.license.expired.no_key', { moduleCode, payload });
        return;
      }
      const lic = await prisma.license.findUnique({ where: { key } });
      if (!lic) {
        logger.warn('webhook.license.expired.no_license', { moduleCode, key });
        return;
      }
      await prisma.license.update({ where: { id: lic.id }, data: { status: 'expired' } });
      logger.info('webhook.license.expired.applied', { moduleCode, key });
      return;
    }

    case 'license.cancelled':
    case 'license.suspended': {
      // Vertical reportó cancelación/suspensión.
      const key = payload.licenseKey || payload.key;
      if (!key) {
        logger.warn('webhook.license.cancelled.no_key', { moduleCode, payload });
        return;
      }
      const lic = await prisma.license.findUnique({ where: { key } });
      if (!lic) {
        logger.warn('webhook.license.cancelled.no_license', { moduleCode, key });
        return;
      }
      await prisma.license.update({ where: { id: lic.id }, data: { status: 'cancelled' } });
      logger.info('webhook.license.cancelled.applied', { moduleCode, key });
      return;
    }

    case 'ping': return;

    default:
      logger.info('webhook.event.unknown', { moduleCode, event });
  }
}

module.exports = router;
