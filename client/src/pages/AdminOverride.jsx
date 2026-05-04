import { useEffect, useState } from 'react';
import { ShieldOff, KeyRound, RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import api from '../services/api';

const VERTICAL_LABEL = {
  rt: 'Sceptra (proyectos)',
  kp: 'Kompaws (veterinaria)',
  nk: 'Almena (IT monitoring)',
  iahb: 'Imperium Hub (panel cliente)',
};

export default function AdminOverride() {
  const [moduleCode, setModuleCode] = useState('kp');
  const [tenantId, setTenantId] = useState('');
  const [tenants, setTenants] = useState(null);
  const [users, setUsers] = useState(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [msg, setMsg] = useState(null);

  const [resetUser, setResetUser] = useState(null);
  const [disableMfaUser, setDisableMfaUser] = useState(null);

  // Cargar tenants disponibles del módulo seleccionado
  useEffect(() => {
    setTenants(null);
    setTenantId('');
    setUsers(null);
    if (!moduleCode) return;
    api.request(`/customers/available-tenants/${moduleCode}`)
      .then((r) => setTenants(r.data || []))
      .catch(() => setTenants([]));
  }, [moduleCode]);

  const loadUsers = async () => {
    if (!moduleCode || !tenantId) return;
    setLoadingUsers(true);
    setUsers(null);
    setMsg(null);
    try {
      const r = await api.request(`/admin-override/users?moduleCode=${moduleCode}&tenantId=${tenantId}`);
      setUsers(r.data || []);
    } catch (e) {
      setMsg({ type: 'err', text: 'No se pudieron cargar usuarios: ' + e.message });
    } finally {
      setLoadingUsers(false);
    }
  };

  return (
    <div style={{ padding: 32, maxWidth: 1100 }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
          <ShieldOff size={22} style={{ color: 'var(--ia-accent)' }} /> Soporte cliente · password / MFA
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ia-muted)' }}>
          Override admin para clientes que pierden contraseña o acceso a su app de autenticación.
          Toda acción queda registrada en audit log con razón obligatoria.
        </p>
      </header>

      {msg && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13,
          background: msg.type === 'ok' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${msg.type === 'ok' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
          color: msg.type === 'ok' ? '#6ee7b7' : '#fca5a5',
        }}>{msg.text}</div>
      )}

      <div className="sc" style={{ padding: 20, marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600 }}>Buscar usuarios</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 12, alignItems: 'end' }}>
          <div>
            <label className="lbl">Vertical</label>
            <select className="inp" value={moduleCode} onChange={(e) => setModuleCode(e.target.value)}>
              {Object.entries(VERTICAL_LABEL).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="lbl">Tenant ID</label>
            <select className="inp" value={tenantId} onChange={(e) => setTenantId(e.target.value)} disabled={!tenants}>
              <option value="">— elige tenant —</option>
              {tenants && tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name || t.slug || t.id} {t.linked ? '· vinculado' : ''}</option>
              ))}
            </select>
          </div>
          <button onClick={loadUsers} className="bp" disabled={!tenantId || loadingUsers}>
            {loadingUsers ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Cargar
          </button>
        </div>
      </div>

      {users && (
        <div className="sc" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'rgba(255,255,255,0.02)' }}>
              <tr>
                <th style={th}>Email</th>
                <th style={th}>Nombre</th>
                <th style={th}>Rol</th>
                <th style={th}>MFA</th>
                <th style={th}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--ia-muted)' }}>
                  No hay usuarios en este tenant
                </td></tr>
              )}
              {users.map((u) => (
                <tr key={u.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={td}>{u.email}</td>
                  <td style={td}>{u.name}</td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--ia-muted)' }}>{u.role}</td>
                  <td style={td}>
                    {u.mfaEnabled
                      ? <span style={{ fontSize: 11, color: '#34d399' }}>● activo</span>
                      : <span style={{ fontSize: 11, color: '#94a3b8' }}>○ inactivo</span>}
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setResetUser(u)} style={btnSm}>
                        <KeyRound size={11} /> Reset pwd
                      </button>
                      <button onClick={() => setDisableMfaUser(u)} disabled={!u.mfaEnabled} style={{ ...btnSm, opacity: u.mfaEnabled ? 1 : 0.4 }}>
                        <ShieldOff size={11} /> MFA off
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          moduleCode={moduleCode}
          tenantId={tenantId}
          onClose={() => setResetUser(null)}
          onSuccess={(data) => {
            setResetUser(null);
            setMsg({ type: 'ok', text: `Password reseteado · nueva pwd: ${data.newPassword}${data.mfaResetAlso ? ' · MFA limpiada' : ''}` });
            loadUsers();
            setTimeout(() => setMsg(null), 12000);
          }}
        />
      )}

      {disableMfaUser && (
        <DisableMfaModal
          user={disableMfaUser}
          moduleCode={moduleCode}
          tenantId={tenantId}
          onClose={() => setDisableMfaUser(null)}
          onSuccess={() => {
            setDisableMfaUser(null);
            setMsg({ type: 'ok', text: `MFA desactivado para ${disableMfaUser.email}` });
            loadUsers();
            setTimeout(() => setMsg(null), 6000);
          }}
        />
      )}
    </div>
  );
}

