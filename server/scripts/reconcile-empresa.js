#!/usr/bin/env node
/**
 * Reconcilia una empresa creada de forma desconectada en uno o más verticales.
 *
 * Caso de uso: el super-admin de cada vertical creó "Empresa Demo" por separado.
 * Este script:
 *   1. Pulla la lista de tenants de cada Module activo en Admin
 *   2. Busca matches por slug, contactEmail, o nombre exacto
 *   3. Crea Customer en Admin (si no existe)
 *   4. Crea CustomerModule + License linkeando cada tenant al Customer
 *   5. Imprime instrucciones para provisionar HubUser
 *
 * Uso:
 *   node scripts/reconcile-empresa.js --name "Empresa Demo" --email demo1@local.com
 *   node scripts/reconcile-empresa.js --name "Empresa Demo" --email demo1@local.com --slug demo1
 *   node scripts/reconcile-empresa.js --name "Empresa Demo" --email demo1@local.com --tier herald --price 449
 *
 * Flags:
 *   --name       (requerido) razón social
 *   --email      (requerido) email de contacto / matching
 *   --slug       (opcional)  slug específico del tenant a buscar (default: derivar de email)
 *   --tier       (opcional)  tier para licencias (default: trial)
 *   --price      (opcional)  precio MXN/mes (default: 0)
 *   --days       (opcional)  duración licencia en días (default: 365)
 *   --dry-run    (opcional)  no escribe · solo reporta qué haría
 */
require('dotenv').config();
const crypto = require('crypto');
const prisma = require('../src/db');
const { pull } = require('../src/utils/vertical-client');

const flags = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) {
    const key = a.slice(2);
    const next = process.argv[i + 1];
    flags[key] = !next || next.startsWith('--') ? true : next;
  }
}

const DRY = !!flags['dry-run'];

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function findOrCreateCustomer({ legalName, contactEmail }) {
  const existing = await prisma.customer.findFirst({
    where: { OR: [{ contactEmail }, { legalName }] },
  });
  if (existing) {
    console.log(`  ✓ Customer existente: ${existing.legalName} (${existing.id.slice(0, 8)}…)`);
    return existing;
  }
  if (DRY) {
    console.log(`  [dry-run] crearía Customer: ${legalName} / ${contactEmail}`);
    return { id: '<dry-run>', legalName, contactEmail };
  }
  const c = await prisma.customer.create({
    data: { legalName, contactEmail, status: 'active' },
  });
  console.log(`  ✓ Customer CREADO: ${c.legalName} (${c.id.slice(0, 8)}…)`);
  return c;
}

async function ensureCustomerModule({ customerId, moduleCode, tenantId, tenantSlug, tier, priceMXN, days }) {
  const existing = await prisma.customerModule.findFirst({
    where: { customerId, moduleCode },
  });
  if (existing) {
    if (existing.tenantIdInModule === tenantId) {
      console.log(`    ✓ CustomerModule ya vinculado a ese tenant · skip`);
      return existing;
    }
    console.log(`    ⚠️  CustomerModule existe pero apunta a tenant DIFERENTE (${existing.tenantIdInModule.slice(0, 8)}…). Saltando para no romper.`);
    return existing;
  }
  if (DRY) {
    console.log(`    [dry-run] crearía CustomerModule + License (tier=${tier}, price=${priceMXN}, days=${days})`);
    return { id: '<dry-run>' };
  }
  const cm = await prisma.customerModule.create({
    data: {
      customerId,
      moduleCode,
      tenantIdInModule: tenantId,
      tenantSlug,
      status: 'active',
    },
  });
  await prisma.license.create({
    data: {
      customerModuleId: cm.id,
      tier,
      key: `${moduleCode.toUpperCase()}-${tier.toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      priceMXN,
      activatedAt: new Date(),
      expiresAt: new Date(Date.now() + days * 86400 * 1000),
      status: 'active',
    },
  });
  console.log(`    ✓ CustomerModule + License creados`);
  return cm;
}

async function findTenantInVertical(moduleCode, { slug, email, name }) {
  try {
    const remote = await pull(moduleCode, '/api/v1/admin/tenants');
    const tenants = remote.data || [];
    const candidates = tenants.filter((t) =>
      (slug && t.slug === slug) ||
      (email && (t.contactEmail === email || t.email === email)) ||
      (name && t.name === name)
    );
    return candidates[0] || null;
  } catch (err) {
    console.log(`    ⚠️  Pull a ${moduleCode} falló: ${err.message}`);
    return null;
  }
}

async function main() {
  const legalName = flags.name;
  const contactEmail = flags.email;
  const slugHint = flags.slug || slugify(contactEmail.split('@')[0] || '');
  const tier = flags.tier || 'trial';
  const priceMXN = Number(flags.price || 0);
  const days = Number(flags.days || 365);

  if (!legalName || !contactEmail) {
    console.error('Uso: node scripts/reconcile-empresa.js --name "X" --email y@z.com [--slug s] [--tier t] [--price N] [--days N] [--dry-run]');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Reconciliando empresa: ${legalName}`);
  console.log(`  Email contacto:        ${contactEmail}`);
  console.log(`  Slug hint:             ${slugHint}`);
  console.log(`  Tier:                  ${tier} ($${priceMXN} MXN, ${days}d)`);
  console.log(`  Modo:                  ${DRY ? 'DRY RUN' : 'EJECUCIÓN REAL'}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  const customer = await findOrCreateCustomer({ legalName, contactEmail });

  const modules = await prisma.module.findMany({ where: { status: 'active' } });
  console.log(`\n📡 Módulos registrados en Admin: ${modules.map((m) => m.code).join(', ')}\n`);

  let foundCount = 0;
  for (const m of modules) {
    if (m.code === 'iahb') continue; // Hub no es vertical comercial · es agregador
    console.log(`── Módulo ${m.code} (${m.name || ''}) ──`);
    const tenant = await findTenantInVertical(m.code, { slug: slugHint, email: contactEmail, name: legalName });
    if (!tenant) {
      console.log(`    (sin match · empresa no encontrada en este vertical)`);
      continue;
    }
    console.log(`    ✓ Tenant encontrado: "${tenant.name}" (${tenant.id.slice(0, 8)}…) slug=${tenant.slug}`);
    foundCount++;
    if (customer.id !== '<dry-run>') {
      await ensureCustomerModule({
        customerId: customer.id,
        moduleCode: m.code,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        tier,
        priceMXN,
        days,
      });
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Reconciliación: ${foundCount} verticales vinculados`);
  console.log('═══════════════════════════════════════════════════════════');
  if (foundCount > 0 && !DRY) {
    console.log('');
    console.log('  PRÓXIMO PASO · provisionar HubUser para que este cliente');
    console.log('  pueda hacer login en el Hub y ver sus módulos:');
    console.log('');
    console.log(`  cd Desktop/Imperium_Analytics_Hub/server`);
    console.log(`  node scripts/provision-hub-user.js \\`);
    console.log(`    --email ${contactEmail} \\`);
    console.log(`    --name "Owner ${legalName}" \\`);
    console.log(`    --customer-id ${customer.id}`);
    console.log('');
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
