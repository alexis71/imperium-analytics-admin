import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';

export default function MfaVerify() {
  const [mfaToken, setMfaToken] = useState(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const { completeAuth } = useAuth();

  useEffect(() => {
    const t = sessionStorage.getItem('ia_mfa_token');
    if (!t) { nav('/login'); return; }
    setMfaToken(t);
  }, [nav]);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const { data } = await api.auth.mfaVerify(mfaToken, code);
      sessionStorage.removeItem('ia_mfa_token');
      completeAuth(data);
      if (data.forcePasswordChange) nav('/change-password');
      else nav('/dashboard');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <form onSubmit={submit} className="sc" style={{ width: 380, padding: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <ShieldCheck size={28} style={{ color: 'var(--ia-accent)' }} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>Código 2FA</div>
            <div style={{ fontSize: 12, color: 'var(--ia-muted)' }}>6 dígitos de Authenticator · o recovery code</div>
          </div>
        </div>

        <input type="text" inputMode="numeric" maxLength={14}
          className="inp" value={code} onChange={(e) => setCode(e.target.value.replace(/[^\w-]/g, ''))}
          placeholder="000000" autoFocus autoComplete="one-time-code"
          style={{ marginBottom: 14, textAlign: 'center', fontSize: 22, letterSpacing: '0.2em', fontFamily: 'monospace' }} />

        {err && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 14 }}>
            {err}
          </div>
        )}

        <button type="submit" className="bp" style={{ width: '100%', justifyContent: 'center' }} disabled={busy || code.length < 6}>
          {busy ? 'Verificando...' : 'Verificar'}
        </button>
      </form>
    </div>
  );
}
