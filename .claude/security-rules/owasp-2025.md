# OWASP Top 10 2025 · Core Security Rules

**Source**: TikiTribe/claude-secure-coding-rules (MIT) · `rules/_core/owasp-2025.md`
**Adapted for**: Imperium Analytics stack (Node.js + Express + React + Prisma)
**Examples**: originalmente en Python · aplican igual a cualquier stack · Claude Code adapta por contexto.

---

## Overview

**Standard**: OWASP Top 10:2025 (Release Candidate · November 2025)
**Scope**: Web application security risks · 589 CWEs across 248 categories.

---

## A01:2025 · Broken Access Control

**Level**: `strict` · **CWEs**: 284, 862, 863, 918

**Do**:
- Validar permisos/ownership server-side en cada endpoint protegido
- Usar middleware `auth(...)` + `PermissionGuard need="x.y"` (roles data-driven)
- SSRF prevention: allowlist de hostnames · bloquear private/loopback IPs

**Don't**:
- Confiar en checks del cliente (React hide/show es UX · no seguridad)
- Fetchear URLs user-supplied sin validar scheme + host

**Refs**: OWASP A01:2025 · NIST SSDF PW.1.1

---

## A02:2025 · Security Misconfiguration

**Level**: `strict` · **CWEs**: 16, 209

**Do**:
- Cookies con `HttpOnly` + `Secure` + `SameSite=Lax/Strict`
- Session lifetime máximo 30min idle · refresh tokens en BD
- Error handler genérico en prod · no exponer stack traces

**Don't**:
- `DEBUG=true` en prod · `SECRET_KEY='dev'` en prod
- Retornar `error.stack` o detalles internos al cliente

**Refs**: OWASP A02:2025 · NIST SSDF PW.9.1

---

## A03:2025 · Software Supply Chain Failures

**Level**: `strict` · **CWEs**: 829

**Do**:
- `npm ci --ignore-scripts` con lockfile para instalaciones reproducibles
- Pin versiones exactas en `package.json` (no wildcards)
- `npm audit` regular + Dependabot / Snyk

**Don't**:
- Dependencias `*` o `^` sin revisión
- Instalar paquetes sin verificar autor/firma

**Refs**: OWASP A03:2025 · OSSF Scorecard · NIST SSDF PS.3.1

---

## A04:2025 · Cryptographic Failures

**Level**: `strict` · **CWEs**: 327, 328

**Do**:
- `bcrypt` con `rounds: 12` para password hashing
- AES-256 via `cryptography` o `crypto` nativo · keys en env, nunca hardcoded
- PBKDF2 con 600000 iterations para key derivation
- HMAC-SHA256 para webhook signatures (ver `imperium-core`)

**Don't**:
- MD5/SHA1 para passwords · DES/3DES
- Keys hardcodeadas en código fuente

**Refs**: OWASP A04:2025 · NIST SP 800-131A

---

## A05:2025 · Injection

**Level**: `strict` · **CWEs**: 89, 78, 79

**Do**:
- Queries parametrizadas · Prisma ORM (protege por default · `prisma.user.findMany({where:{email}})`)
- `execFile(cmd, [args])` en lugar de `exec(cmd_string)`
- Escape/sanitize al renderear HTML (React escapea por default · cuidado con `dangerouslySetInnerHTML`)

**Don't**:
- String concatenation en queries (`` `SELECT * WHERE id=${id}` ``)
- `exec("ls " + userInput)` · `os.system(userInput)`
- `element.innerHTML = userInput`

**Refs**: OWASP A05:2025 · NIST SSDF PW.5.1

---

## A06:2025 · Insecure Design

**Level**: `advisory` · **CWEs**: 840

**Do**:
- Threat model al diseñar features nuevos (trust boundaries, attack vectors)
- Rate limiting built-in desde el diseño (no patch posterior)
- Abuse cases en paralelo a use cases

**Don't**:
- Seguridad como afterthought
- Asumir inputs confiables

**Refs**: OWASP A06:2025 · ISO/IEC 27001

---

## A07:2025 · Authentication Failures

**Level**: `strict` · **CWEs**: 287, 384

**Do**:
- `SECRET_KEY` mínimo 32 bytes random · rotable sin romper sesiones activas
- Regenerar session ID al login (prevenir session fixation)
- MFA para super-admin (implementado en Admin · pendiente verticales)
- Rate limit 5/min en `/login` + lockout tras N intentos

**Don't**:
- Secret compartido entre prod/staging/dev
- Session lifetime indefinido

**Refs**: OWASP A07:2025 · NIST SP 800-63B

---

## A08:2025 · Software and Data Integrity Failures

**Level**: `strict` · **CWEs**: 502, 829

**Do**:
- HMAC verification en todos los webhooks (`imperium-core/signature`)
- `hmac.compare_digest` / `crypto.timingSafeEqual` (timing-safe)
- Solo JSON para deserializar inputs externos

**Don't**:
- `pickle.loads(userInput)` / `eval(userInput)` / `Function(userInput)`
- Aceptar webhooks sin verificar signature

**Refs**: OWASP A08:2025 · NIST SSDF PW.4.1

---

## A09:2025 · Logging & Alerting Failures

**Level**: `warning` · **CWEs**: 778, 223

**Do**:
- Log login success/failure · access control denials · cambios críticos
- Winston logger con JSON estructurado (timestamp, event_type, userId, IP, userAgent)
- AuditLog inmutable en BD para eventos críticos (ver modelo en cada vertical)

**Don't**:
- Loggear passwords, tokens, PII sensible
- No loggear nada (blind en incidentes)

**Refs**: OWASP A09:2025 · NIST SP 800-92

---

## A10:2025 · Mishandling of Exceptional Conditions

**Level**: `warning` · **CWEs**: 755, 754

**Do**:
- Fail closed (denegar acceso si falla check de permisos)
- Log internamente el stack completo · retornar mensaje genérico al cliente
- `try/catch` en boundaries · no en cada función

**Don't**:
- Fail open (retornar `true` en catch de permissions)
- Retornar `error.message` o `error.stack` al cliente

**Refs**: OWASP A10:2025

---

## Quick Reference

| Category | Level | Primary CWEs | Key Control |
|----------|-------|--------------|-------------|
| A01 Broken Access Control | strict | CWE-284, CWE-862 | Server-side authorization |
| A02 Security Misconfiguration | strict | CWE-16, CWE-209 | Secure defaults |
| A03 Supply Chain Failures | strict | CWE-829 | Integrity verification |
| A04 Cryptographic Failures | strict | CWE-327, CWE-328 | Strong algorithms |
| A05 Injection | strict | CWE-89, CWE-78, CWE-79 | Parameterized queries |
| A06 Insecure Design | advisory | CWE-840 | Threat modeling |
| A07 Authentication Failures | strict | CWE-287, CWE-384 | Secure sessions + MFA |
| A08 Integrity Failures | strict | CWE-502 | Signature verification |
| A09 Logging Failures | warning | CWE-778 | Comprehensive logging |
| A10 Error Handling | warning | CWE-755 | Fail closed |

---

## Excepciones documentadas para Imperium Analytics

Ver `OVERRIDES.md` en esta misma carpeta · excepciones justificadas por requerimientos de negocio Muselecom.

---

## Version

- **v1.0.0** · Initial release based on OWASP Top 10:2025 RC1 (November 2025)
- **Imperium adaptation**: 2026-04-24 · stack Node/Express/React/Prisma
