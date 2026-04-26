/**
 * Registro one-shot del módulo iahb (Imperium Analytics Hub) en Admin.
 *
 * Por qué: el seed.js original solo registraba RT. Sin Module[iahb] en Admin,
 * Hub no puede pullar customer data via X-Imperium-Admin-Key (Admin rechaza el
 * secret porque no encuentra match en Module activos). Bug histórico no
 * detectado porque /my/modules sin ?refresh=true devolvía cache vacío [] sin
 * error, pero HubDashboard llama load(true) en mount.
 *
 * Idempotente: si ya existe, lo deja como está.
 */
require('dotenv').config();
const prisma = require('../src/db');
const { encrypt } = require('../src/utils/encryption');

const HUB_SHARED_SECRET = process.env.IAHB_SHARED_SECRET
  || 'f0d97538c98deecae3bba168241f5dee5bb6a95ecfa93cd2e317979940c44748';

async function main() {
  const existing = await prisma.module.findUnique({ where: { code: 'iahb' } });
  if (existing) {
    console.log('▶ Módulo iahb ya registrado · status:', existing.status);
    await prisma.$disconnect();
    return;
  }
  await prisma.module.create({
    data: {
      code: 'iahb',
      name: 'Imperium Analytics Hub',
      description: 'Panel cliente cross-vertical · facturación + SSO',
      apiEndpoint: 'http://localhost:3020',
      sharedSecretCipher: encrypt(HUB_SHARED_SECRET),
      status: 'active',
    },
  });
  console.log('▶ Módulo iahb registrado');
  console.log('  Endpoint: http://localhost:3020');
  console.log('  SharedSecret: sincronizado con Hub/.env IMPERIUM_WEBHOOK_SECRET');
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
