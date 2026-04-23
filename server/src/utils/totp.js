/**
 * TOTP wrapper · Google Authenticator / Authy compatible
 */
const { authenticator } = require('otplib');
const QRCode = require('qrcode');

authenticator.options = {
  window: Number(process.env.MFA_WINDOW || 1),
  digits: 6,
  step: 30,
};

function newSecret() {
  return authenticator.generateSecret();
}

function verifyCode(secret, code) {
  try {
    return authenticator.verify({ token: String(code || '').replace(/\s/g, ''), secret });
  } catch {
    return false;
  }
}

async function qrDataUrl(secret, label, issuer) {
  const otpauth = authenticator.keyuri(
    label,
    issuer || process.env.MFA_ISSUER || 'Imperium Analytics Admin',
    secret
  );
  return QRCode.toDataURL(otpauth, { margin: 1, width: 256 });
}

module.exports = { newSecret, verifyCode, qrDataUrl };
