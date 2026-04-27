/**
 * Admin Override · soporte cliente cuando pierde password / MFA.
 *
 * Proxy hacia los endpoints `/api/v1/admin/...` de cada vertical (Hub/KP/Sceptra).
 * Requiere super_admin JWT. Audit se loguea EN AMBOS lados (Admin + vertical).
 *
 * Endpoints:
 *   GET  /admin-override/users?moduleCode=&tenantId=  → lista users del tenant
 *   POST /admin-override/users/:userId/reset-password { moduleCode, tenantId, newPassword?, reason, alsoResetMfa }
 *   POST /admin-override/users/:userId/disable-mfa    { moduleCode, tenantId, reason }
 */
const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const { pull } = require('../utils/vertical-client');
const { audit } = require('../utils/audit');
const logger = require('../utils/logger');

const router = express.Router();
router.use(auth('superadmin'));

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation error', details: errors.array() });
  next();
};

// Hub usa /admin/hub-users/:id · resto usa /admin/tenants/:tenantId/users/:userId
function buildUrl(moduleCode, action, tenantId, userId) {
  if (moduleCode === 'iahb') {
    return `/api/v1/admin/hub-users/${userId}/${action}`;
  }
  return `/api/v1/admin/tenants/${tenantId}/users/${userId}/${action}`;
}

// GET /admin-override/users?moduleCode=&tenantId=
router.get('/users',
  query('moduleCode').isString().isLength({ min: 1 }),
  query('tenantId').isUUID(),
  validate,
  async (req, res) => {
    try {
      const { moduleCode, tenantId } = req.query;
      const path = moduleCode === 'iahb'
        ? `/api/v1/admin/tenants/${tenantId}` // Hub uses tenant detail (User legacy) but reads HubUsers separately
        : `/api/v1/admin/tenants/${tenantId}`;
      const result = await pull(moduleCode, path);
      res.json({ data: result.data?.users || [] });
    } catch (err) {
      logger.error('admin-override.users.list', { error: err.message });
      res.status(502).json({ error: err.message });
    }
  }
);

// GET /admin-override/hub-users → lista HubUsers (vertical iahb)
router.get('/hub-users', async (req, res) => {
  try {
    // Hub no tiene endpoint genérico de listar HubUsers · usamos query directa via service-key sería ideal
    // Por simplicidad pulleamos via /admin/negocio que retorna HubUsers usage
    const result = await pull('iahb', '/api/v1/admin/negocio');
    res.json({ data: result.data?.hubUsers || result.data || [] });
  } catch (err) {
    logger.error('admin-override.hub-users.list', { error: err.message });
    res.status(502).json({ error: err.message });
  }
});

// POST /admin-override/users/:userId/reset-password
router.post('/users/:userId/reset-password',
  param('userId').isUUID(),
  body('moduleCode').isString(),
  body('tenantId').optional().isUUID(),
  body('reason').isString().trim().isLength({ min: 5, max: 500 }),
  body('newPassword').optional().isString().isLength({ min: 8, max: 128 }),
  body('alsoResetMfa').optional().isBoolean(),
  validate,
  async (req, res) => {
    const { moduleCode, tenantId, reason, newPassword, alsoResetMfa } = req.body;
    try {
      const url = buildUrl(moduleCode, 'reset-password', tenantId, req.params.userId);
      const result = await pull(moduleCode, url, {
        method: 'POST',
        body: { reason, newPassword, alsoResetMfa: !!alsoResetMfa },
      });
      await audit(req, 'override.password_reset', 'User', req.params.userId, {
        moduleCode, tenantId, reason, alsoResetMfa: !!alsoResetMfa, passwordProvided: !!newPassword,
      });
      logger.info('admin-override.reset_password', { userId: req.params.userId, moduleCode, by: req.user.id });
      res.json(result);
    } catch (err) {
      logger.error('admin-override.reset_password', { error: err.message });
      res.status(502).json({ error: err.message });
    }
  }
);

// POST /admin-override/users/:userId/disable-mfa
router.post('/users/:userId/disable-mfa',
  param('userId').isUUID(),
  body('moduleCode').isString(),
  body('tenantId').optional().isUUID(),
  body('reason').isString().trim().isLength({ min: 5, max: 500 }),
  validate,
  async (req, res) => {
    const { moduleCode, tenantId, reason } = req.body;
    try {
      const url = buildUrl(moduleCode, 'disable-mfa', tenantId, req.params.userId);
      const result = await pull(moduleCode, url, {
        method: 'POST',
        body: { reason },
      });
      await audit(req, 'override.mfa_disabled', 'User', req.params.userId, {
        moduleCode, tenantId, reason,
      });
      logger.info('admin-override.disable_mfa', { userId: req.params.userId, moduleCode, by: req.user.id });
      res.json(result);
    } catch (err) {
      logger.error('admin-override.disable_mfa', { error: err.message });
      res.status(502).json({ error: err.message });
    }
  }
);

module.exports = router;
