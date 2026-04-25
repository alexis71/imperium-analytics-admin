/**
 * Singleton crypto helper · Imperium Analytics Admin
 * Wraps imperium-core/crypto-field con la key del env.
 * Uso: const crypto = require('./lib/crypto');  crypto.encrypt(pwd) · crypto.decrypt(ct)
 * Ver ADR 003 + 007 · OV-01 mitigación trigger 3 (encryption at rest).
 */
const { createCrypto } = require('imperium-core/crypto-field');

if (!process.env.PASSWORD_FIELD_KEY) {
  throw new Error('FATAL: PASSWORD_FIELD_KEY missing in .env · generar con: node -e "require(\'crypto\').randomBytes(32).toString(\'hex\')"');
}

module.exports = createCrypto(process.env.PASSWORD_FIELD_KEY);
