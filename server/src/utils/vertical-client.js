/**
 * Cliente HTTP hacia verticales (RT, NK, KP, ...).
 *
 * Dos modos de autorización:
 *  - PULL  (Admin → vertical): header `X-Imperium-Admin-Key` = sharedSecret del Module
 *  - PUSH  (Admin → vertical, comandos): body firmado HMAC, endpoint /webhooks/imperium-analytics-admin
 *
 * El sharedSecret vive cifrado AES-256-GCM en Module.sharedSecretCipher.
 */
const prisma = require('../db');
const { decrypt } = require('./encryption');
const { sign } = require('./imperium-signature');
const logger = require('./logger');

async function getModule(moduleCode) {
  const m = await prisma.module.findUnique({ where: { code: moduleCode } });
  if (!m) throw new Error(`Module ${moduleCode} no registrado`);
  if (m.status !== 'active') throw new Error(`Module ${moduleCode} en estado ${m.status}`);
  return m;
}

// ─────────────────────────────────────────────
// PULL · Admin consume endpoints del vertical
// ─────────────────────────────────────────────
async function pull(moduleCode, path, opts = {}) {
  const m = await getModule(moduleCode);
  const secret = decrypt(m.sharedSecretCipher);
  const url = m.apiEndpoint.replace(/\/$/, '') + path;

  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Imperium-Admin-Key': secret,
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const contentType = res.headers.get('Content-Type') || '';
  const data = contentType.includes('json') ? await res.json().catch(() => ({})) : await res.text();

  await prisma.module.update({
    where: { code: moduleCode },
    data: { lastSyncAt: new Date() },
  }).catch(() => {});

  if (!res.ok) {
    const msg = (typeof data === 'object' ? data.error : data) || `HTTP ${res.status}`;
    throw new Error(`${moduleCode} ${path}: ${msg}`);
  }
  return data;
}

// ─────────────────────────────────────────────
// PUSH · Admin envía comando firmado al vertical
// ─────────────────────────────────────────────
async function sendCommand(moduleCode, event, payload) {
  const m = await getModule(moduleCode);
  const secret = decrypt(m.sharedSecretCipher);
  const body = JSON.stringify({ event, payload, from: 'ia-admin', timestamp: new Date().toISOString() });
  const signature = sign(body, secret);

  const url = m.apiEndpoint.replace(/\/$/, '') + '/api/v1/webhooks/imperium-analytics-admin';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Imperium-Signature': signature,
      'X-Imperium-Module': 'ia-admin',
    },
    body,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.error('verticalClient.command.fail', { moduleCode, event, status: res.status, data });
    throw new Error(`Push ${moduleCode} ${event}: ${data.error || res.status}`);
  }
  return data;
}

// ─────────────────────────────────────────────
// Health check (public endpoint, sin auth)
// ─────────────────────────────────────────────
async function checkHealth(moduleCode) {
  const m = await getModule(moduleCode);
  try {
    const res = await fetch(m.apiEndpoint.replace(/\/$/, '') + '/api/v1/health');
    const data = await res.json();
    await prisma.module.update({
      where: { code: moduleCode },
      data: {
        lastHealthCheck: new Date(),
        lastHealthStatus: data.status || 'unknown',
        version: data.version || m.version,
      },
    });
    return data;
  } catch (err) {
    await prisma.module.update({
      where: { code: moduleCode },
      data: { lastHealthCheck: new Date(), lastHealthStatus: 'down' },
    });
    throw err;
  }
}

module.exports = { pull, sendCommand, checkHealth, getModule };
