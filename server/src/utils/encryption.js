/**
 * AES-256-GCM para cifrado at-rest de secretos sensibles:
 *  - User.mfaSecretCipher
 *  - Module.sharedSecretCipher
 *  - Module.apiTokenCipher
 *
 * Formato almacenado: iv.hex + ':' + authTag.hex + ':' + ciphertext.hex
 * Key: 32 bytes hex desde env APP_ENCRYPTION_KEY
 *
 * CRÍTICO: rotar la APP_ENCRYPTION_KEY implica recifrar todos los secretos.
 *          respaldar el valor actual en 1Password antes de rotar.
 */
const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const KEY_HEX = process.env.APP_ENCRYPTION_KEY || '';

function getKey() {
  if (!KEY_HEX || KEY_HEX.length !== 64) {
    throw new Error('APP_ENCRYPTION_KEY debe ser 32 bytes hex (64 chars)');
  }
  return Buffer.from(KEY_HEX, 'hex');
}

function encrypt(plaintext) {
  if (plaintext == null) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + ct.toString('hex');
}

function decrypt(packed) {
  if (!packed) return null;
  const [ivHex, tagHex, ctHex] = packed.split(':');
  if (!ivHex || !tagHex || !ctHex) throw new Error('Formato cifrado inválido');
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()]);
  return pt.toString('utf8');
}

module.exports = { encrypt, decrypt };
