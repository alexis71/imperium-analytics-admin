import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';

export default function ChangePassword() {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const { user, setUser } = useAuth();

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    if (pw !== pw2) return setErr('Las contraseñas no coinciden');
    if (pw.length < 8) return setErr('Mínimo 8 caracteres');
    setBusy(true);
    try {
      await api.auth.changePassword(pw);
      setUser({ ...user, forcePasswordChange: false });
      nav('/dashboard');
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <form onSubmit={submit} className="sc" style={{ width: 380, padding: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <Lock size={26} style={{ color: 'var(--ia-accent)' }} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>Password definitivo</div>
            <div style={{ fontSize: 12, color: 'var(--ia-muted)' }}>Reemplaza el temporal del seed</div>
          </div>
        </div>

        <label className="lbl">Nueva contraseña</label>
        <input type="password" className="inp" value={pw} onChange={(e) => setPw(e.target.value)}
          placeholder="mínimo 8 caracteres" autoComplete="new-password" autoFocus
          style={{ marginBottom: 14 }} />

        <label className="lbl">Confirmar</label>
        <input type="password" className="inp" value={pw2} onChange={(e) => setPw2(e.target.value)}
          autoComplete="new-password" style={{ marginBottom: 18 }} />

        {err && (
          <div style={{ color: '#fca5a5', fontSize: 12, marginBottom: 14 }}>{err}</div>
        )}

        <button type="submit" className="bp" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
          {busy ? 'Guardando...' : 'Guardar y entrar'}
        </button>
      </form>
    </div>
  );
}
