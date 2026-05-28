/**
 * Billing proxy · Admin → Hub (N°80 Fase C2).
 *
 * Hub es dueño de PaymentEvents (reconciliation worker B2). Admin necesita:
 *   1. Disparar reconcile manual desde /invoices/:id ("buscar pago en webhooks")
 *   2. Ver PaymentEvents de un customer para entender qué llegó vía MP/Stripe
 *
 * Auth Admin-side: super_admin JWT (auth middleware). Auth Hub-side: service-key
 * X-Imperium-Admin-Key = IMPERIUM_HUB_SERVICE_KEY (= IMPERIUM_WEBHOOK_SECRET de Hub).
 */
const express = require('express');
const { auth } = require('../middleware/auth');

const router = express.Router();
router.use(auth('superadmin'));

const HUB_URL = process.env.IMPERIUM_HUB_URL || 'http://localhost:3020';
const HUB_KEY = process.env.IMPERIUM_HUB_SERVICE_KEY || '';

async function callHub(path, options = {}) {
  if (!HUB_KEY) throw new Error('IMPERIUM_HUB_SERVICE_KEY no configurado en Admin .env');
  const res = await fetch(`${HUB_URL}/api/v1${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-Imperium-Admin-Key': HUB_KEY, ...options.headers },
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let body; try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 200) }; }
  if (!res.ok) throw new Error(body.error || `Hub retornó ${res.status}`);
  return body;
}

// POST /api/v1/billing-proxy/reconcile · fuerza reconcileAll en Hub
router.post('/reconcile', async (req, res) => {
  try {
    const result = await callHub('/billing/reconcile', { method: 'POST' });
    res.json({ data: result.data });
  } catch (err) {
    res.status(502).json({ error: 'Hub reconcile falló: ' + err.message });
  }
});

// GET /api/v1/billing-proxy/customer-webhooks/:customerId · lista PaymentEvents del customer
router.get('/customer-webhooks/:customerId', async (req, res) => {
  try {
    const result = await callHub(`/billing/events-for-customer/${req.params.customerId}`);
    res.json({ data: result.data });
  } catch (err) {
    res.status(502).json({ error: 'Hub events fetch falló: ' + err.message });
  }
});

module.exports = router;
