/**
 * Expire-licenses sweep · N°80 (siguiente fase billing).
 *
 * Transiciona licencias vencidas según el calendario LFPDPPP de PRICING.md §5:
 *   0-29 días vencido  → activo (grace · reminders vía dunning · BACKLOG)
 *   30-59              → SUSPENDED (read-only)   ← este sweep actúa aquí
 *   60-89              → quarantined             (solo cuenta candidatos · no actúa aún)
 *   90+                → archived (export ZIP)    (solo cuenta candidatos · no actúa aún)
 *
 * Acción a los ≥30d: License.status='expired' + CustomerModule.status='suspended'
 * (License no tiene estado 'suspended'; el estado read-only del cliente vive en CustomerModule).
 *
 * Idempotente: solo procesa Licenses status='active'. Una vez 'expired' no se re-procesa.
 * Best-effort push al vertical (no rompe el sweep si el vertical está caído / no soporta el comando).
 */
const SUSPEND_AFTER_DAYS = 30;     // PRICING.md §5
const QUARANTINE_AFTER_DAYS = 60;
const ARCHIVE_AFTER_DAYS = 90;
const DAY_MS = 86400 * 1000;

/**
 * @param {object} ctx
 * @param {object} ctx.prisma         PrismaClient (inyectado · cron usa fresh client · test usa el suyo)
 * @param {object} [ctx.logger]       { info, warn }
 * @param {function} [ctx.sendCommand] async (moduleCode, command, payload) → push al vertical (best-effort)
 * @param {Date} [ctx.now]            override para tests
 * @returns {Promise<{checked,suspended,inGrace,quarantineCandidates,archiveCandidates,errors,actions}>}
 */
async function expireLicensesSweep({ prisma, logger = {}, sendCommand = null, now = new Date() }) {
  const result = { checked: 0, suspended: 0, inGrace: 0, quarantineCandidates: 0, archiveCandidates: 0, errors: 0, actions: [] };

  const expired = await prisma.license.findMany({
    where: { status: 'active', expiresAt: { lt: now } },
    include: { customerModule: { include: { module: { select: { code: true, name: true } } } } },
    orderBy: { expiresAt: 'asc' },
  });
  result.checked = expired.length;

  for (const lic of expired) {
    try {
      const cm = lic.customerModule;
      const daysOverdue = Math.floor((now.getTime() - new Date(lic.expiresAt).getTime()) / DAY_MS);

      if (daysOverdue >= ARCHIVE_AFTER_DAYS) result.archiveCandidates++;
      else if (daysOverdue >= QUARANTINE_AFTER_DAYS) result.quarantineCandidates++;

      if (daysOverdue < SUSPEND_AFTER_DAYS) {
        result.inGrace++;
        continue; // 0-29 · sigue activo · reminders (dunning) es backlog
      }

      // ≥30d vencido → suspender (read-only · LFPDPPP §5)
      await prisma.$transaction([
        prisma.license.update({ where: { id: lic.id }, data: { status: 'expired' } }),
        prisma.customerModule.update({ where: { id: cm.id }, data: { status: 'suspended' } }),
      ]);

      if (sendCommand && cm?.moduleCode && cm?.tenantIdInModule) {
        try {
          await sendCommand(cm.moduleCode, 'license.suspend', {
            tenantId: cm.tenantIdInModule, licenseKey: lic.key, reason: 'expired', daysOverdue,
          });
        } catch (pushErr) {
          logger.warn?.('expire.push.fail', { moduleCode: cm.moduleCode, error: pushErr.message });
        }
      }

      try {
        await prisma.auditLog.create({
          data: {
            userId: null, action: 'license.auto-suspend',
            moduleCode: cm?.moduleCode || null, customerId: cm?.customerId || null,
            entity: 'License', entityId: String(lic.id),
            metadata: { daysOverdue, expiresAt: lic.expiresAt, tier: lic.tier, key: lic.key, by: 'cron:expire-licenses' },
          },
        });
      } catch (auditErr) { logger.warn?.('expire.audit.fail', { error: auditErr.message }); }

      result.suspended++;
      result.actions.push({ licenseId: lic.id, customerId: cm?.customerId, moduleCode: cm?.moduleCode, daysOverdue });
      logger.info?.('license.auto-suspend', { licenseId: lic.id, moduleCode: cm?.moduleCode, daysOverdue });
    } catch (err) {
      result.errors++;
      logger.warn?.('expire.license.error', { licenseId: lic.id, error: err.message });
    }
  }

  return result;
}

module.exports = { expireLicensesSweep, SUSPEND_AFTER_DAYS, QUARANTINE_AFTER_DAYS, ARCHIVE_AFTER_DAYS };
