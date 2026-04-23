/**
 * Auth · Login bifásico:
 *   1) POST /login          { email, password }      → { mfaToken } si mfaEnabled, sino { needsMfaSetup, setupToken }
 *   2) POST /mfa/verify     { mfaToken, code }       → { accessToken, refreshToken }
 *   2b) POST /mfa/setup     { setupToken }           → { qr, secret, recoveryCodes }
 *   2c) POST /mfa/enable    { setupToken, code }     → { accessToken, refreshToken, forcePasswordChange }
 *   3) POST /change-password{ password }             → ok
 *   4) POST /refresh        { refreshToken }         → { accessToken, refreshToken }
 *   5) POST /logout         { refreshToken }
 *   6) GET  /me
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');

const prisma = require('../db');
const logger = require('../utils/logger');
const { audit } = require('../utils/audit');
const { encrypt, decrypt } = require('../utils/encryption');
const { newSecret, verifyCode, qrDataUrl } = require('../utils/totp');
const { generateCodes, hashAll, findMatch } = require('../utils/recovery-codes');
const { auth, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXPIRES = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_DAYS = Number(process.env.REFRESH_EXPIRES_DAYS || 7);

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation error', details: errors.array() });
  next();
};

function signIntermediate(payload, purpose, expiresIn) {
  return jwt.sign({ ...payload, purpose }, JWT_SECRET, { expiresIn });
}

function signAccess(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, name: user.name, role: user.role, purpose: 'access' },
    JWT_SECRET,
    { expiresIn: ACCESS_EXPIRES }
  );
}

async function issueRefreshToken(userId) {
  const token = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_DAYS * 86400 * 1000);
  await prisma.refreshToken.create({ data: { token, userId, expiresAt } });
  return { token, expiresAt };
}

// ── POST /login ──────────────────────────────────────────
router.post('/login',
  body('email').isEmail().normalizeEmail(),
  body('password').isString().isLength({ min: 1 }),
  validate,
  async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await prisma.user.findFirst({ where: { email, isActive: true } });
      if (!user) return res.status(401).json({ error: 'Credenciales invalidas', code: 'INVALID_CREDENTIALS' });

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return res.status(401).json({ error: 'Credenciales invalidas', code: 'INVALID_CREDENTIALS' });

      if (!user.mfaEnabled) {
        const setupToken = signIntermediate({ userId: user.id }, 'mfa_setup', '10m');
        await audit(req, 'auth.login.needs_mfa_setup', 'User', user.id);
        return res.json({ data: { needsMfaSetup: true, setupToken } });
      }

      const mfaToken = signIntermediate({ userId: user.id }, 'mfa_verify', '10m');
      await audit(req, 'auth.login.needs_mfa', 'User', user.id);
      res.json({ data: { needsMfa: true, mfaToken } });
    } catch (err) {
      logger.error('auth.login', { error: err.message });
      res.status(500).json({ error: 'Error en login' });
    }
  }
);

// ── POST /mfa/setup ──────────────────────────────────────
// Recibe setupToken (de /login cuando mfaEnabled=false)
// Genera secret + QR + recovery codes (pending · no activa hasta /mfa/enable)
router.post('/mfa/setup',
  body('setupToken').isString(),
  validate,
  async (req, res) => {
    try {
      const p = jwt.verify(req.body.setupToken, JWT_SECRET);
      if (p.purpose !== 'mfa_setup') return res.status(401).json({ error: 'Token inválido' });

      const user = await prisma.user.findUnique({ where: { id: p.userId } });
      if (!user) return res.status(404).json({ error: 'Usuario no existe' });
      if (user.mfaEnabled) return res.status(400).json({ error: 'MFA ya está habilitado' });

      const secret = newSecret();
      const codes = generateCodes(8);
      const codesHashed = await hashAll(codes);

      // Guardar secret cifrado PENDIENTE · se confirma al /mfa/enable
      await prisma.user.update({
        where: { id: user.id },
        data: {
          mfaSecretCipher: encrypt(secret),
          recoveryCodesHashed: codesHashed,
        },
      });

      const qr = await qrDataUrl(secret, user.email);
      res.json({ data: { qr, secret, recoveryCodes: codes } });
    } catch (err) {
      logger.error('auth.mfa.setup', { error: err.message });
      res.status(400).json({ error: 'No se pudo iniciar setup MFA', code: 'MFA_SETUP_FAILED' });
    }
  }
);

// ── POST /mfa/enable ─────────────────────────────────────
// Confirma enrollment con primer código TOTP · marca mfaEnabled=true + forcePasswordChange=true
router.post('/mfa/enable',
  body('setupToken').isString(),
  body('code').isString().isLength({ min: 6, max: 6 }),
  validate,
  async (req, res) => {
    try {
      const p = jwt.verify(req.body.setupToken, JWT_SECRET);
      if (p.purpose !== 'mfa_setup') return res.status(401).json({ error: 'Token inválido' });

      const user = await prisma.user.findUnique({ where: { id: p.userId } });
      if (!user || !user.mfaSecretCipher) return res.status(400).json({ error: 'Setup no iniciado' });

      const secret = decrypt(user.mfaSecretCipher);
      const valid = verifyCode(secret, req.body.code);

      await prisma.mfaAttempt.create({ data: { userId: user.id, ip: req.ip, code: '****', valid } });
      if (!valid) return res.status(401).json({ error: 'Código incorrecto', code: 'MFA_INVALID' });

      await prisma.user.update({
        where: { id: user.id },
        data: { mfaEnabled: true, forcePasswordChange: true, lastLoginAt: new Date(), lastLoginIP: req.ip },
      });

      await audit(req, 'auth.mfa.enabled', 'User', user.id);

      const refresh = await issueRefreshToken(user.id);
      const refreshed = await prisma.user.findUnique({ where: { id: user.id } });
      res.json({
        data: {
          accessToken: signAccess(refreshed),
          refreshToken: refresh.token,
          user: { id: refreshed.id, email: refreshed.email, name: refreshed.name, role: refreshed.role },
          forcePasswordChange: true,
        },
      });
    } catch (err) {
      logger.error('auth.mfa.enable', { error: err.message });
      res.status(400).json({ error: 'No se pudo habilitar MFA' });
    }
  }
);

// ── POST /mfa/verify ─────────────────────────────────────
// Login normal · recibe mfaToken + code (TOTP o recovery)
router.post('/mfa/verify',
  body('mfaToken').isString(),
  body('code').isString().isLength({ min: 6, max: 20 }),
  validate,
  async (req, res) => {
    try {
      const p = jwt.verify(req.body.mfaToken, JWT_SECRET);
      if (p.purpose !== 'mfa_verify') return res.status(401).json({ error: 'Token inválido' });

      const user = await prisma.user.findUnique({ where: { id: p.userId } });
      if (!user || !user.mfaEnabled) return res.status(401).json({ error: 'MFA no habilitado' });

      const windowStart = new Date(Date.now() - 15 * 60 * 1000);
      const recentFails = await prisma.mfaAttempt.count({
        where: { userId: user.id, valid: false, createdAt: { gte: windowStart } },
      });
      if (recentFails >= 5) return res.status(429).json({ error: 'Demasiados intentos · intenta en 15 min', code: 'MFA_LOCKED' });

      const secret = decrypt(user.mfaSecretCipher);
      const code = String(req.body.code || '').trim();
      let valid = verifyCode(secret, code);
      let usedRecovery = null;

      if (!valid) {
        const idx = await findMatch(code, user.recoveryCodesHashed);
        if (idx >= 0) {
          valid = true;
          usedRecovery = idx;
        }
      }

      await prisma.mfaAttempt.create({ data: { userId: user.id, ip: req.ip, code: '****', valid } });
      if (!valid) return res.status(401).json({ error: 'Código incorrecto', code: 'MFA_INVALID' });

      // Consumir recovery code si aplica
      if (usedRecovery !== null) {
        const updated = [...user.recoveryCodesHashed];
        updated[usedRecovery] = ''; // marca usado
        await prisma.user.update({ where: { id: user.id }, data: { recoveryCodesHashed: updated } });
        await audit(req, 'auth.mfa.recovery_used', 'User', user.id, { remaining: updated.filter(Boolean).length });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date(), lastLoginIP: req.ip },
      });
      await audit(req, 'auth.login.success', 'User', user.id);

      const refresh = await issueRefreshToken(user.id);
      res.json({
        data: {
          accessToken: signAccess(user),
          refreshToken: refresh.token,
          user: { id: user.id, email: user.email, name: user.name, role: user.role },
          forcePasswordChange: user.forcePasswordChange,
        },
      });
    } catch (err) {
      logger.error('auth.mfa.verify', { error: err.message });
      res.status(400).json({ error: 'No se pudo verificar MFA' });
    }
  }
);

// ── POST /change-password ────────────────────────────────
router.post('/change-password',
  auth(),
  body('password').isString().isLength({ min: 8, max: 128 }),
  validate,
  async (req, res) => {
    try {
      const hash = await bcrypt.hash(req.body.password, 10);
      await prisma.user.update({
        where: { id: req.user.id },
        data: { passwordHash: hash, forcePasswordChange: false },
      });
      // Invalidar todas las sesiones excepto la actual (opcional)
      await audit(req, 'auth.password.changed', 'User', req.user.id);
      res.json({ data: { ok: true } });
    } catch (err) {
      res.status(500).json({ error: 'Error al cambiar password' });
    }
  }
);

// ── POST /refresh ────────────────────────────────────────
router.post('/refresh',
  body('refreshToken').isString().isLength({ min: 32 }),
  validate,
  async (req, res) => {
    try {
      const rec = await prisma.refreshToken.findUnique({ where: { token: req.body.refreshToken } });
      if (!rec || rec.expiresAt < new Date()) {
        return res.status(401).json({ error: 'Refresh inválido' });
      }
      const user = await prisma.user.findUnique({ where: { id: rec.userId } });
      if (!user || !user.isActive) return res.status(401).json({ error: 'Usuario inactivo' });

      await prisma.refreshToken.delete({ where: { token: rec.token } });
      const next = await issueRefreshToken(user.id);
      res.json({ data: { accessToken: signAccess(user), refreshToken: next.token } });
    } catch (err) {
      res.status(500).json({ error: 'Error al refrescar' });
    }
  }
);

// ── POST /logout ─────────────────────────────────────────
router.post('/logout', auth(), async (req, res) => {
  if (req.body.refreshToken) {
    await prisma.refreshToken.deleteMany({ where: { token: req.body.refreshToken } });
  }
  res.json({ data: { ok: true } });
});

// ── GET /me ──────────────────────────────────────────────
router.get('/me', auth(), async (req, res) => {
  const u = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true, email: true, name: true, role: true,
      mfaEnabled: true, forcePasswordChange: true,
      lastLoginAt: true, lastLoginIP: true,
    },
  });
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ data: u });
});

module.exports = router;
