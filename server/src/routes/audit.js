const express = require('express');
const prisma = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();
router.use(auth('superadmin'));

// GET /audit-log — historial con filtros
router.get('/', async (req, res) => {
  const { action, entity, moduleCode, customerId, userId, from, to, limit = 100 } = req.query;
  const where = {};
  if (action)     where.action = { contains: action, mode: 'insensitive' };
  if (entity)     where.entity = entity;
  if (moduleCode) where.moduleCode = moduleCode;
  if (customerId) where.customerId = customerId;
  if (userId)     where.userId = userId;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to)   where.createdAt.lte = new Date(to);
  }

  const [rows, total, byAction] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit), 500),
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({ by: ['action'], _count: true, where, orderBy: { _count: { action: 'desc' } }, take: 10 }),
  ]);

  res.json({
    data: rows,
    meta: {
      total,
      returned: rows.length,
      topActions: byAction.map((a) => ({ action: a.action, count: a._count })),
    },
  });
});

// GET /audit-log/export.csv?from=YYYY-MM-DD&to=YYYY-MM-DD&moduleCode=X
// Stream CSV (no carga todo en memoria · cursor de Prisma).
// Compliance LFPDPPP: super-admin puede exportar audit trail filtrado.
// IMPORTANTE: declarado ANTES de /:id para no matchear "export.csv" como id.
router.get('/export.csv', async (req, res) => {
  const { action, entity, moduleCode, customerId, userId, from, to } = req.query;
  const where = {};
  if (action)     where.action = { contains: action, mode: 'insensitive' };
  if (entity)     where.entity = entity;
  if (moduleCode) where.moduleCode = moduleCode;
  if (customerId) where.customerId = customerId;
  if (userId)     where.userId = userId;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to)   where.createdAt.lte = new Date(to);
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  const fname = `audit-${new Date().toISOString().substring(0, 10)}.csv`;
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  res.write('﻿'); // BOM UTF-8 para Excel
  res.write('createdAt,action,entity,entityId,moduleCode,customerId,userEmail,ip,details\n');

  const PAGE = 500;
  let cursor = null;
  while (true) {
    const batch = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: { user: { select: { email: true } } },
    });
    if (batch.length === 0) break;

    for (const r of batch) {
      const cells = [
        r.createdAt.toISOString(),
        r.action || '',
        r.entity || '',
        r.entityId || '',
        r.moduleCode || '',
        r.customerId || '',
        r.user?.email || '',
        r.ip || '',
        // details: JSON stringified · escape comillas dobles para CSV
        JSON.stringify(r.details || {}).replace(/"/g, '""'),
      ].map((c) => {
        const s = String(c);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      });
      res.write(cells.join(',') + '\n');
    }

    if (batch.length < PAGE) break;
    cursor = batch[batch.length - 1].id;
  }

  res.end();
});

// GET /audit-log/:id
router.get('/:id', async (req, res) => {
  const r = await prisma.auditLog.findUnique({
    where: { id: req.params.id },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  if (!r) return res.status(404).json({ error: 'Audit log no existe' });
  res.json({ data: r });
});

module.exports = router;
