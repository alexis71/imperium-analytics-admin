import { useEffect, useState } from 'react';
import { Settings as SettingsIcon, RefreshCw, Shield, Key, Copy, Check, AlertTriangle } from 'lucide-react';
import api from '../services/api';

export default function Settings() {
  const [modules, setModules] = useState(null);
  const [mfa, setMfa] = useState(null);
  const [newSecret, setNewSecret] = useState(null);
  const [newCodes, setNewCodes] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    const [m, f] = await Promise.all([
      api.request('/settings/modules'),
      api.request('/settings/mfa'),
    ]);
    setModules(m.data);
    setMfa(f.data);
  };

  useEffect(() => { load(); }, []);

  const rotateSecret = async (code) => {
    if (!confirm(`Rotar sharedSecret de ${code}?\n\nATENCIÓN: también debes actualizar IMPERIUM_WEBHOOK_SECRET en el .env del vertical ${code.toUpperCase()} o dejarán de funcionar los webhooks.`)) return;
    try {
      const { data } = await api.request(`/settings/modules/${code}/rotate-secret`, { method: 'POST' });
      setNewSecret({ code, secret: data.newSecret });
      await load();
    } catch (e) { alert(e.message); }
  };

  const regenerateRecovery = async () => {
    if (!confirm('Regenerar 8 recovery codes?\n\nLos anteriores dejarán de funcionar inmediatamente.')) return;
    try {
      const { data } = await api.request('/settings/mfa/regenerate-recovery', { method: 'POST' });
      setNewCodes(data.recoveryCodes);
      await load();
    } catch (e) { alert(e.message); }
  };

  const copy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!modules || !mfa) return <div style={{ padding: 40 }}>Cargando...</div>;

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
          <SettingsIcon size={22} style={{ color: 'var(--ia-accent)' }} /> Settings
        </h1>
      </header>

      {/* MFA */}
      <div className="sc" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <Shield size={18} style={{ color: 'var(--ia-accent)' }} />
          <h2 style={{ margin: 0, fontSize: 16 }}>Autenticación 2FA</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--ia-muted)', textTransform: 'uppercase' }}>Estado</div>
            <div>{mfa.mfaEnabled ? <span style={{ color: '#10b981' }}>✓ Activo</span> : <span style={{ color: '#ef4444' }}>Desactivado</span>}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--ia-muted)', textTransform: 'uppercase' }}>Recovery codes restantes</div>
            <div style={{ color: mfa.recoveryCodesRemaining < 3 ? '#fca5a5' : 'var(--ia-fg)' }}>
              {mfa.recoveryCodesRemaining} / 8
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--ia-muted)', textTransform: 'uppercase' }}>Último login</div>
            <div>{mfa.lastLoginAt ? new Date(mfa.lastLoginAt).toLocaleString('es-MX') : '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--ia-muted)', textTransform: 'uppercase' }}>IP último login</div>
            <div style={{ fontFamily: 'monospace', fontSize: 12 }}>{mfa.lastLoginIP || '—'}</div>
          </div>
        </div>
        <button onClick={regenerateRecovery} style={{
          fontSize: 12, padding: '8px 14px',
          background: 'rgba(255,255,255,0.04)', color: 'var(--ia-fg)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <RefreshCw size={12} /> Regenerar recovery codes
        </button>

        {newCodes && (
          <div style={{ marginTop: 14, padding: 14, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: '#fbbf24', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={14} /> Nuevos recovery codes · guárdalos ahora en 1Password
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, fontFamily: 'monospace', fontSize: 13, marginBottom: 10 }}>
              {newCodes.map((c) => <div key={c}>{c}</div>)}
            </div>
            <button onClick={() => copy(newCodes.join('\n'))} style={{
              fontSize: 11, padding: '4px 10px', background: 'transparent',
              color: copied ? '#10b981' : 'var(--ia-muted)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? 'Copiado' : 'Copiar los 8'}
            </button>
          </div>
        )}
      </div>

      {/* Module secrets */}
      <div className="sc" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <Key size={18} style={{ color: 'var(--ia-accent)' }} />
          <h2 style={{ margin: 0, fontSize: 16 }}>Shared secrets de verticales</h2>
        </div>
        <p style={{ fontSize: 12, color: 'var(--ia-muted)', marginTop: 0, marginBottom: 14 }}>
          Rotar el secret de un vertical invalida todos los webhooks anteriores · hay que actualizar <code>IMPERIUM_WEBHOOK_SECRET</code> en el <code>.env</code> del vertical correspondiente simultáneamente.
        </p>

        {modules.map((m) => (
          <div key={m.code} style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 10, padding: '2px 8px', background: 'var(--ia-accent-soft)', color: 'var(--ia-accent)', borderRadius: 4, textTransform: 'uppercase' }}>{m.code}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13 }}>{m.name}</div>
              <div style={{ fontSize: 11, color: 'var(--ia-muted)', fontFamily: 'monospace' }}>{m.sharedSecretMasked}</div>
            </div>
            <button onClick={() => rotateSecret(m.code)} style={{
              fontSize: 11, padding: '6px 12px',
              background: 'rgba(239,68,68,0.1)', color: '#fca5a5',
              border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <RefreshCw size={11} /> Rotar
            </button>
          </div>
        ))}

        {newSecret && (
          <div style={{ marginTop: 14, padding: 14, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: '#fca5a5', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={14} /> Nuevo secret de <strong>{newSecret.code.toUpperCase()}</strong> · cópialo AHORA
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', padding: 8, background: 'rgba(0,0,0,0.3)', borderRadius: 4, marginBottom: 10 }}>
              {newSecret.secret}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ia-muted)' }}>
              Pégalo en <code>{newSecret.code === 'rt' ? 'RoundTable_v1' : newSecret.code}/server/.env</code> como <code>IMPERIUM_WEBHOOK_SECRET={newSecret.secret.slice(0, 8)}...</code> y reinicia el vertical.
            </div>
            <button onClick={() => copy(newSecret.secret)} style={{
              marginTop: 8, fontSize: 11, padding: '4px 10px', background: 'transparent',
              color: copied ? '#10b981' : 'var(--ia-muted)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
