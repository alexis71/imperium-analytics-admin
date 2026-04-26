/**
 * Idempotente · upsert CustomerModule + License para HubUsers demo.
 *
 * Por qué: Hub Dashboard llama /my/modules?refresh=true que pulla CustomerModule
 * desde Admin · sin entries el dashboard muestra "0 verticales activos".
 *
 * Mapping (data demo · prod usaría Admin UI Customers):
 *   dueno@kompaws.demo (1f5f48eb)  → KP (Kompaws Demo · herald)
 *   dueno@multi.demo   (8bb2a2e7)  → KP + RT (multi-vertical · herald)
 *
 * Tenant IDs validados en KP/RT prisma · ver scripts query.
 */
require('dotenv').config();
const crypto = require('crypto');
const prisma = require('../src/db');

const KP_TENANT_ID = '2b15d850-4450-49d8-ac84-c2c21a7e9a70';
const KP_TENANT_SLUG = 'kompaws-demo';
const RT_TENANT_ID = 'ffc9fedd-b03e-467e-a8af-76cbf243098c';
const RT_TENANT_SLUG = 'muselecom-demo';

const MAPPING = [
  {
    customerId: '1f5f48eb-88db-4ace-8e29-7bc9b73ed32d',
    contactEmail: 'dueno@kompaws.demo',
    modules: [
      { moduleCode: 'kp', tenantIdInModule: KP_TENANT_ID, tenantSlug: KP_TENANT_SLUG, tier: 'herald', priceMXN: 449 },
    ],
  },
  {
    customerId: '8bb2a2e7-0ef4-4f14-9a8e-7f1fdd8df355',
    contactEmail: 'dueno@multi.demo',
    modules: [
      { moduleCode: 'kp', tenantIdInModule: KP_TENANT_ID, tenantSlug: KP_TENANT_SLUG, tier: 'herald', priceMXN: 449 },
      { moduleCode: 'rt', tenantIdInModule: RT_TENANT_ID, tenantSlug: RT_TENANT_SLUG, tier: 'herald', priceMXN: 399 },
    ],
  },
];

async function main() {
  for (const entry of MAPPING) {
    for (const mod of entry.modules) {
      const existing = await prisma.customerModule.findFirst({
        where: { customerId: entry.customerId, moduleCode: mod.moduleCode },
      });
      let cm;
      if (existing) {
        cm = await prisma.customerModule.update({
          where: { id: existing.id },
          data: {
            tenantIdInModule: mod.tenantIdInModule,
            tenantSlug: mod.tenantSlug,
            status: 'active',
          },
        });
        console.log(`▶ CustomerModule actualizado · ${entry.contactEmail} → ${mod.moduleCode}`);
      } else {
        cm = await prisma.customerModule.create({
          data: {
            customerId: entry.customerId,
            moduleCode: mod.moduleCode,
            tenantIdInModule: mod.tenantIdInModule,
            tenantSlug: mod.tenantSlug,
            status: 'active',
          },
        });
        console.log(`▶ CustomerModule creado · ${entry.contactEmail} → ${mod.moduleCode}`);
      }

      const lic = await prisma.license.findFirst({ where: { customerModuleId: cm.id } });
      const expiresAt = new Date(Date.now() + 365 * 86400 * 1000);
      if (!lic) {
        await prisma.license.create({
          data: {
            customerModuleId: cm.id,
            tier: mod.tier,
            key: `${mod.moduleCode.toUpperCase()}-DEMO-${crypto.randomBytes(8).toString('hex').toUpperCase()}`,
            status: 'active',
            expiresAt,
            priceMXN: mod.priceMXN,
            autoRenew: true,
          },
        });
        console.log(`  + License ${mod.tier} · $${mod.priceMXN}/mes`);
      } else {
        await prisma.license.update({
          where: { id: lic.id },
          data: { tier: mod.tier, status: 'active', expiresAt, priceMXN: mod.priceMXN },
        });
        console.log(`  ↻ License existente actualizada · ${mod.tier}`);
      }
    }
  }
  await prisma.$disconnect();
  console.log('\n✓ Seed completado · refresh Hub dashboard para ver verticales');
}

main().catch((e) => { console.error(e); process.exit(1); });
