const { PrismaClient } = require('@prisma/client');
const { attachCryptoMiddleware } = require('imperium-core/prisma-middleware');
const crypto = require('./lib/crypto');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['warn', 'error'],
});

// OV-01 mitigation · auto-encrypt currentPassword en writes (ver ADR 003 + 007)
attachCryptoMiddleware(prisma, crypto, {
  models: ['User'],
  fields: ['currentPassword'],
});

module.exports = prisma;
