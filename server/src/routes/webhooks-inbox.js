const express = require('express');
const prisma = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();
router.use(auth('superadmin'));

// GET /webhooks/events — inbox con filtros
router.get('/events', async (req, res) => {
  const { moduleCode, event, verified, limit = 100 } = req.query;
  const where = {};
  if (moduleCode) where.moduleCode = moduleCode;
  if (event) where.event = event;
  if (verified !== undefined) where.verified = verified === 'true';

  const events = await prisma.webhookEvent.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: Math.min(Number(limit), 500),
    select: {
      id: true, moduleCode: true, event: true,
      verified: true, processedAt: true, error: true,
      createdAt: true, ip: true,
    },
  });
  res.json({ data: events });
});

// GET /webhooks/events/:id — payload completo
router.get('/events/:id', async (req, res) => {
  const e = await prisma.webhookEvent.findUnique({ where: { id: req.params.id } });
  if (!e) return res.status(404).json({ error: 'Event no existe' });
  res.json({ data: e });
});

module.exports = router;