function ResetPasswordModal({ user, moduleCode, tenantId, onClose, onSuccess }) {
  const [newPassword, setNewPassword] = useState('');
  const [reason, setReason] = useState('');
  const [alsoResetMfa, setAlsoResetMfa] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await api.request(`/admin-override/users/${user.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({
          moduleCode, tenantId, reason: reason.trim(),
          newPassword: newPassword.trim() || undefined,
          alsoResetMfa,
        }),
      });
      onSuccess(r.data);
    } catch (e) {
      setErr(e.message);
    } finally { setBusy(false); }
  };

  return (
    <ModalShell title={`Reset password · ${user.email}`} onClose={onClose}>
      <form onSubmit={submit}>
        {/* Warning preview · qué exactamente vas a ejecutar */}
        <div style={{
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: 8,
          padding: '10px 12px',
          marginBottom: 14,
          fontSize: 12,
          color: '#fbbf24',
          lineHeight: 1.5,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 6, color: '#fcd34d' }}>
            ⚠ Acción auditada · revisa antes de confirmar
          </div>
          <div style={{ color: 'var(--ia-muted)' }}>
            Vertical: <code style={{ color: '#fbbf24' }}>{moduleCode}</code>{tenantId && <> · tenant <code style={{ color: '#fbbf24' }}>{tenantId.substring(0, 8)}…</code></>}<br/>
            Usuario: <code style={{ color: '#fbbf24' }}>{user.email}</code><br/>
            Acción: reset password{alsoResetMfa ? ' + reset MFA' : ''}{newPassword.trim() ? ' (password manual)' : ' (random generado)'}<br/>
            Esta operación queda en audit log inmutable de Admin · no puede deshacerse.
          </div>
        </div>

        <label className="lbl">Nueva password (opcional · vacío = random)</label>
        <input type="text" className="inp" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
          placeholder="(generar random)" minLength={8} maxLength={128} style={{ marginBottom: 12, fontFamily: 'monospace' }} />

        <label className="lbl">Razón (mandatorio · queda en audit log)</label>
        <textarea className="inp" value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Cliente perdió password · ticket #123" required minLength={5} maxLength={500}
          rows={3} style={{ marginBottom: 12, fontFamily: 'inherit' }} />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', fontSize: 13, color: 'var(--ia-muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={alsoResetMfa} onChange={(e) => setAlsoResetMfa(e.target.checked)} />
          También resetear MFA · usuario tendrá que re-enrollar
        </label>

        {err && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: '8px 12px', borderRadius: 6, fontSize: 12, marginBottom: 14 }}>
            {err}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button type="submit" className="bp" disabled={busy || reason.trim().length < 5} style={{ flex: 1, justifyContent: 'center' }}>
            {busy ? 'Reseteando...' : 'Confirmar reset password'}
          </button>
          <button type="button" onClick={onClose} className="bg" style={{ padding: '0 16px' }}>Cancelar</button>
        </div>
      </form>
    </ModalShell>
  );
}

function DisableMfaModal({ user, moduleCode, tenantId, onClose, onSuccess }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await api.request(`/admin-override/users/${user.id}/disable-mfa`, {
        method: 'POST',
        body: JSON.stringify({ moduleCode, tenantId, reason: reason.trim() }),
      });
      onSuccess();
    } catch (e) {
      setErr(e.message);
    } finally { setBusy(false); }
  };

  return (
    <ModalShell title={`Desactivar MFA · ${user.email}`} onClose={onClose}>
      <form onSubmit={submit}>
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', padding: 12, borderRadius: 8, marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <AlertCircle size={16} style={{ color: '#fbbf24', flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 12, color: '#fde68a', lineHeight: 1.5 }}>
            Esto deshabilitará MFA para <strong>{user.email}</strong>. El usuario podrá iniciar sesión solo con password.
            Recomienda al cliente activar MFA nuevamente desde Settings tras login.
          </div>
        </div>

        <label className="lbl">Razón (mandatorio · queda en audit log)</label>
        <textarea className="inp" value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Cliente perdió teléfono · ticket #124" required minLength={5} maxLength={500}
          rows={3} style={{ marginBottom: 12, fontFamily: 'inherit' }} />

        {err && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: '8px 12px', borderRadius: 6, fontSize: 12, marginBottom: 14 }}>
            {err}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="bp" disabled={busy || reason.trim().length < 5}
            style={{ flex: 1, justifyContent: 'center', background: '#dc2626', borderColor: '#dc2626' }}>
            {busy ? 'Desactivando...' : 'Confirmar desactivar MFA'}
          </button>
          <button type="button" onClick={onClose} className="bg" style={{ padding: '0 16px' }}>Cancelar</button>
        </div>
      </form>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div onClick={(e) => e.stopPropagation()} className="sc modal-panel" style={{ width: 480, padding: 24, maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--ia-muted)', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const th = { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--ia-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' };
const td = { padding: '12px 14px', fontSize: 13 };
const btnSm = {
  display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
  padding: '5px 10px', background: 'rgba(255,255,255,0.04)',
  color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 5, cursor: 'pointer',
};
