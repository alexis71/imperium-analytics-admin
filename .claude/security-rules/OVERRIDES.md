# OVERRIDES · Excepciones justificadas a las reglas baseline

Este archivo declara **excepciones deliberadas** a las reglas de `owasp-2025.md`, `javascript.md`, `express.md`, `react.md`.

**Principio**: cada override debe tener justificación de negocio + mitigaciones técnicas + referencia a memoria + criterio de expiración.

Cualquier Claude Code que genere código nuevo **debe respetar estos overrides** · no refactorizar automáticamente lo que aquí se documenta.

---

## OV-01 · `currentPassword` visible scoped super_admin (CWE-256)

- **Regla baseline**: OWASP A04 Cryptographic Failures · strict · CWE-256 prohibe storage plaintext de passwords
- **Override**: campo `User.currentPassword` (String nullable) · **cifrado AES-256-GCM en reposo** (desde 2026-04-24) · visible para super_admin via decrypt transparente
- **Scope del override**: aplica a modelos `User` en los 4 verticales (KP, RT, NK, Hub) + `HubUser` en Hub (Admin NO tiene este campo · usa MFA)

### ⚠️ BANNER · DECISIÓN PERMANENTE CONDICIONADA

Esta decisión es **permanente** mientras los 3 triggers de expiry no se cumplan a la vez (ver abajo). **NO es una medida temporal de dev.** Cualquier refactor que quite `currentPassword` sin cerrar los 3 triggers **rompe el modelo de soporte Muselecom** · diferenciador comercial.

### Justificación de negocio (Muselecom)
- Muselecom da soporte directo por teléfono a clientes
- Cuando un cliente olvida su password y llama, super-admin abre `/empresas/<tenantId>` y ve el password actual (descifrado por middleware) en pantalla
- Flujo alternativo (reset-link por email) falla ~30-40% casos · cliente sin acceso a email

### Mitigaciones técnicas activas (post 2026-04-24)
1. ✅ **Encryption at rest AES-256-GCM** · ciphertext en DB `iv:tag:ct` · key en `.env PASSWORD_FIELD_KEY`
2. ✅ **Middleware Prisma transparente** · encrypt al write · decrypt al read · idempotente
3. ✅ `currentPassword` NUNCA se retorna en APIs públicas · solo `/admin/*` con `auth('super_admin')`
4. ✅ `passwordHash` (bcrypt rounds 12) es fuente de verdad para autenticación
5. ✅ CORS + rate limiting + CSP en `/admin/*`
6. ✅ Key distinta por vertical (5 keys · aislamiento blast radius)

### Triggers de expiry · cuándo cerrar el override

| # | Trigger | Estado | Notas |
|---|---|---|---|
| 1 | Self-service reset completo en Hub (Fase D.3+) con SMS/CAPTCHA · cobertura ≥95% | 🔴 Pendiente | Fase D.3 del roadmap Hub |
| 2 | Audit log sistemático de lectura `currentPassword` (tabla `PasswordAccessLog` + calls en routes) | ✅ **Cerrado 2026-04-24** | Calls activos en KP+RT (`admin.tenant.detail` + `empresa.users.list`) · helper `auditPasswordAccess()` desde imperium-core/audit |
| 3 | Encryption at rest del campo | ✅ **Cerrado 2026-04-24** | AES-256-GCM field-level · ver ADR 007 |

**Cuando los 3 triggers se cumplan a la vez**, cerrar OV-01 totalmente · eliminar `currentPassword` del schema · migrar a self-service reset puro.

### Archivos clave
- `imperium-core/src/crypto-field.js` · helper AES-256-GCM
- `imperium-core/src/prisma-crypto-middleware.js` · auto encrypt/decrypt
- `imperium-core/src/audit-password-access.js` · helper audit log
- `<vertical>/server/src/lib/crypto.js` · singleton por vertical
- `<vertical>/server/src/db.js` · registra middleware
- `<vertical>/.env` · `PASSWORD_FIELD_KEY=<hex 32 bytes>`
- `_archive/Accounts_pre_crypto_2026-04-24/PASSWORD_FIELD_KEYS.txt` · backup temporal (borrar post copy a password manager)

