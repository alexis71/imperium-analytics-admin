/**
 * HMAC-SHA256 para webhooks Imperium (compatible con RT/NK).
 * Portado de RoundTable_v1/server/src/utils/imperium-signature.js
 *
 * sign(rawBody, secret)                 → hex
 * verify(rawBody, signature, secret)    → boolean
 */
const crypto = require('crypto');

function sign(rawBody, secret) {
  if (!secret) throw new Error('sign: secret requerido');
  const bytes = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''), 'utf8');
  return crypto.createHmac('sha256', secret).update(bytes).digest('hex');
}

function verify(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  try {
    const expected = sign(rawBody, secret);
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(String(signature).trim(), 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

module.exports = { sign, verify };
