#!/usr/bin/env node
/**
 * Regenera MFA secret + 8 recovery codes para super-admin.
 * Genera QR PNG escaneable.
 *
 * Uso:
 *   cd Imperium_Analytics_Admin/server && node scripts/reset-admin-mfa.js
 *   cd Imperium_Analytics_Admin/server && node scripts/reset-admin-mfa.js --email otro@email.com
 *   cd Imperium_Analytics_Admin/server && node scripts/reset-admin-mfa.js --disable    # solo deshabilita MFA · no genera nuevo
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { authenticator } = require('otplib');
const { encrypt } = require('../src/utils/encryption');
const { generateCodes, hashAll } = require('../src/utils/recovery-codes');
const prisma = require('../src/db');

authenticator.options = {
  window: Number(process.env.MFA_WINDOW || 2),
  digits: 6,
  step: 30,
};

const flags = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) flags[a.slice(2)] = process.argv[i + 1] || true;
}

const email = flags.email || 'alejandro.rodriguez@muselecom.com';

(async () => {
  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) {
    console.error(`✗ User ${email} no existe`);
    process.exit(1);
  }

  if (flags.disable === true) {
    await prisma.user.update({
      where: { id: user.id },
      data: { mfaEnabled: false, mfaSecretCipher: null, recoveryCodesHashed: [] },
    });
    console.log(`✓ MFA deshabilitado para ${email} · próximo login pedirá setup`);
    process.exit(0);
  }

  const secret = authenticator.generateSecret();
  const codes = generateCodes(8);
  const codesHashed = await hashAll(codes);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      mfaEnabled: true,
      mfaSecretCipher: encrypt(secret),
      recoveryCodesHashed: codesHashed,
      forcePasswordChange: false,
    },
  });

  const otpauth = authenticator.keyuri(email, 'Imperium Admin', secret);
  const outDir = path.resolve(__dirname, '..', '..', 'mfa-recovery');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const qrPath = path.join(outDir, `imperium-admin-mfa-${stamp}.png`);
  await QRCode.toFile(qrPath, otpauth, { width: 400, margin: 2 });

  const sample = authenticator.generate(secret);
  const verify = authenticator.verify({ token: sample, secret });

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  MFA REGENERADO · Imperium Admin');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('  📱  ESCANEA EL QR (más confiable que teclear secret):');
  console.log('     ' + qrPath);
  console.log('');
  console.log('  📋  TOTP SECRET (alternativa manual):');
  console.log('     ' + secret);
  console.log('');
  console.log('  🆘  RECOVERY CODES (cada uno UNA vez):');
  codes.forEach((c, i) => console.log('     ' + (i + 1) + '. ' + c));
  console.log('');
  console.log('  ⏰  Server time:  ' + new Date().toISOString());
  console.log('  🔢  Código TOTP ahora (debe coincidir con tu app): ' + sample);
  console.log('  ✅  Verify roundtrip: ' + (verify ? 'OK' : 'FAIL'));
  console.log('  🪟  Window: ' + authenticator.options.window + ' steps (±' + (authenticator.options.window * 30) + 's tolerancia)');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  IMPORTANTE en tu app autenticadora:');
  console.log('  1. ELIMINA cualquier entrada vieja de "Imperium Admin"');
  console.log('  2. Agrega NUEVA escaneando el QR (recomendado)');
  console.log('  3. Verifica que tu teléfono tiene auto-sync de hora');
  console.log('═══════════════════════════════════════════════════════════');

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