### Referencias
- [ADR 003](../00-DOCS-MAESTRAS/ADRS/003-currentpassword-visible-superadmin.md) · decisión original + TL;DR
- [ADR 007](../00-DOCS-MAESTRAS/ADRS/007-pwd-mitigations-implementation.md) · implementación 2026-04-24
- `memory/feedback_passwords_siempre_visibles.md`
- `memory/feedback_security_rules_overrides.md`

---

## OV-02 · `localStorage` para JWT en client (CWE-922)

- **Regla baseline**: React rule "No sensitive client state" · strict · recomendación httpOnly cookies
- **Override**: JWT access token vive en `localStorage` · refresh token también
- **Scope**: los 5 clients React (KP, RT, NK, Admin, Hub)
- **Justificación de negocio**:
  - Dev velocity · httpOnly cookies requieren CSRF tokens + same-site + backend cookie setup
  - Arquitectura actual: verticales + Admin + Hub en distintos puertos/subdominios · cookies cross-subdomain requieren trabajo extra
  - JWT Bearer tokens son CSRF-resistentes por naturaleza
- **Mitigaciones activas**:
  1. Access tokens expiran en 15min · mitiga ventana de abuso post-XSS
  2. Refresh tokens revocables en BD (tabla `RefreshToken`)
  3. CSP baseline (cuando se active) limita surface de XSS
- **Mitigaciones futuras pendientes**:
  - [ ] Activar CSP estricta en helmet (hoy `contentSecurityPolicy: false` en KP/Hub)
  - [ ] Evaluar migración a httpOnly cookies cuando todos los programas estén bajo un domain unificado (`*.muselecom.com` con reverse proxy)
- **Criterio de expiración**: revisar cuando se despliegue reverse proxy y subdomain unificado · Fase E.3 o posterior.

---

## OV-03 · Helmet CSP desactivado temporalmente en KP + Hub · **CERRADO 2026-04-24**

- **Regla baseline**: Express rule "Helmet con config explícita" · strict · `helmet({ contentSecurityPolicy: {...} })`
- **Estado**: ✅ **RESUELTO** · CSP activa en KP y Hub con directivas conservadoras
- **Fix aplicado** (2026-04-24 · Opción A quick win):
  ```javascript
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));
  ```
- **Verificación**: `curl -I http://localhost:3006/api/v1/health` + `http://localhost:3020/api/v1/health` emiten header `Content-Security-Policy` correcto · también `Referrer-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`.
- **Archivos modificados**: `Kompaws/server/src/index.js:17-31` · `Imperium_Analytics_Hub/server/src/index.js:17-31`

---

## OV-04 · SQLite en dev (Kompaws + NetKnight)

- **Regla baseline**: OWASP A02 · secure defaults · idealmente encryption at rest
- **Override**: KP y NK usan SQLite sin cifrado en desarrollo
- **Scope**: dev únicamente · prod será PostgreSQL
- **Justificación**: dev velocity · SQLite zero-config · PostgreSQL requiere servicio corriendo
- **Mitigaciones**: archivos `dev.db` en `.gitignore` · nunca committeados · datos demo no sensibles
- **Criterio de expiración**: al deployar prod, migración obligatoria a PostgreSQL con TDE habilitado.

---

## Cómo agregar un nuevo override

1. Copiar el template de arriba (ID único `OV-NN`)
2. Justificación clara de negocio (no solo "dev convenience")
3. Mitigaciones activas Y futuras
4. Criterio de expiración explícito (cuándo se revisa)
5. Memoria ref si existe
6. Commit con mensaje `security: document override OV-NN · <topic>`

---

## Cómo cerrar un override

Cuando las condiciones de expiración se cumplen:
1. Implementar el fix definitivo (ej: encryption at rest · MFA verticales)
2. Borrar la sección del override aquí
3. Commit con mensaje `security: close override OV-NN · <resolution>`

---

**Última actualización**: 2026-04-24 · sesión N°10 (security rules adoption)
