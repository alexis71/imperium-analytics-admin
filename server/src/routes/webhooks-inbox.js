const express = require('express');
const prisma = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();
router.use(auth('superadmin'));

// GET /webhooks/events — inbox con filtros
router.get('/events', async (req, res) => {
  const { moduleCode, event, verified, from, to, limit = 100 } = req.query;
  const where = {};
  if (moduleCode) where.moduleCode = moduleCode;
  if (event) where.event = { contains: event, mode: 'insensitive' };
  if (verified !== undefined && verified !== '') where.verified = verified === 'true';
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }

  const [events, total, byModule] = await Promise.all([
    prisma.webhookEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit), 500),
      select: {
        id: true, moduleCode: true, event: true,
        verified: true, processedAt: true, error: true,
        createdAt: true, ip: true,
      },
    }),
    prisma.webhookEvent.count({ where }),
    prisma.webhookEvent.groupBy({ by: ['moduleCode'], _count: true, where }),
  ]);
  res.json({
    data: events,
    meta: {
      total,
      returned: events.length,
      byModule: Object.fromEntries(byModule.map((m) => [m.moduleCode, m._count])),
    },
  });
});

// GET /webhooks/events/:id — payload completo
router.get('/events/:id', async (req, res) => {
  const e = await prisma.webhookEvent.findUnique({ where: { id: req.params.id } });
  if (!e) return res.status(404).json({ error: 'Event no existe' });
  res.json({ data: e });
});

module.exports = router;
