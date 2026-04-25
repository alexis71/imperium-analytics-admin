# Imperium Analytics Admin · Contexto para Claude Code

## Identidad
- **Nombre**: Imperium Analytics Admin
- **Código módulo**: `ia-admin`
- **Puerto server**: 3010 · **Puerto client**: 5175
- **Dominio dev**: `admin.imperium.local`
- **Dominio prod futuro**: `imperium-nk.com` (por comprar) o `admin.nomadknight.com`
- **Accent color**: Púrpura `#7c3aed` · prefix CSS `ia.*`
- **Owner**: Alejandro · Muselecom / Nomad Knight

## Misión
Panel exclusivo de Alejandro que consolida y gestiona **cross-vertical**:
- Customers, módulos registrados (RT/NK/KP/...), licencias, facturación, webhooks, audit log global
- Jerarquía: `Customer → CustomerModule → Tenant (en vertical) → Sucursales (manejadas por vertical)`

## Stack
React 18 + Vite + TailwindCSS + Lucide · Node.js + Express + Prisma + **PostgreSQL** · otplib + qrcode (MFA TOTP) · Winston · bcrypt + JWT access+refresh · HMAC-SHA256 para webhooks

## Estado actual (C.1 completa · 2026-04-21)
- [x] Postgres `ia_admin_db` + user `ia_admin_user` (passwords en 1Password)
- [x] Prisma schema con 10 modelos · migración `init` aplicada
- [x] Seed super-admin `alejandro.rodriguez@muselecom.com` + módulo RT registrado
- [x] Auth bifásico con MFA TOTP obligatorio + 8 recovery codes + AES-256-GCM encryption
- [x] Webhook `/api/v1/webhooks/ingest` con verificación HMAC por módulo
- [x] Client completo: Login + MFA setup/verify + Change password + Dashboard con KPIs
- [x] Rate limit MFA (5 intentos / 15 min lockout)

## Docs de referencia
- `Desktop/Imperium_Forge/docs/IMPERIUM_ANALYTICS_ADMIN_DESIGN.md` — blueprint completo 1087 líneas
- `Desktop/Imperium_Forge/docs/IMPERIUM_ANALYTICS_ADMIN_FLOWS.md` — diagramas Mermaid

## Roadmap
- **C.1** ✅ Esqueleto + auth + MFA + webhook
- **C.2** · Integración RT (pull tenants, pass-through commands, RT emite webhooks outbound)
- **C.3** · Facturación consolidada + PDF + dashboard con MRR real

## Pendientes críticos de seguridad antes de ir a prod
- Rotar `APP_ENCRYPTION_KEY` después de primer uso (guardar nueva en 1Password)
- Rotar `EMERGENCY_OVERRIDE_KEY` (frase sellada en 1Password físico)
- Rotar API key de Resend (la actual quedó en historial Claude)
- Cambiar password temporal del seed al hacer primer login

## Comandos útiles
```bash
# Server
cd server && npm run dev              # :3010
cd server && npm run db:studio        # UI de Prisma para inspeccionar
cd server && npx prisma migrate dev   # nueva migración

# Client
cd client && npm run dev              # :5175

# Root (ambos)
npm run dev

# Postgres (sistema Postgres 16 ya instalado)
# DB: ia_admin_db · User: ia_admin_user · Port: 5432
```

## Credenciales super-admin (primer login)
- Email: `alejandro.rodriguez@muselecom.com`
- Password temporal: generada random en seed · mostrada una vez en consola
- Si la perdiste: `node prisma/seed.js` NO la regenera (bloqueado si existe) · usar `scripts/emergency-disable-mfa.js` o editar manualmente vía psql

## Reglas no negociables
- MFA obligatorio · no se puede desactivar desde UI (solo emergency script)
- `mfaSecretCipher`, `Module.sharedSecretCipher`, `Module.apiTokenCipher` SIEMPRE cifrados con AES-256-GCM
- Webhooks inbound requieren HMAC verificado · sin verificar → guardados con `verified=false` para debugging pero NO se procesan
- Audit log inmutable · no hay endpoint de delete
- Rate limit de MFA: 5 intentos/15min por usuario (ventana rolling)

## Security rules baseline

Reglas OWASP 2025 + JavaScript + Express + React aplicadas via `.claude/security-rules/`:

- `owasp-2025.md` · A01-A10 (strict + warning + advisory)
- `javascript.md` · code execution, DOM, crypto, HTTP security
- `express.md` · middleware, validation, sessions, DB, uploads [solo `/server/`]
- `react.md` · XSS, state, API, CSRF, forms [solo `/client/`]
- `OVERRIDES.md` · excepciones documentadas (currentPassword visibility scoped super-admin, localStorage JWT)

**Fuente**: TikiTribe/claude-secure-coding-rules v1.0.0 (MIT). Source canónico en `Desktop/_security-rules-source/`. Re-sync: `bash Desktop/sync-security-rules.sh`.

**Precedencia**:
1. `.claude/security-rules/*.md` · más específico (seguridad)
2. Este `CLAUDE.md` · workflow + arquitectura + dominio
3. Memorias globales `feedback_*` · cross-app conventions

**Nota Admin**: Admin es el único vertical con MFA TOTP implementado (speakeasy + qrcode) · modelo de referencia para replicar en KP/RT/NK/Hub (ver Opción 2.a del security hardening roadmap).

**Principio**: security + workflow rules son complementarias. Choques doctrinales se declaran en `OVERRIDES.md`.
