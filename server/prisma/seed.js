/**
 * Seed · super-admin + Module registry + demo customers/modules/licenses.
 * Idempotente · seguro de re-correr.
 *
 * Bloques:
 *   1. Super-admin user (genera pwd one-time si no existe)
 *   2. Module registry (rt, kp, nk, iahb) · sin esto pulls vertical→Admin fallan 502
 *   3. Demo customers (alejandro · dueno@kompaws · dueno@multi)
 *   4. Demo CustomerModule + License (solo si los Tenants existen en cada vertical)
 *
 * Por qué ALL-IN-ONE: seed original solo cubría super-admin + RT · causaba "Service
 * key inválido" cuando Hub pullaba customers (faltaba Module[iahb]) · y dashboard
 * cliente mostraba 0 verticales (faltaba CustomerModule). Bug detectado N°15.
 *
 * Env vars opcionales (override defaults):
 *   SEED_SUPERADMIN_EMAIL · SEED_SUPERADMIN_NAME
 *   RT_WEBHOOK_SECRET · KP_WEBHOOK_SECRET · NK_WEBHOOK_SECRET · IAHB_WEBHOOK_SECRET
 */
require('dotenv').config();

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../src/db');
const { encrypt } = require('../src/utils/encryption');

const EMAIL = process.env.SEED_SUPERADMIN_EMAIL || 'alejandro.rodriguez@muselecom.com';
const NAME = process.env.SEED_SUPERADMIN_NAME || 'Alejandro Rodriguez';

const MODULES = [
  {
    code: 'rt', name: 'RoundTable',
    description: 'Sceptra · gestión de proyectos grupales (Trello + Autodesk Build)',
    apiEndpoint: 'http://localhost:3003',
    secret: process.env.RT_WEBHOOK_SECRET || '59bec18a415f63ddb6ccb194a6df9d39f83f5735549d463dfb8bb15241633cb2',
  },
  {
    code: 'kp', name: 'Kompaws',
    description: 'Vertical veterinario · clínicas multi-sucursal',
    apiEndpoint: 'http://localhost:3006',
    secret: process.env.KP_WEBHOOK_SECRET || 'f8591ccaab8e0c9765075f656cdb62fb9c5eb05250b2660fad6c5002a6a2f60b',
  },
  {
    code: 'nk', name: 'Almena (NetKnight)',
    description: 'IT monitoring por sucursal · Modo Red + Modo Offline',
    apiEndpoint: 'http://localhost:3001',
    secret: process.env.NK_WEBHOOK_SECRET || 'edc2832cabcfdd622f2c4a436517f0de723c4283cf60cefcc8064341593c0beb',
  },
  {
    code: 'iahb', name: 'Imperium Analytics Hub',
    description: 'Panel cliente cross-vertical · facturación + SSO',
    apiEndpoint: 'http://localhost:3020',
    secret: process.env.IAHB_WEBHOOK_SECRET || '2d7b2c1f61dec67ea01ed11f19c78752e8b51f76a12040ffdcc722ca9b0946d0',
  },
];

const DEMO_CUSTOMERS = [
  {
    contactEmail: 'alejandro.rodriguez@muselecom.com',
    legalName: 'Muselecom (interno)',
    contactName: 'Alejandro Rodriguez',
    notes: 'Cuenta interna · operación + soporte Muselecom',
    isTaxExempt: true,
    status: 'active',
    modules: [],
  },
  {
    contactEmail: 'dueno@kompaws.demo',
    legalName: 'Demo Veterinaria Kompaws · SA de CV',
    contactName: 'Dueño Demo Kompaws',
    notes: 'Tenant demo · Kompaws Herald · vinculado HubUser',
    status: 'active',
    modules: [
      { moduleCode: 'kp', tenantSlugInModule: 'kompaws-demo', tier: 'herald', priceMXN: 449 },
    ],
  },
  {
    contactEmail: 'dueno@multi.demo',
    legalName: 'Demo Multi-Vertical · SA de CV',
    contactName: 'Dueño Demo Multi',
    notes: 'Tenant demo · contrata KP + Sceptra · vinculado HubUser',
    status: 'active',
    modules: [
      { moduleCode: 'kp', tenantSlugInModule: 'kompaws-demo',  tier: 'herald', priceMXN: 449 },
      { moduleCode: 'rt', tenantSlugInModule: 'muselecom-demo', tier: 'herald', priceMXN: 399 },
    ],
  },
];

