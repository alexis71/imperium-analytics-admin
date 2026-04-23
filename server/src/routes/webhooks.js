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
      // El tier vive dentro de License (no en CustomerModule); se reconcilia en C.3
      // cuando exista sync de licenses. Por ahora solo registra.
      return;
    }

    case 'license.activated':
    case 'license.extended':
    case 'license.expired': {
      // TODO C.3 · tracking de licenses individuales
      return;
    }

    case 'ping': return;

    default:
      logger.info('webhook.event.unknown', { moduleCode, event });
  }
}

module.exports = router;
