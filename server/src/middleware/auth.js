/**
 * JWT auth middleware para Admin.
 *
 * auth()                  → cualquier user autenticado (MFA ya pasó en la sesión)
 * auth('superadmin')      → solo superadmin
 * requireMfaSetup()       → fuerza que MFA esté habilitado (para rutas sensibles)
 *
 * Camino alterno · `X-Imperium-Admin-Key: <secret>` donde secret es el sharedSecret
 * de algún Module registrado (activo). Usado por Hub para pull data de customer,
 * por servicios que necesitan read-only automatizado.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

let _prismaRef = null;
function prisma() { return _prismaRef || (_prismaRef = require('../db')); }

async function verifyServiceKey(key) {
  if (!key) return null;
  const { decrypt } = require('../utils/encryption');
  const modules = await prisma().module.findMany({ where: { status: 'active' } });
  const incoming = Buffer.from(String(key));
  for (const m of modules) {
    try {
      const secret = Buffer.from(decrypt(m.sharedSecretCipher));
      if (incoming.length === secret.length && crypto.timingSafeEqual(incoming, secret)) {
        return m;
      }
    } catch {}
  }
  return null;
}

function auth(...roles) {
  return async (req, res, next) => {
    // Camino B · service-key (Hub, scripts, futuro)
    const serviceKey = req.headers['x-imperium-admin-key'];
    if (serviceKey) {
      const module = await verifyServiceKey(serviceKey);
      if (module) {
        // Los service callers tienen scope "superadmin" de solo-lectura (read endpoints)
        // Endpoints que modifican state siguen requiriendo JWT de superadmin humano.
        if (roles.length > 0 && !roles.includes('superadmin')) {
          return res.status(403).json({ error: 'Service-key solo con scope superadmin', code: 'FORBIDDEN' });
        }
        req.user = {
          id: `service:${module.code}`,
          email: `${module.code}@service.imperium.local`,
          name: `${module.name} service`,
          role: 'superadmin',
          isServiceAccount: true,
          callerModule: module.code,
        };
        return next();
      }
      return res.status(401).json({ error: 'Service key inválido', code: 'SERVICE_KEY_INVALID' });
    }

    // Camino A · JWT humano (MFA ya pasó)
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token requerido', code: 'TOKEN_MISSING' });
    }
    try {
      const p = jwt.verify(h.slice(7), JWT_SECRET);
      if (p.purpose && p.purpose !== 'access') {
        return res.status(401).json({ error: 'Token intermedio no válido para esta ruta', code: 'TOKEN_INTERMEDIATE' });
      }
      if (roles.length > 0 && !roles.includes(p.role)) {
        return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN', required: roles });
      }
      req.user = { id: p.userId, email: p.email, name: p.name, role: p.role };
      next();
    } catch {
      return res.status(401).json({ error: 'Token invalido o expirado', code: 'TOKEN_INVALID' });
    }
  };
}

function requireMfaSetup() {
  return (req, res, next) => {
    const prisma = require('../db');
    prisma.user.findUnique({ where: { id: req.user.id } })
      .then((u) => {
        if (!u?.mfaEnabled) return res.status(403).json({ error: 'MFA setup required', code: 'MFA_REQUIRED' });
        next();
      })
      .catch(() => res.status(500).json({ error: 'Error de verificación MFA' }));
  };
}

module.exports = { auth, requireMfaSetup, JWT_SECRET };
