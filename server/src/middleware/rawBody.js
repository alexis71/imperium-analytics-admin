/**
 * Captura el raw body ANTES de que express.json lo parse.
 * Necesario SOLO para /webhooks/ingest para verificar HMAC.
 */
module.exports = function rawBody(req, res, next) {
  let data = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => (data += chunk));
  req.on('end', () => {
    req.rawBody = data;
    try { req.body = data ? JSON.parse(data) : {}; }
    catch { req.body = {}; }
    next();
  });
};
