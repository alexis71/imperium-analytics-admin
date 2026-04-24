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
