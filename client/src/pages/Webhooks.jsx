import { useEffect, useState, useCallback } from 'react';
import { Webhook, CheckCircle2, AlertTriangle, Eye, RefreshCw, Filter } from 'lucide-react';
import api from '../services/api';

const MODULES = [
  { code: '',     label: 'Todos' },
  { code: 'rt',   label: 'RoundTable' },
  { code: 'kp',   label: 'Kompaws' },
  { code: 'nk',   label: 'NetKnight' },
  { code: 'iahb', label: 'Hub' },
];

export default function Webhooks() {
  const [events, setEvents] = useState(null);
  const [meta, setMeta] = useState(null);
  const [detail, setDetail] = useState(null);
  const [filters, setFilters] = useState({ moduleCode: '', event: '', verified: '', limit: 100 });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, meta } = await api.webhooks.events(filters);
      setEvents(data);
      setMeta(meta);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [autoRefresh, load]);

  const viewDetail = async (id) => {
    const { data } = await api.webhooks.detail(id);
    setDetail(data);
  };

  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const clearFilters = () => setFilters({ moduleCode: '', event: '', verified: '', limit: 100 });

  if (!events) return <div style={{ padding: 40 }}>Cargando...</div>;

  return (
    <div style={{ padding: 32, maxWidth: 1280 }}>
      <header style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Webhook size={22} style={{ color: 'var(--ia-accent)' }} /> Webhooks inbox
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ia-muted)' }}>
            {events.length} de {meta?.total ?? '—'} evento{events.length !== 1 ? 's' : ''}
            {autoRefresh && ' · auto-refresh 10s'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ia-muted)' }}>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto
          </label>
          <button className="bg" onClick={load} disabled={loading} style={{ fontSize: 12 }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </header>

      {/* Chips totales por módulo */}
      {meta?.byModule && Object.keys(meta.byModule).length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {Object.entries(meta.byModule).map(([code, count]) => (
            <button
              key={code}
              onClick={() => setFilter('moduleCode', filters.moduleCode === code ? '' : code)}
              style={{
                fontSize: 11,
                padding: '4px 10px',
                border: '1px solid ' + (filters.moduleCode === code ? 'var(--ia-accent)' : 'rgba(255,255,255,0.1)'),
                borderRadius: 6,
                background: filters.moduleCode === code ? 'var(--ia-accent-soft)' : 'transparent',
                color: filters.moduleCode === code ? 'var(--ia-accent)' : 'var(--ia-muted)',
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {code} · {count}
            </button>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="sc" style={{ padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Filter size={14} style={{ color: 'var(--ia-muted)' }} />
        <select
          value={filters.moduleCode}
          onChange={(e) => setFilter('moduleCode', e.target.value)}
          className="inp"
          style={{ fontSize: 12, width: 130 }}
        >
          {MODULES.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
        </select>
        <input
          type="text"
          placeholder="Buscar evento (ej: project.created)"
          value={filters.event}
          onChange={(e) => setFilter('event', e.target.value)}
          className="inp"
          style={{ fontSize: 12, width: 260 }}
        />
        <select
          value={filters.verified}
          onChange={(e) => setFilter('verified', e.target.value)}
          className="inp"
          style={{ fontSize: 12, width: 130 }}
        >
          <option value="">Todos (firma)</option>
          <option value="true">Sólo verificados</option>
          <option value="false">Sólo no verificados</option>
        </select>
        <select
          value={filters.limit}
          onChange={(e) => setFilter('limit', Number(e.target.value))}
          className="inp"
          style={{ fontSize: 12, width: 100 }}
        >
          <option value={50}>50</option>
          <option value={100}>100</option>
          <option value={250}>250</option>
          <option value={500}>500</option>
        </select>
        {(filters.moduleCode || filters.event || filters.verified) && (
          <button className="bg" onClick={clearFilters} style={{ fontSize: 11 }}>
            Limpiar
          </button>
        )}
      </div>

      {events.length === 0 ? (
        <div className="sc" style={{ padding: 32, textAlign: 'center', color: 'var(--ia-muted)', fontSize: 13 }}>
          Sin eventos con estos filtros.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 4 }}>
          {events.map((e) => (
            <div key={e.id} className="sc" style={{
              padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
              cursor: 'pointer',
            }} onClick={() => viewDetail(e.id)}>
              {e.verified
                ? <CheckCircle2 size={14} style={{ color: '#10b981' }} />
                : <AlertTriangle size={14} style={{ color: '#ef4444' }} />}
              <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--ia-accent-soft)', color: 'var(--ia-accent)', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{e.moduleCode}</span>
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
            <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 10, padding: '2px 8px', background: 'var(--ia-accent-soft)', color: 'var(--ia-accent)', borderRadius: 4, textTransform: 'uppercase' }}>{detail.moduleCode}</span>
              <span style={{ fontWeight: 600 }}>{detail.event}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ia-muted)' }}>{new Date(detail.createdAt).toLocaleString('es-MX')}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--ia-muted)', marginBottom: 12 }}>
              IP: {detail.ip || '—'} · Verified: {detail.verified ? 'sí' : 'NO'} · Processed: {detail.processedAt ? 'sí' : 'no'}
              {detail.error && <div style={{ color: '#fca5a5', marginTop: 4 }}>Error: {detail.error}</div>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ia-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Payload</div>
            <pre style={{ fontSize: 11, background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 6, overflow: 'auto', margin: 0 }}>
              {JSON.stringify(detail.payload, null, 2)}
            </pre>
            {detail.headers && (
              <>
                <div style={{ fontSize: 11, color: 'var(--ia-muted)', marginTop: 14, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Headers</div>
                <pre style={{ fontSize: 10, background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 6, overflow: 'auto', margin: 0 }}>
                  {JSON.stringify(detail.headers, null, 2)}
                </pre>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
