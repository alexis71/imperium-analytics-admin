const prisma = require('../db');
const logger = require('./logger');

async function audit(req, action, entity, entityId, details = null, extras = {}) {
  try {
    return await prisma.auditLog.create({
      data: {
        userId:     req?.user?.id || null,
        action,
        moduleCode: extras.moduleCode || null,
        customerId: extras.customerId || null,
        entity:     entity || null,
        entityId:   entityId ? String(entityId) : null,
        metadata:   details || null,
        ipAddress:  req?.ip || req?.headers?.['x-forwarded-for'] || null,
        userAgent:  req?.headers?.['user-agent'] || null,
      },
    });
  } catch (err) {
    logger.warn('audit.fail', { error: err.message, action });
    return null;
  }
}

module.exports = { audit };
