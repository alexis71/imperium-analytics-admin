# React Security Rules

**Source**: TikiTribe/claude-secure-coding-rules (MIT) · `rules/frontend/react/CLAUDE.md`
**Prereq**: `owasp-2025.md` + `javascript.md`

Aplica solo a `/client/` (React clients). Los `/server/` Express siguen `express.md`.

---

## XSS Prevention

### Rule · No `dangerouslySetInnerHTML` con user input
**Level**: `strict` · **CWE**: 79

**Do**:
```jsx
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />

// Plain text (React escapa por default):
<p>{userText}</p>
```

**Don't**: `<div dangerouslySetInnerHTML={{ __html: userHtml }} />` sin sanitize.

---

### Rule · Sanitizar URLs en `href` y `src`
**Level**: `strict` · **CWE**: 601

**Do**:
```jsx
function SafeLink({ url, children }) {
  const ok = (() => { try { return ['http:','https:'].includes(new URL(url).protocol); } catch { return false; } })();
  return ok ? <a href={url}>{children}</a> : <span>{children}</span>;
}
```

**Don't**: `<a href={userUrl}>` directo · `javascript:` URLs ejecutan código.

---

## State Management

### Rule · No guardar datos sensibles en client state
**Level**: `strict` · **CWE**: 922

**Do**:
- Tokens JWT cortos en memoria (no localStorage idealmente)
- Refresh tokens en httpOnly cookies (set by server)
- Solo id/name/email en estado cliente

**Don't**:
```jsx
const [token] = useState(localStorage.getItem('token'));  // accesible via XSS
const [user] = useState({ ...userData, password, ssn });   // nunca pwd/PII en state
```

**Nota Imperium**: hoy usamos `localStorage` para JWT por simplicidad (dev). En prod migrar a httpOnly cookie + CSRF token.

---

### Rule · Validar props y state externos
**Level**: `warning` · **CWE**: 20

**Do**:
```jsx
// TypeScript (preferido)
interface UserProfileProps { userId: number; email: string; }

// O PropTypes
UserProfile.propTypes = { userId: PropTypes.number.isRequired };
```

**Don't**: usar `data.xxx` sin validar shape.

---

## API Security

### Rule · CSRF tokens en state-changing requests
**Level**: `strict` · **CWE**: 352

**Do**:
```jsx
const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type':'application/json', 'X-CSRF-Token': csrfToken },
  credentials: 'include',
  body: JSON.stringify(data),
});
```

**Nota Imperium**: JWT Bearer tokens son parcialmente CSRF-resistentes (no se envían auto via cookies) · CSRF solo relevante si migramos a httpOnly cookies.

---

### Rule · Validar API responses
**Level**: `warning` · **CWE**: 20

**Do**:
```jsx
const data = await res.json();
if (!data.id || !data.email) throw new Error('Invalid shape');
return { id: data.id, email: data.email, name: data.name ?? 'Unknown' };
```

**Don't**: asumir shape sin check · puede crashear renders.

---

## Component Security

### Rule · Server enforza authorization · cliente solo UX
**Level**: `warning` · **CWE**: 602

**Do**:
```jsx
// Server retorna 403 si no autorizado
const { data, error } = useQuery('adminData', fetchAdminData);

// Cliente oculta UI por UX · NO por seguridad
{user.isAdmin && <AdminLink />}
```

**Don't**:
```jsx
// VULNERABLE: check solo cliente
if (!user.isAdmin) return <AccessDenied />;
return <SensitiveData />;  // API aún expuesta
```

**Aplicación Imperium**: usar `<PermissionGuard need="x.y">` solo para UX · backend valida siempre con middleware.

---

### Rule · Sanitizar form inputs
**Level**: `strict` · **CWE**: 20

**Do** (Zod):
```jsx
import { z } from 'zod';
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8).max(128) });

const validated = loginSchema.parse({ email: form.email, password: form.password });
```

**Don't**: mandar `form.email.value` directo al API sin validar.

---

## Dependencies

### Rule · Mantener deps actualizadas
**Level**: `warning` · **CWE**: 1104

```bash
npm audit
npm audit fix
npm outdated
```

---

## Quick Reference

| Rule | Level | CWE |
|------|-------|-----|
| No dangerouslySetInnerHTML | strict | CWE-79 |
| Sanitize URLs | strict | CWE-601 |
| No sensitive client state | strict | CWE-922 |
| Validate props/state | warning | CWE-20 |
| CSRF tokens | strict | CWE-352 |
| Validate API responses | warning | CWE-20 |
| Server-side authorization | warning | CWE-602 |
| Sanitize forms | strict | CWE-20 |
| Update dependencies | warning | CWE-1104 |
