import { useEffect, useState } from 'react';
import { Package, RefreshCw, Activity, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import api from '../services/api';

export default function Modules() {
  const [modules, setModules] = useState(null);
  const [syncing, setSyncing] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    const { data } = await api.request('/modules');
    setModules(data);
  };

  useEffect(() => { load(); }, []);

  const health = async (code) => {
    try {
      setSyncing(`health-${code}`);
      await api.request(`/modules/${code}/health`, { method: 'POST' });
      await load();
      setMsg({ type: 'ok', text: `Health ${code} OK` });
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    } finally { setSyncing(null); setTimeout(() => setMsg(null), 4000); }
  };

  const sync = async (code) => {
    try {
      setSyncing(`sync-${code}`);
      const { data } = await api.request(`/modules/${code}/sync`, { method: 'POST' });
      await load();
      setMsg({ type: 'ok', text: `Sync ${code}: ${data.linked} nuevos · ${data.updated} actualizados · ${data.created} customers creados` });
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    } finally { setSyncing(null); setTimeout(() => setMsg(null), 5000); }
  };

  if (!modules) return <div style={{ padding: 40, color: 'var(--ia-muted)' }}>Cargando...</div>;

  return (
    <div style={{ padding: 32, maxWidth: 1200 }}>
      <header style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Package size={22} style={{ color: 'var(--ia-accent)' }} /> Verticales
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ia-muted)' }}>
            Apps de industria registradas · cliente se suscribe a una o más
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 11, color: '#64748b' }}>
            Verticales ≠ módulos core (Finance, HR, Sales, Inventory, CRM) · estos últimos llegan en Fase G y se activan DENTRO de cada vertical
          </p>
        </div>
      </header>

      {msg && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13,
          background: msg.type === 'ok' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${msg.type === 'ok' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
          color: msg.type === 'ok' ? '#6ee7b7' : '#fca5a5',
        }}>{msg.text}</div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {modules.map((m) => {
          const healthColor = m.lastHealthStatus === 'ok' ? '#10b981'
            : m.lastHealthStatus === 'degraded' ? '#f59e0b' : '#ef4444';
          return (
            <div key={m.code} className="sc" style={{ padding: 20, display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, background: 'var(--ia-accent-soft)', color: 'var(--ia-accent)', padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase' }}>{m.code}</span>
                  <span style={{ fontSize: 16, fontWeight: 600 }}>{m.name}</span>
                  {m.version && <span style={{ fontSize: 11, color: 'var(--ia-muted)' }}>v{m.version}</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ia-muted)', marginBottom: 8 }}>{m.description || m.apiEndpoint}</div>
                <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--ia-muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: healthColor }} />
                    {m.lastHealthStatus || '—'}
                  </span>
                  <span>· {m.customersUsing} customers</span>
                  <span>· {m.webhooksReceived} webhooks</span>
                  <span>· sync: {m.lastSyncAt ? new Date(m.lastSyncAt).toLocaleString('es-MX') : 'nunca'}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => health(m.code)} disabled={syncing}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
                    padding: '8px 12px', background: 'rgba(255,255,255,0.04)',
                    color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, cursor: 'pointer',
                  }}>
                  {syncing === `health-${m.code}` ? <Loader2 size={12} className="animate-spin" /> : <Activity size={12} />}
                  Health
                </button>
                <button onClick={() => sync(m.code)} disabled={syncing}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
                    padding: '8px 12px', background: 'var(--ia-accent-soft)',
                    color: 'var(--ia-accent)', border: '1px solid rgba(124,58,237,0.4)', borderRadius: 6, cursor: 'pointer',
                  }}>
                  {syncing === `sync-${m.code}` ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  Sync tenants
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
