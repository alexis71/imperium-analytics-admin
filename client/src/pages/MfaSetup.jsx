import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Copy, Check } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';

export default function MfaSetup() {
  const [setupToken, setSetupToken] = useState(null);
  const [qr, setQr] = useState(null);
  const [secret, setSecret] = useState(null);
  const [codes, setCodes] = useState([]);
  const [step, setStep] = useState('scan'); // scan | verify
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const { completeAuth } = useAuth();

  useEffect(() => {
    const t = sessionStorage.getItem('ia_setup_token');
    if (!t) { nav('/login'); return; }
    setSetupToken(t);
    (async () => {
      try {
        const { data } = await api.auth.mfaSetup(t);
        setQr(data.qr);
        setSecret(data.secret);
        setCodes(data.recoveryCodes);
      } catch (e) { setErr(e.message); }
    })();
  }, [nav]);

  const copyAll = () => {
    navigator.clipboard.writeText(codes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const { data } = await api.auth.mfaEnable(setupToken, code);
      sessionStorage.removeItem('ia_setup_token');
      completeAuth(data);
      if (data.forcePasswordChange) nav('/change-password');
      else nav('/dashboard');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (err && !qr) return <div style={{ padding: 40, color: '#fca5a5' }}>{err}</div>;
  if (!qr) return <div style={{ padding: 40 }}>Generando...</div>;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="sc" style={{ width: 480, padding: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <ShieldCheck size={28} style={{ color: 'var(--ia-accent)' }} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>Configurar 2FA</div>
            <div style={{ fontSize: 12, color: 'var(--ia-muted)' }}>Requerido · único paso · 2 minutos</div>
          </div>
        </div>

        {step === 'scan' && (
          <>
            <p style={{ fontSize: 13, color: 'var(--ia-fg)', lineHeight: 1.6, marginBottom: 14 }}>
              <strong>1.</strong> Escanea este QR con <strong>Google Authenticator</strong> o <strong>Authy</strong>:
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
              <img src={qr} alt="QR MFA" style={{ width: 220, height: 220, borderRadius: 8, background: '#fff', padding: 10 }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--ia-muted)', textAlign: 'center', marginBottom: 20, fontFamily: 'monospace' }}>
              Manual: <span style={{ color: 'var(--ia-accent)' }}>{secret}</span>
            </div>

            <p style={{ fontSize: 13, color: 'var(--ia-fg)', lineHeight: 1.6, marginBottom: 12 }}>
              <strong>2.</strong> Guarda estos 8 <strong>recovery codes</strong> (en 1Password). Cada uno sirve 1 vez si pierdes el teléfono:
            </p>
            <div style={{
              background: 'rgba(0,0,0,0.3)', padding: 14, borderRadius: 8,
              fontFamily: 'monospace', fontSize: 13,
              display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 10,
            }}>
              {codes.map((c) => <div key={c}>{c}</div>)}
            </div>
            <button type="button" onClick={copyAll} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
              color: copied ? '#10b981' : 'var(--ia-muted)', fontSize: 12, cursor: 'pointer',
              marginBottom: 22,
            }}>
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copiado' : 'Copiar los 8'}
            </button>

            <button className="bp" style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => setStep('verify')}>
              Ya guardé todo · continuar
            </button>
          </>
        )}

        {step === 'verify' && (
          <form onSubmit={submit}>
            <p style={{ fontSize: 13, color: 'var(--ia-fg)', lineHeight: 1.6, marginBottom: 14 }}>
              <strong>3.</strong> Escribe el código de 6 dígitos que ves en Authenticator:
            </p>
            <input type="text" inputMode="numeric" maxLength={6}
              className="inp" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000" autoFocus
              style={{ marginBottom: 18, textAlign: 'center', fontSize: 24, letterSpacing: '0.3em', fontFamily: 'monospace' }} />

            {err && <div style={{ color: '#fca5a5', fontSize: 12, marginBottom: 12 }}>{err}</div>}

            <button type="submit" className="bp" style={{ width: '100%', justifyContent: 'center' }} disabled={busy || code.length !== 6}>
              {busy ? 'Activando...' : 'Activar 2FA'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
