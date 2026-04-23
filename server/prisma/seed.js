/**
 * Seed · crea el super-admin único + registra módulo RT.
 * Password super-admin se genera random · se muestra UNA vez en consola.
 */
require('dotenv').config();

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../src/db');
const { encrypt } = require('../src/utils/encryption');

const EMAIL = process.env.SEED_SUPERADMIN_EMAIL || 'alejandro.rodriguez@muselecom.com';
const NAME = process.env.SEED_SUPERADMIN_NAME || 'Alejandro Rodriguez';

async function main() {
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  Imperium Analytics Admin · Seed');
  console.log('════════════════════════════════════════════════════════════\n');

  // ── Super-admin ──────────────────────────────────────────
  let existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  let tempPassword = null;

  if (!existing) {
    tempPassword = crypto.randomBytes(12).toString('base64').replace(/[+/=]/g, '').slice(0, 16) + '!';
    const hash = await bcrypt.hash(tempPassword, 10);

    existing = await prisma.user.create({
      data: {
        email: EMAIL,
        name: NAME,
        passwordHash: hash,
        role: 'superadmin',
        mfaEnabled: false,
        forcePasswordChange: true, // se fuerza tras enroll MFA
      },
    });

    console.log('▶ Super-admin creado');
    console.log('  Email:    ' + EMAIL);
    console.log('  Password: \x1b[33m' + tempPassword + '\x1b[0m');
    console.log('\n  GUARDA ESTE PASSWORD AHORA · 1Password/Bitwarden');
    console.log('  Se usa UNA vez para el primer login.');
    console.log('  En primer login:');
    console.log('    1) enroll MFA con Google Authenticator/Authy · escanea QR');
    console.log('    2) guarda los 8 recovery codes que se muestren');
    console.log('    3) cambia password por uno definitivo tuyo\n');
  } else {
    console.log('▶ Super-admin ya existe: ' + existing.email);
    console.log('  Si olvidaste el password, corre: node scripts/reset-admin-password.js\n');
  }

  // ── Módulo RT registrado ─────────────────────────────────
  const RT_SHARED_SECRET = process.env.RT_WEBHOOK_SECRET ||
    'c8a2f7e5d9b3a1c4e6f8a0d2c5b7e9a1d3f5b7c9e1a3f5b7d9c1e3a5f7b9d1c3'; // el mismo que RT tiene en IMPERIUM_WEBHOOK_SECRET

  const rtExists = await prisma.module.findUnique({ where: { code: 'rt' } });
  if (!rtExists) {
    await prisma.module.create({
      data: {
        code: 'rt',
        name: 'RoundTable',
        description: 'Gestión de proyectos grupales · Trello + Autodesk Build',
        apiEndpoint: 'http://localhost:3003',
        sharedSecretCipher: encrypt(RT_SHARED_SECRET),
        status: 'active',
      },
    });
    console.log('▶ Módulo RT registrado');
    console.log('  Endpoint: http://localhost:3003');
    console.log('  SharedSecret: sincronizado con RT/.env IMPERIUM_WEBHOOK_SECRET\n');
  } else {
    console.log('▶ Módulo RT ya registrado\n');
  }

  console.log('════════════════════════════════════════════════════════════');
  console.log('  Seed completado. Siguiente: npm run dev');
  console.log('════════════════════════════════════════════════════════════\n');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
