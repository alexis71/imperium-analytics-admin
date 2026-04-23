/**
 * Recovery codes: 8 códigos de 1 uso (formato xxxx-xxxx-xxxx).
 * Se muestran UNA vez al enrollar MFA. Se almacenan hasheados con bcrypt.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

function generateCodes(n = 8) {
  const codes = [];
  for (let i = 0; i < n; i++) {
    const raw = crypto.randomBytes(6).toString('hex'); // 12 hex chars
    const pretty = raw.slice(0, 4) + '-' + raw.slice(4, 8) + '-' + raw.slice(8, 12);
    codes.push(pretty);
  }
  return codes;
}

async function hashAll(codes) {
  return Promise.all(codes.map((c) => bcrypt.hash(c, 10)));
}

async function findMatch(code, hashedArray) {
  const normalized = String(code || '').trim().toLowerCase();
  if (!normalized) return -1;
  for (let i = 0; i < hashedArray.length; i++) {
    const h = hashedArray[i];
    if (h && (await bcrypt.compare(normalized, h))) return i;
  }
  return -1;
}

module.exports = { generateCodes, hashAll, findMatch };
