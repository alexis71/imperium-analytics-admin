/**
 * Registro one-shot del módulo crm (Imperium CRM · G.4 N°38) en Admin.
 *
 * Pattern análogo a register-hub-module.js + register-{sa,fin,hr}.
 * Idempotente: si ya existe, lo deja como está.
 */
require('dotenv').config();
const prisma = require('../src/db');
const { encrypt } = require('../src/utils/encryption');

const CRM_SHARED_SECRET = process.env.CRM_SHARED_SECRET
  || '9013fa5bfb1a95cdf7cfa42cd571c113670e97b7e84f6bc21d03ff77d70e2291';

async function main() {
  const existing = await prisma.module.findUnique({ where: { code: 'crm' } });
  if (existing) {
    console.log('▶ Módulo crm ya registrado · status:', existing.status);
    await prisma.$disconnect();
    return;
  }
  await prisma.module.create({
    data: {
      code: 'crm',
      name: 'Imperium CRM',
      description: 'CRM · Customer + Lead + Pipeline + Opportunity + Activity · core module Fase G.4',
      apiEndpoint: 'http://localhost:3060',
      sharedSecretCipher: encrypt(CRM_SHARED_SECRET),
      status: 'active',
    },
  });
  console.log('▶ Módulo crm registrado');
  console.log('  Endpoint: http://localhost:3060');
  console.log('  SharedSecret: sincronizado con Imperium_Crm/.env IMPERIUM_WEBHOOK_SECRET');
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
