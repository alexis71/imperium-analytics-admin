/**
 * seed-customer-modules-n40.js · Nivel 2 N°40 fix
 *
 * Activa HR + CRM en Hub demo accounts para que aparezcan en sidebar "Módulos activos":
 *   · demo1@local.com: hr × {kp,rt,nk} + crm × {kp,rt,nk}  (6 nuevas activaciones)
 *   · alejandro@muselecom: hr × kp + crm × kp              (2 nuevas activaciones)
 *
 * TenantSlugs son STUB · los tenants reales en HR/CRM se crean en N°41 C-arch
 * (activación per-vertical full · /external/tenants + flow completo).
 * Por ahora las pages /modulos/hr y /modulos/crm son placeholder · solo
 * sidebar visibility + "Abrir backend" link directo.
 *
 * Idempotente · upsert pattern de seed-demo-customer-modules.js.
 */
require('dotenv').config();
const crypto = require('crypto');
const prisma = require('../src/db');
const { encrypt } = require('../src/utils/encryption');

// HR webhook secret · KP/RT/NK comparten IMPERIUM_WEBHOOK_SECRET pattern
const HR_SHARED_SECRET = process.env.HR_SHARED_SECRET
  || '7c2a8e4f6b3d9c1a5e8b2f7d4c6a9e3b8d1f5c7a4e2b9d6c8f1a3e5b7d9c2f4a';

// Customer IDs (validados con query Admin DB N°40)
const CUST_MUSELECOM = 'e9c35e48-6675-4eda-8d02-06c494cfbd3b';
const CUST_DEMO1     = '3f3bec05-5399-4ff1-979c-e7a5d4a98612';

// Activaciones planificadas N°40 · pattern <core>-<customer-slug>-<vertical>
const PLAN = [
  // ── Muselecom · admin ve cores básicos ──
  { customerId: CUST_MUSELECOM, email: 'alejandro@muselecom', moduleCode: 'hr',  parentVerticalCode: 'kp', tenantSlug: 'hr-muselecom-kp',  tier: 'herald', priceMXN: 0 },
  { customerId: CUST_MUSELECOM, email: 'alejandro@muselecom', moduleCode: 'crm', parentVerticalCode: 'kp', tenantSlug: 'crm-muselecom-kp', tier: 'herald', priceMXN: 0 },

  // ── demo1 · cross-vertical full (HR + CRM × cada vertical) ──
  // N°44: slugs reales (matchean tenants HR provisionados N°42 vía provision-hr-tenant-for-customer.js)
  // Cierra hot-fix manual N°43 · próximos seeds nacen apuntando a tenants existentes
  { customerId: CUST_DEMO1, email: 'demo1', moduleCode: 'hr',  parentVerticalCode: 'kp', tenantSlug: 'hr-demo-1-vet',  tier: 'herald', priceMXN: 129 },
  { customerId: CUST_DEMO1, email: 'demo1', moduleCode: 'hr',  parentVerticalCode: 'rt', tenantSlug: 'hr-demo-1-proj', tier: 'herald', priceMXN: 129 },
  { customerId: CUST_DEMO1, email: 'demo1', moduleCode: 'hr',  parentVerticalCode: 'nk', tenantSlug: 'hr-demo-1-it',   tier: 'herald', priceMXN: 129 },
  // N°48: CRM slugs reales (matchean tenants CRM N°48 provisión multi-tenant · espejo HR N°44)
  // demo1 CRM × kp usa el seed original imperium_crm-demo (no se renombró · histórico)
  { customerId: CUST_DEMO1, email: 'demo1', moduleCode: 'crm', parentVerticalCode: 'kp', tenantSlug: 'imperium_crm-demo', tier: 'herald', priceMXN: 89  },
  { customerId: CUST_DEMO1, email: 'demo1', moduleCode: 'crm', parentVerticalCode: 'rt', tenantSlug: 'crm-demo-1-proj',  tier: 'herald', priceMXN: 89  },
  { customerId: CUST_DEMO1, email: 'demo1', moduleCode: 'crm', parentVerticalCode: 'nk', tenantSlug: 'crm-demo-1-it',    tier: 'herald', priceMXN: 89  },
];

async function main() {
  // 0. Asegurar Module HR registrado en Admin (Module CRM ya registrado N°38)
  const hrExisting = await prisma.module.findUnique({ where: { code: 'hr' } });
  if (!hrExisting) {
    await prisma.module.create({
      data: {
        code: 'hr',
        name: 'Imperium HR',
        description: 'Recursos humanos · empleados · horarios · nómina · core module Fase G.3',
        apiEndpoint: 'http://localhost:3040',
        sharedSecretCipher: encrypt(HR_SHARED_SECRET),
        status: 'active',
      },
    });
    console.log('+ Module hr registrado en Admin');
  } else {
    console.log('✓ Module hr ya existía');
  }

  let created = 0, updated = 0;
  for (const a of PLAN) {
    // CustomerModule (composite: customerId + moduleCode + parentVerticalCode)
    const existing = await prisma.customerModule.findFirst({
      where: { customerId: a.customerId, moduleCode: a.moduleCode, parentVerticalCode: a.parentVerticalCode },
    });

    let cm;
    if (existing) {
      cm = await prisma.customerModule.update({
        where: { id: existing.id },
        data: {
          tenantIdInModule: existing.tenantIdInModule || `stub-${a.moduleCode}-${a.parentVerticalCode}-${crypto.randomBytes(4).toString('hex')}`,
          tenantSlug: a.tenantSlug,
          status: 'active',
        },
      });
      updated++;
      console.log(`↻ ${a.email.padEnd(20)} ${a.moduleCode}×${a.parentVerticalCode} · updated`);
    } else {
      cm = await prisma.customerModule.create({
        data: {
          customerId: a.customerId,
          moduleCode: a.moduleCode,
          parentVerticalCode: a.parentVerticalCode,
          tenantIdInModule: `stub-${a.moduleCode}-${a.parentVerticalCode}-${crypto.randomBytes(4).toString('hex')}`,
          tenantSlug: a.tenantSlug,
          status: 'active',
        },
      });
      created++;
      console.log(`+ ${a.email.padEnd(20)} ${a.moduleCode}×${a.parentVerticalCode} · created`);
    }

    // License
    const lic = await prisma.license.findFirst({ where: { customerModuleId: cm.id, status: 'active' } });
    const expiresAt = new Date(Date.now() + 365 * 86400 * 1000);
    if (!lic) {
      await prisma.license.create({
        data: {
          customerModuleId: cm.id,
          tier: a.tier,
          key: `${a.moduleCode.toUpperCase()}-DEMO-${crypto.randomBytes(8).toString('hex').toUpperCase()}`,
          status: 'active',
          expiresAt,
          priceMXN: a.priceMXN,
          autoRenew: true,
        },
      });
    } else {
      await prisma.license.update({
        where: { id: lic.id },
        data: { tier: a.tier, status: 'active', expiresAt, priceMXN: a.priceMXN },
      });
    }
  }

  console.log('');
  console.log(`✓ Seed N°40 completado · ${created} creadas · ${updated} actualizadas`);
  console.log('  Próximo: login Hub con cada user + GET /my/modules?refresh=true para sync snapshot');
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
