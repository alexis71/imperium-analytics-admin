import { useEffect, useState } from 'react';
import { Webhook, CheckCircle2, AlertTriangle, Eye } from 'lucide-react';
import api from '../services/api';

export default function Webhooks() {
  const [events, setEvents] = useState(null);
  const [detail, setDetail] = useState(null);

  const load = async () => {
    const { data } = await api.request('/webhooks-inbox/events');
    setEvents(data);
  };

  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, []);

  const viewDetail = async (id) => {
    const { data } = await api.request(`/webhooks-inbox/events/${id}`);
    setDetail(data);
  };

  if (!events) return <div style={{ padding: 40 }}>Cargando...</div>;

  return (
    <div style={{ padding: 32, maxWidth: 1280 }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Webhook size={22} style={{ color: 'var(--ia-accent)' }} /> Webhooks inbox
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ia-muted)' }}>
          {events.length} evento{events.length !== 1 ? 's' : ''} · auto-refresh 10s
        </p>
      </header>

      {events.length === 0 ? (
        <div className="sc" style={{ padding: 32, textAlign: 'center', color: 'var(--ia-muted)', fontSize: 13 }}>
          Inbox vacío. RT disparará eventos automáticamente con suspend/unsuspend/tier/extend/signup.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 4 }}>
          {events.map((e) => (
            <div key={e.id} className="sc" style={{
              padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
              cursor: 'pointer',
            }} onClick={() => viewDetail(e.id)}>
              {e.verified ? <CheckCircle2 size={14} style={{ color: '#10b981' }} /> : <AlertTriangle size={14} style={{ color: '#ef4444' }} />}
              <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--ia-accent-soft)', color: 'var(--ia-accent)', borderRadius: 4, textTransform: 'uppercase' }}>{e.moduleCode}</span>
              <span style={{ fontWeight: 500 }}>{e.event}</span>
              {e.processedAt && !e.error && <span style={{ fontSize: 10, color: '#10b981' }}>handled</span>}
              {e.error && <span style={{ fontSize: 10, color: '#fca5a5' }}>{e.error}</span>}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ia-muted)' }}>
                {new Date(e.createdAt).toLocaleString('es-MX')}
              </span>
              <Eye size={12} style={{ color: 'var(--ia-muted)' }} />
            </div>
          ))}
        </div>
      )}

      {detail && (
        <div onClick={() => setDetail(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100,
        }}>
          <div onClick={(e) => e.stopPropagation()} className="sc modal-panel" style={{ width: 640, maxHeight: '85vh', overflow: 'auto', padding: 20 }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 10, padding: '2px 8px', background: 'var(--ia-accent-soft)', color: 'var(--ia-accent)', borderRadius: 4, textTransform: 'uppercase' }}>{detail.moduleCode}</span>
              <span style={{ fontWeight: 600 }}>{detail.event}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ia-muted)' }}>{new Date(detail.createdAt).toLocaleString('es-MX')}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--ia-muted)', marginBottom: 12 }}>
              IP: {detail.ip || '—'} · Verified: {detail.verified ? 'sí' : 'NO'} · Processed: {detail.processedAt ? 'sí' : 'no'}
              {detail.error && <div style={{ color: '#fca5a5' }}>Error: {detail.error}</div>}
            </div>
            <pre style={{ fontSize: 11, background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 6, overflow: 'auto' }}>
              {JSON.stringify(detail.payload, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
