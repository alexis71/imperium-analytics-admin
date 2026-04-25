/**
 * Idempotente · upsert customers demo en Admin para parear con HubUsers.
 *
 * Uso:
 *   cd Desktop/Imperium_Analytics_Admin/server && node scripts/seed-demo-customers.js
 *
 * Output: archivo JSON `Desktop/_artifacts/admin-customers-by-email.json` con mapping
 *         email → customerId · consumido por relink-hubusers en Hub.
 *
 * Match key: `contactEmail` (no es @unique en schema, pero garantizamos uno por email
 *            via findFirst).
 */
const fs = require('fs');
const path = require('path');
const prisma = require('../src/db');

const DEMO_CUSTOMERS = [
  {
    contactEmail: 'alejandro.rodriguez@muselecom.com',
    legalName:    'Muselecom (interno)',
    contactName:  'Alejandro Rodriguez',
    notes:        'Cuenta interna · operación + soporte Muselecom',
    isTaxExempt:  true,
    status:       'active',
  },
  {
    contactEmail: 'dueno@kompaws.demo',
    legalName:    'Demo Veterinaria Kompaws · SA de CV',
    contactName:  'Dueño Demo Kompaws',
    notes:        'Tenant demo · Kompaws Herald · vinculado HubUser',
    status:       'active',
  },
  {
    contactEmail: 'dueno@multi.demo',
    legalName:    'Demo Multi-Vertical · SA de CV',
    contactName:  'Dueño Demo Multi',
    notes:        'Tenant demo · contrata KP + RT · vinculado HubUser',
    status:       'active',
  },
];

async function main() {
  const mapping = {};

  for (const c of DEMO_CUSTOMERS) {
    let existing = await prisma.customer.findFirst({
      where: { contactEmail: c.contactEmail },
    });

    if (existing) {
      console.log(`= existing  · ${c.contactEmail.padEnd(40)} → ${existing.id}`);
    } else {
      existing = await prisma.customer.create({ data: c });
      console.log(`+ created   · ${c.contactEmail.padEnd(40)} → ${existing.id}`);
    }

    mapping[c.contactEmail] = existing.id;
  }

  const outDir = path.resolve(__dirname, '../../../_artifacts');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'admin-customers-by-email.json');
  fs.writeFileSync(outPath, JSON.stringify(mapping, null, 2));

  console.log(`\n✓ Mapping escrito en ${outPath}`);
  console.log('   Siguiente: cd Desktop/Imperium_Analytics_Hub/server && node scripts/relink-hubusers-customers.js');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
