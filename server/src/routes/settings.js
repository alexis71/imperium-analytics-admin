const express = require('express');
const crypto = require('crypto');
const prisma = require('../db');
const { auth } = require('../middleware/auth');
const { audit } = require('../utils/audit');
const { encrypt, decrypt } = require('../utils/encryption');
const { generateCodes, hashAll } = require('../utils/recovery-codes');

const router = express.Router();
router.use(auth('superadmin'));

function maskSecret(s) {
  if (!s) return null;
  if (s.length <= 12) return '****';
  return s.slice(0, 4) + '…' + s.slice(-4);
}

// GET /settings/modules — lista con secret enmascarado
router.get('/modules', async (req, res) => {
  const mods = await prisma.module.findMany({ orderBy: { code: 'asc' } });
  res.json({
    data: mods.map((m) => ({
      code: m.code,
      name: m.name,
      apiEndpoint: m.apiEndpoint,
      status: m.status,
      sharedSecretMasked: maskSecret(decrypt(m.sharedSecretCipher)),
      hasApiToken: !!m.apiTokenCipher,
      lastSyncAt: m.lastSyncAt,
    })),
  });
});

// POST /settings/modules/:code/rotate-secret — genera nuevo shared secret
router.post('/modules/:code/rotate-secret', async (req, res) => {
  try {
    const m = await prisma.module.findUnique({ where: { code: req.params.code } });
    if (!m) return res.status(404).json({ error: 'Module no existe' });

    const newSecret = crypto.randomBytes(32).toString('hex');
    await prisma.module.update({
      where: { code: m.code },
      data: { sharedSecretCipher: encrypt(newSecret) },
    });

    await audit(req, 'module.secret.rotate', 'Module', m.code, null, { moduleCode: m.code });

    res.json({
      data: {
        code: m.code,
        newSecret,
        warning: 'Copia este valor AHORA · actualiza IMPERIUM_WEBHOOK_SECRET en el .env del vertical correspondiente. No se volverá a mostrar.',
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /settings/mfa — estado MFA del usuario actual
router.get('/mfa', async (req, res) => {
  const u = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { mfaEnabled: true, recoveryCodesHashed: true, lastLoginAt: true, lastLoginIP: true },
  });
  const remaining = (u.recoveryCodesHashed || []).filter(Boolean).length;
  res.json({
    data: {
      mfaEnabled: u.mfaEnabled,
      recoveryCodesRemaining: remaining,
      lastLoginAt: u.lastLoginAt,
      lastLoginIP: u.lastLoginIP,
    },
  });
});

// POST /settings/mfa/regenerate-recovery — nuevos recovery codes (invalida los anteriores)
router.post('/mfa/regenerate-recovery', async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!u?.mfaEnabled) return res.status(400).json({ error: 'MFA no habilitado' });

  const codes = generateCodes(8);
  const hashed = await hashAll(codes);

  await prisma.user.update({
    where: { id: u.id },
    data: { recoveryCodesHashed: hashed },
  });

  await audit(req, 'mfa.recovery.regenerate', 'User', u.id, { count: codes.length });
  res.json({
    data: {
      recoveryCodes: codes,
      warning: 'Guarda estos 8 códigos ahora · los anteriores dejaron de funcionar. No se volverán a mostrar.',
    },
  });
});

module.exports = router;
