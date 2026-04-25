# Express.js Security Rules

**Source**: TikiTribe/claude-secure-coding-rules (MIT) · `rules/backend/express/CLAUDE.md`
**Prereq**: `owasp-2025.md` + `javascript.md`

Aplica solo a `/server/` (backends Express). Los `/client/` React siguen `react.md`.

---

## Security Middleware

### Rule · Helmet con config explícita
**Level**: `strict`

**Do**:
```javascript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],  // para accent vars CSS
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));
```

**Don't**: `helmet({ contentSecurityPolicy: false })` (estado actual en KP/Hub · arreglar).

---

### Rule · CORS restrictivo
**Level**: `strict` · **CWE**: 942

**Do**:
```javascript
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').filter(Boolean);
app.use(cors({
  origin: (origin, cb) => (!origin || allowedOrigins.includes(origin)) ? cb(null,true) : cb(new Error('CORS bloqueado')),
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE'],
}));
```

**Don't**: `app.use(cors())` · `origin: '*'` con `credentials: true`.

---

## Input Validation

### Rule · Validar request data
**Level**: `strict` · **CWE**: 20

**Do**:
```javascript
const { body, validationResult } = require('express-validator');

app.post('/users', [
  body('email').isEmail(),
  body('password').isLength({ min: 8, max: 128 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  // ...
});
```

**Don't**: destructurar `req.body` sin validación.

---

### Rule · Sanitizar output
**Level**: `strict` · **CWE**: 79

**Do**:
```javascript
const escape = require('escape-html');
res.send(`<h1>Welcome, ${escape(user.name)}</h1>`);
// O usa React/template engine con auto-escape
```

**Don't**: interpolar user input directo en HTML response.

---

## Authentication

### Rule · Session/JWT seguro
**Level**: `strict` · **CWE**: 384

**Do**:
```javascript
// JWT con secret ≥32 bytes, rotable
const JWT_SECRET = process.env.JWT_SECRET;  // nunca hardcoded
jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });

// Refresh token en BD (revocable)
await prisma.refreshToken.create({ data: { token, userId, expiresAt } });
```

**Don't**: `JWT_SECRET='dev'` · tokens eternos sin refresh.

---

### Rule · Rate limiting
**Level**: `warning` · **CWE**: 307

**Do**:
```javascript
// Global
app.use('/api/', rateLimit({ windowMs: 15*60*1000, max: 300 }));

// Auth endpoint específico (más restrictivo)
const loginLimiter = rateLimit({ windowMs: 15*60*1000, max: 5, message: 'Too many attempts' });
app.post('/login', loginLimiter, async (req, res) => {...});
```

**Don't**: login sin rate limit (brute force).

---

## Database Security

### Rule · Prisma protege por default
**Level**: `strict` · **CWE**: 89

**Do** (Prisma ORM):
```javascript
const user = await prisma.user.findFirst({ where: { email } });                  // safe
const user = await prisma.user.findMany({ where: { email: { contains: q } } });  // safe
```

**Raw query · solo si necesario**:
```javascript
await prisma.$queryRaw`SELECT * FROM users WHERE email = ${email}`;  // tagged template = parametrized
```

**Don't**:
```javascript
await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE email = '${email}'`);  // SQL inj
```

---

## File Handling

### Rule · Uploads seguros
**Level**: `strict` · **CWE**: 434

**Do**:
```javascript
const multer = require('multer');
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    const uniqueName = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, uniqueName + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5*1024*1024 },  // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg','.jpeg','.png','.pdf'];
    allowed.includes(path.extname(file.originalname).toLowerCase()) ? cb(null,true) : cb(new Error('Invalid type'));
  },
});
```

**Don't**: conservar `req.file.originalname` como path · permitir cualquier extensión.

---

## Error Handling

### Rule · Error handler secure
**Level**: `warning` · **CWE**: 209

**Do**:
```javascript
app.use((err, req, res, next) => {
  logger.error({ msg: err.message, stack: err.stack, path: req.path });
  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({ error: 'Internal server error' });
  } else {
    res.status(500).json({ error: err.message });
  }
});
```

**Don't**: `res.status(500).json({ stack: err.stack })` en prod.

---

## Quick Reference

| Rule | Level | CWE |
|------|-------|-----|
| Helmet + CSP | strict | — |
| CORS whitelist | strict | CWE-942 |
| Input validation | strict | CWE-20 |
| Output sanitization | strict | CWE-79 |
| JWT/Session secure | strict | CWE-384 |
| Rate limiting | warning | CWE-307 |
| Parametrized queries | strict | CWE-89 |
| File uploads seguros | strict | CWE-434 |
| Error handling | warning | CWE-209 |