// Tenant lookup pre-poblado para los slugs demo conocidos.
// En reseed real, si los tenants cambiaron, este script salta el módulo (warn).
async function tenantLookup(moduleCode, slug) {
  // Slugs hardcoded · tenants demo conocidos a 2026-04-26
  const knownSlugs = {
    kp: { 'kompaws-demo': '2b15d850-4450-49d8-ac84-c2c21a7e9a70' },
    rt: { 'muselecom-demo': 'ffc9fedd-b03e-467e-a8af-76cbf243098c' },
  };
  return knownSlugs[moduleCode]?.[slug] || null;
}

async function seedSuperAdmin() {
  let existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (existing) {
    console.log('▶ Super-admin ya existe: ' + existing.email);
    return existing;
  }
  const tempPassword = crypto.randomBytes(12).toString('base64').replace(/[+/=]/g, '').slice(0, 16) + '!';
  const hash = await bcrypt.hash(tempPassword, 10);
  existing = await prisma.user.create({
    data: { email: EMAIL, name: NAME, passwordHash: hash, role: 'superadmin', mfaEnabled: false, forcePasswordChange: true },
  });
  console.log('▶ Super-admin creado');
  console.log('  Email:    ' + EMAIL);
  console.log('  Password: \x1b[33m' + tempPassword + '\x1b[0m');
  console.log('\n  GUARDA ESTE PASSWORD AHORA · 1Password/Bitwarden');
  console.log('  Se usa UNA vez para el primer login. Tras enroll MFA debe cambiarse.\n');
  return existing;
}

async function seedModules() {
  for (const m of MODULES) {
    const exists = await prisma.module.findUnique({ where: { code: m.code } });
    if (exists) {
      console.log(`▶ Módulo ${m.code} ya registrado`);
      continue;
    }
    await prisma.module.create({
      data: {
        code: m.code, name: m.name, description: m.description,
        apiEndpoint: m.apiEndpoint, sharedSecretCipher: encrypt(m.secret),
        status: 'active',
      },
    });
    console.log(`▶ Módulo ${m.code} registrado · ${m.apiEndpoint}`);
    if (!process.env[`${m.code.toUpperCase()}_WEBHOOK_SECRET`] && m.code !== 'rt' && m.code !== 'iahb') {
      console.log(`  ⚠ secret RANDOM · sincroniza con ${m.code}/.env IMPERIUM_WEBHOOK_SECRET para pulls vertical→Admin`);
    }
  }
}

async function seedDemoCustomersAndModules() {
  for (const c of DEMO_CUSTOMERS) {
    let customer = await prisma.customer.findFirst({ where: { contactEmail: c.contactEmail } });
    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          contactEmail: c.contactEmail, legalName: c.legalName, contactName: c.contactName,
          notes: c.notes, status: c.status, isTaxExempt: c.isTaxExempt || false,
        },
      });
      console.log(`▶ Customer creado · ${c.contactEmail}`);
    } else {
      console.log(`▶ Customer ya existe · ${c.contactEmail}`);
    }

    for (const mod of c.modules) {
      const tenantId = await tenantLookup(mod.moduleCode, mod.tenantSlugInModule);
      if (!tenantId) {
        console.log(`  ⚠ tenantId desconocido para ${mod.moduleCode}/${mod.tenantSlugInModule} · saltando`);
        continue;
      }
      let cm = await prisma.customerModule.findFirst({
        where: { customerId: customer.id, moduleCode: mod.moduleCode },
      });
      if (!cm) {
        cm = await prisma.customerModule.create({
          data: {
            customerId: customer.id, moduleCode: mod.moduleCode,
            tenantIdInModule: tenantId, tenantSlug: mod.tenantSlugInModule, status: 'active',
          },
        });
        console.log(`  + CustomerModule ${mod.moduleCode}`);
      }
      const lic = await prisma.license.findFirst({ where: { customerModuleId: cm.id } });
      if (!lic) {
        await prisma.license.create({
          data: {
            customerModuleId: cm.id, tier: mod.tier,
            key: `${mod.moduleCode.toUpperCase()}-DEMO-${crypto.randomBytes(8).toString('hex').toUpperCase()}`,
            status: 'active',
            expiresAt: new Date(Date.now() + 365 * 86400 * 1000),
            priceMXN: mod.priceMXN, autoRenew: true,
          },
        });
        console.log(`  + License ${mod.tier} · $${mod.priceMXN}/mes`);
      }
    }
  }
}

async function main() {
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  Imperium Analytics Admin · Seed v2');
  console.log('════════════════════════════════════════════════════════════\n');

  await seedSuperAdmin();
  console.log('');
  await seedModules();
  console.log('');
  await seedDemoCustomersAndModules();

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  Seed completado · siguiente: npm run dev');
  console.log('════════════════════════════════════════════════════════════\n');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
