import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Shield } from 'lucide-react';
import api from '../services/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const { data } = await api.auth.login(email, password);
      if (data.needsMfaSetup) {
        sessionStorage.setItem('ia_setup_token', data.setupToken);
        nav('/mfa/setup');
      } else if (data.needsMfa) {
        sessionStorage.setItem('ia_mfa_token', data.mfaToken);
        nav('/mfa/verify');
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <form onSubmit={submit} className="sc" style={{ width: 380, padding: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
          <div className="ia-seal" />
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>Imperium Analytics</div>
            <div style={{ fontSize: 11, color: 'var(--ia-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Admin</div>
          </div>
        </div>

        <label className="lbl">Correo</label>
        <input type="email" className="inp" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="alejandro.rodriguez@muselecom.com" required autoComplete="email"
          style={{ marginBottom: 14 }} />

        <label className="lbl">Contraseña</label>
        <input type="password" className="inp" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="********" required autoComplete="current-password"
          style={{ marginBottom: 18 }} />

        {err && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 14 }}>
            {err}
          </div>
        )}

        <button type="submit" className="bp" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
          <LogIn size={15} />
          {busy ? 'Entrando...' : 'Continuar'}
        </button>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ia-muted)' }}>
          <Shield size={12} style={{ color: 'var(--ia-accent)' }} />
          Autenticación de 2 factores obligatoria
        </div>
      </form>
    </div>
  );
}
