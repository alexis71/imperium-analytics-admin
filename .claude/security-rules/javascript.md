# JavaScript Security Rules

**Source**: TikiTribe/claude-secure-coding-rules (MIT) · `rules/languages/javascript/CLAUDE.md`
**Prereq**: `owasp-2025.md` (core web security)

---

## Code Execution

### Rule · No `eval()` con user input
**Level**: `strict` · **CWE**: 94, 95

**Do**:
```javascript
const data = JSON.parse(userInput);                          // parse JSON, no eval
const handlers = new Map([['a', handleA], ['b', handleB]]);  // dynamic dispatch
const handler = handlers.get(actionName);
```

**Don't**:
```javascript
eval(userInput);                // RCE
new Function(userInput)();      // RCE
setTimeout(userCode, 1000);     // string → eval
```

**Why**: `eval()` ejecuta JS arbitrario · compromiso total.

---

### Rule · Evitar Prototype Pollution
**Level**: `strict` · **CWE**: 1321

**Do**:
```javascript
const safeDict = Object.create(null);
function safeSet(obj, key, value) {
  if (['__proto__','constructor','prototype'].includes(key)) throw new Error('Invalid key');
  obj[key] = value;
}
const userPrefs = new Map();  // para keys user-controlled
```

**Don't**:
```javascript
function merge(target, source) {
  for (const key in source) target[key] = source[key];  // puede setear __proto__
}
obj[userKey] = userValue;  // user-controlled key
```

**Refs**: CWE-1321, CVE-2019-10744 (lodash)

---

## DOM Security

### Rule · Sanitizar HTML antes de insertar
**Level**: `strict` · **CWE**: 79

**Do**:
```javascript
import DOMPurify from 'dompurify';
element.innerHTML = DOMPurify.sanitize(userHtml);
element.textContent = userInput;  // plain text
```

**Don't**:
```javascript
element.innerHTML = userInput;                        // XSS
document.write(userInput);                            // XSS
element.innerHTML = `<div>${userInput}</div>`;        // XSS
```

---

### Rule · Validar URLs antes de usar
**Level**: `strict` · **CWE**: 601

**Do**:
```javascript
function isValidUrl(s) {
  try { const u = new URL(s); return ['http:','https:'].includes(u.protocol); }
  catch { return false; }
}
if (isValidUrl(redirectUrl) && isSameDomain(redirectUrl)) window.location.href = redirectUrl;
```

**Don't**: asignar `href = userUrl` directo · `javascript:` URLs ejecutan código.

---

## Server-Side (Node.js)

### Rule · Prevenir Command Injection
**Level**: `strict` · **CWE**: 78

**Do**:
```javascript
const { execFile } = require('child_process');
execFile('grep', [pattern, filename], (err, stdout) => {});
```

**Don't**:
```javascript
exec(`grep ${userPattern} ${userFile}`);  // shell metacharacters (;, |, &&) = RCE
```

---

### Rule · Validar file paths
**Level**: `strict` · **CWE**: 22

**Do**:
```javascript
const SAFE_DIR = '/app/uploads';
const resolved = path.resolve(SAFE_DIR, filename);
if (!resolved.startsWith(SAFE_DIR + path.sep)) throw new Error('Path traversal');
fs.readFileSync(resolved);
```

**Don't**:
```javascript
fs.readFileSync(`./uploads/${userFilename}`);  // `../../etc/passwd`
```

---

### Rule · Dependencias seguras
**Level**: `warning` · **CWE**: 1104

**Do**:
```bash
npm audit
npm ci                  # lockfile
npm install pkg@1.2.3   # versión exacta
```

```json
{"dependencies":{"express":"4.18.2"}}
```

**Don't**: `"express":"*"` · `"lodash":"^4.0.0"` sin revisión.

---

## Cryptography

### Rule · Crypto module correcto
**Level**: `strict` · **CWE**: 330, 328

**Do**:
```javascript
const crypto = require('crypto');
const token = crypto.randomBytes(32).toString('hex');
const id = crypto.randomUUID();
const hash = await bcrypt.hash(password, 12);
```

**Don't**:
```javascript
const token = Math.random().toString(36);                 // predecible
const hash = crypto.createHash('md5').update(pwd).digest; // MD5 para pwd = roto
```

---

## HTTP Security

### Rule · Security Headers (Helmet)
**Level**: `warning`

**Do**:
```javascript
const helmet = require('helmet');
app.use(helmet());  // default covers most headers

// O granular:
app.use(helmet({
  contentSecurityPolicy: { directives: { defaultSrc: ["'self'"] } },
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));
```

**Don't**: levantar Express sin helmet · `contentSecurityPolicy: false` salvo override documentado.

---

### Rule · CORS restrictivo
**Level**: `strict` · **CWE**: 942

**Do**:
```javascript
const allowed = new Set(['https://myapp.com']);
app.use(cors({
  origin: (origin, cb) => (!origin || allowed.has(origin)) ? cb(null,true) : cb(new Error('blocked')),
  credentials: true,
}));
```

**Don't**: `cors({origin:'*', credentials:true})` · `cors({origin:true})`.

---

## Quick Reference

| Rule | Level | CWE |
|------|-------|-----|
| No eval() | strict | CWE-94 |
| Prototype pollution | strict | CWE-1321 |
| Sanitize HTML | strict | CWE-79 |
| Validate URLs | strict | CWE-601 |
| Command injection | strict | CWE-78 |
| Path traversal | strict | CWE-22 |
| Secure dependencies | warning | CWE-1104 |
| Crypto randomness | strict | CWE-330 |
| Security headers | warning | — |
| CORS configuration | strict | CWE-942 |
