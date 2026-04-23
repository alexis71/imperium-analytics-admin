# Imperium Analytics Admin · HANDOFF

> **Última actualización:** 2026-04-21 · Fase C.1 completa

## Dónde estamos

**C.1 completado** — app completa con auth + MFA + webhook + dashboard placeholder.

### Infraestructura
- Postgres 16 (sistema existente) · DB `ia_admin_db` · user `ia_admin_user`
- Super-admin creado en seed con password temporal

### Credenciales iniciales
- Email: `alejandro.rodriguez@muselecom.com`
- Password temporal (mostrado UNA vez al correr seed): **`jXScysXLwToayXlc!`**
- `APP_ENCRYPTION_KEY` en `server/.env` · respaldar en 1Password
- `EMERGENCY_OVERRIDE_KEY` en `server/.env` · respaldar en 1Password

## Primer login (por hacer)

1. Arranca los servicios:
   ```bash
   cd Desktop/Imperium_Analytics_Admin
   npm run dev
   ```
2. Abre `http://localhost:5175/login`
3. Email + password temporal
4. Flow automático: enroll MFA con Google Authenticator / Authy
5. Escanea QR · guarda 8 recovery codes
6. Ingresa código TOTP para confirmar
7. Cambia password definitivo
8. Dashboard

## ✅ C.2 completado (2026-04-21)

- `vertical-client.js` · pull Admin → RT con header `X-Imperium-Admin-Key`
- `POST /modules/:code/sync` · pulla tenants de RT, crea Customer + CustomerModule
- `POST /modules/:code/health` · health check del vertical
- `routes/customers.js` · CRUD + suspend/unsuspend pass-through al vertical
- `routes/licenses.js` · lista plana cross-module + extend pass-through
- `routes/webhooks-inbox.js` · lista + detail de eventos
- RT `middleware/auth.js` acepta `X-Imperium-Admin-Key` como alternativa a JWT
- RT `imperium-emitter.js` · emite webhook outbound a Admin en:
  - `signup.js` → `tenant.created`
  - `admin.js` suspend → `tenant.suspended`
  - `admin.js` unsuspend → `tenant.unsuspended`
  - `admin.js` tier → `tenant.tier.changed`
  - `admin.js` extend → `license.extended`
- Webhook ingest handler auto-procesa: tenant.created crea Customer · suspend/unsuspend actualiza CustomerModule
- Client pages: Customers, Modules, Licenses, Webhooks + sidebar activo

### Tests end-to-end validados
- ✅ Signup RT → webhook HMAC → Admin crea Customer (Test C2 Run 3)
- ✅ Admin suspend → RT aplica cambio (pass-through HMAC)
- ✅ Admin-Key auth → RT devuelve tenants sin necesitar JWT

## ✅ C.3 completado (2026-04-21)

- `utils/invoice-generator.js` · items desde CustomerModule+License activos · numeración IA-YYYY-MM-NNNN · IVA 16% · idempotente · bulk `generateAllForPeriod`
- `utils/invoice-pdf.js` · server-side con pdfkit (no jsPDF: jsPDF es client-side, aquí necesitamos Buffer para email/almacenamiento)
- `routes/invoices.js` · list/detail/generate/payments/status/pdf
- `routes/settings.js` · rotate sharedSecret + regenerate recovery codes
- `routes/dashboard.js` · MRR activo + facturado mes + pagado mes + facturas por cobrar
- Client: Invoices, InvoiceDetail (modal pago), Settings, Dashboard con KPIs financieros

### Validados end-to-end
- ✅ IA-2026-04-0001 generada ($399 + IVA $64 = $463 MXN)
- ✅ PDF 2563 bytes con header/items/totales/pagos
- ✅ Rotación sharedSecret con AES-256-GCM

### Dependencia agregada
- `pdfkit ^0.18` en Admin server

## Siguiente · opciones
- Audit log global UI (C.4 polish)
- Bulk payment register via CSV
- **Fase D · Analytics Hub** (dashboard cliente dueño)

## Archivos clave
- `server/src/index.js` — entry
- `server/src/routes/auth.js` — login + MFA
- `server/src/routes/webhooks.js` — ingest HMAC
- `server/prisma/schema.prisma` — 10 modelos
- `client/src/pages/` — Login, MfaSetup, MfaVerify, ChangePassword, Dashboard
- `client/src/services/api.js` — cliente HTTP

## Docs
- `Desktop/Imperium_Forge/docs/IMPERIUM_ANALYTICS_ADMIN_DESIGN.md`
- `Desktop/Imperium_Forge/docs/IMPERIUM_ANALYTICS_ADMIN_FLOWS.md`
