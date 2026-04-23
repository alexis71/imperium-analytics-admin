import { useEffect, useState } from 'react';
import { Key, Calendar } from 'lucide-react';
import api from '../services/api';

export default function Licenses() {
  const [licenses, setLicenses] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const query = filter === 'expiring' ? '?expiringSoon=true' : filter === 'active' ? '?status=active' : '';
    api.request(`/licenses${query}`).then((r) => setLicenses(r.data));
  }, [filter]);

  const extend = async (id, days) => {
    if (!confirm(`Extender ${days} días?`)) return;
    try {
      await api.request(`/licenses/${id}/extend`, { method: 'POST', body: JSON.stringify({ days }) });
      const r = await api.request('/licenses');
      setLicenses(r.data);
    } catch (e) { alert(e.message); }
  };

  if (!licenses) return <div style={{ padding: 40 }}>Cargando...</div>;

  return (
    <div style={{ padding: 32, maxWidth: 1280 }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Key size={22} style={{ color: 'var(--ia-accent)' }} /> Licenses
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ia-muted)' }}>
          {licenses.length} licencia{licenses.length !== 1 ? 's' : ''} · cross-module
        </p>
      </header>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[
          { k: 'all', label: 'Todas' },
          { k: 'active', label: 'Activas' },
          { k: 'expiring', label: 'Por vencer 30d' },
        ].map((f) => (
          <button key={f.k} onClick={() => setFilter(f.k)} style={{
            padding: '6px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
            background: filter === f.k ? 'var(--ia-accent-soft)' : 'transparent',
            color: filter === f.k ? 'var(--ia-accent)' : 'var(--ia-muted)',
            border: `1px solid ${filter === f.k ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.08)'}`,
          }}>{f.label}</button>
        ))}
      </div>

      {licenses.length === 0 ? (
        <div className="sc" style={{ padding: 32, textAlign: 'center', color: 'var(--ia-muted)', fontSize: 13 }}>
          Sin licencias para este filtro.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {licenses.map((l) => {
            const urgent = l.daysRemaining < 7;
            return (
              <div key={l.id} className="sc" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 10, padding: '3px 8px', background: 'var(--ia-accent-soft)', color: 'var(--ia-accent)', borderRadius: 4, textTransform: 'uppercase' }}>{l.moduleCode}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{l.customerName}</div>
                  <div style={{ fontSize: 11, color: 'var(--ia-muted)', fontFamily: 'monospace' }}>{l.key}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, color: 'var(--ia-fg)' }}>{l.tier}</div>
                  <div style={{ fontSize: 10, color: 'var(--ia-muted)' }}>${l.priceMXN}/mes</div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 120 }}>
                  <div style={{ fontSize: 12, color: urgent ? '#fca5a5' : 'var(--ia-fg)' }}>
                    <Calendar size={10} style={{ display: 'inline', marginRight: 4 }} />
                    {new Date(l.expiresAt).toLocaleDateString('es-MX')}
                  </div>
                  <div style={{ fontSize: 10, color: urgent ? '#fca5a5' : 'var(--ia-muted)' }}>{l.daysRemaining}d restantes</div>
                </div>
                <button onClick={() => extend(l.id, 30)} style={{
                  padding: '6px 10px', fontSize: 11,
                  background: 'rgba(255,255,255,0.04)', color: 'var(--ia-fg)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, cursor: 'pointer',
                }}>+30d</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
