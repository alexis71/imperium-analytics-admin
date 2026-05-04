#!/usr/bin/env node
/**
 * Reset password del super-admin · sin pedir el password actual.
 * Solo para emergencia · cuando se perdió el password.
 *
 * Uso:
 *   cd Imperium_Analytics_Admin/server && node scripts/reset-admin-password.js
 *   cd Imperium_Analytics_Admin/server && node scripts/reset-admin-password.js --password "NewPass123!"
 *   cd Imperium_Analytics_Admin/server && node scripts/reset-admin-password.js --email otro@email.com --password "NewPass123!"
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../src/db');

const flags = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) flags[a.slice(2)] = process.argv[i + 1] || true;
}

const email = flags.email || 'alejandro.rodriguez@muselecom.com';
const newPassword = flags.password || 'CambiarEnProd2026!';

(async () => {
  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) {
    console.error(`✗ User ${email} no existe`);
    process.exit(1);
  }

  const hash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: hash,
      forcePasswordChange: false,
    },
  });

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Password reset · Imperium Admin');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('  Email:       ' + email);
  console.log('  Password:    ' + newPassword);
  console.log('  Role:        ' + user.role);
  console.log('  MFA:         ' + (user.mfaEnabled ? 'habilitado · necesitarás código TOTP' : 'no habilitado · te pedirá setup'));
  console.log('');
  console.log('  Login:       http://localhost:5175');
  console.log('═══════════════════════════════════════════════════════════');

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
