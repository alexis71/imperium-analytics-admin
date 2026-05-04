import { useEffect, useState, useCallback } from 'react';
import { History, Eye, RefreshCw, Filter, User as UserIcon, Server, Download } from 'lucide-react';
import api from '../services/api';

const MODULES = [
  { code: '',     label: 'Todos' },
  { code: 'rt',   label: 'RoundTable' },
  { code: 'kp',   label: 'Kompaws' },
  { code: 'nk',   label: 'NetKnight' },
  { code: 'iahb', label: 'Hub' },
];

export default function AuditLog() {
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [detail, setDetail] = useState(null);
  const [filters, setFilters] = useState({ action: '', entity: '', moduleCode: '', limit: 100 });
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, meta } = await api.audit.list(filters);
      setRows(data);
      setMeta(meta);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [autoRefresh, load]);

  const viewDetail = async (id) => {
    const { data } = await api.audit.detail(id);
    setDetail(data);
  };

  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const clearFilters = () => setFilters({ action: '', entity: '', moduleCode: '', limit: 100 });

  const exportCsv = async () => {
    // Fetch con auth y descarga vía Blob (no se puede `<a download>` porque endpoint requiere Bearer)
    const params = new URLSearchParams(
      Object.entries(filters).filter(([k, v]) => v && k !== 'limit')
    ).toString();
    const r = await api.request(`/audit-log/export.csv${params ? '?' + params : ''}`, { rawBlob: true });
    const url = URL.createObjectURL(r);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-${new Date().toISOString().substring(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (!rows) return <div style={{ padding: 40 }}>Cargando...</div>;

  return (
    <div style={{ padding: 32, maxWidth: 1280 }}>
      <header style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
            <History size={22} style={{ color: 'var(--ia-accent)' }} /> Audit log
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ia-muted)' }}>
            {rows.length} de {meta?.total ?? '—'} registro{rows.length !== 1 ? 's' : ''}
            {autoRefresh && ' · auto-refresh 15s'}
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
          <button
            type="button"
            onClick={exportCsv}
            className="bg"
            style={{ fontSize: 12 }}
            title="Exportar audit log filtrado a CSV (compliance LFPDPPP)"
          >
            <Download size={13} /> CSV
          </button>
        </div>
      </header>

      {/* Chips top actions */}
      {meta?.topActions && meta.topActions.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {meta.topActions.map((a) => (
            <button
              key={a.action}
              onClick={() => setFilter('action', filters.action === a.action ? '' : a.action)}
              style={{
                fontSize: 11,
                padding: '4px 10px',
                border: '1px solid ' + (filters.action === a.action ? 'var(--ia-accent)' : 'rgba(255,255,255,0.1)'),
                borderRadius: 6,
                background: filters.action === a.action ? 'var(--ia-accent-soft)' : 'transparent',
                color: filters.action === a.action ? 'var(--ia-accent)' : 'var(--ia-muted)',
                cursor: 'pointer',
                fontFamily: 'monospace',
              }}
            >
              {a.action} · {a.count}
            </button>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="sc" style={{ padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Filter size={14} style={{ color: 'var(--ia-muted)' }} />
        <input
          type="text"
          placeholder="Acción (ej: customer.create)"
          value={filters.action}
          onChange={(e) => setFilter('action', e.target.value)}
          className="inp"
          style={{ fontSize: 12, width: 220 }}
        />
        <input
          type="text"
          placeholder="Entidad (ej: Customer)"
          value={filters.entity}
          onChange={(e) => setFilter('entity', e.target.value)}
          className="inp"
          style={{ fontSize: 12, width: 160 }}
        />
        <select
          value={filters.moduleCode}
          onChange={(e) => setFilter('moduleCode', e.target.value)}
          className="inp"
          style={{ fontSize: 12, width: 130 }}
        >
          {MODULES.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
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
        {(filters.action || filters.entity || filters.moduleCode) && (
          <button className="bg" onClick={clearFilters} style={{ fontSize: 11 }}>
            Limpiar
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="sc" style={{ padding: 32, textAlign: 'center', color: 'var(--ia-muted)', fontSize: 13 }}>
          Sin registros con estos filtros.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 4 }}>
          {rows.map((r) => (
            <div key={r.id} className="sc" style={{
              padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
              cursor: 'pointer',
            }} onClick={() => viewDetail(r.id)}>
              {r.user ? <UserIcon size={13} style={{ color: 'var(--ia-accent)' }} /> : <Server size={13} style={{ color: '#64748b' }} />}
              <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.action}</span>
              {r.entity && <span style={{ fontSize: 11, color: 'var(--ia-muted)' }}>· {r.entity}{r.entityId ? ` ${r.entityId.substring(0, 8)}` : ''}</span>}
              {r.moduleCode && <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--ia-accent-soft)', color: 'var(--ia-accent)', borderRadius: 4, textTransform: 'uppercase' }}>{r.moduleCode}</span>}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ia-muted)' }}>
                {r.user?.email || 'sistema'} · {new Date(r.createdAt).toLocaleString('es-MX')}
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
              <History size={16} style={{ color: 'var(--ia-accent)' }} />
              <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{detail.action}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ia-muted)' }}>{new Date(detail.createdAt).toLocaleString('es-MX')}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--ia-muted)', marginBottom: 12, lineHeight: 1.6 }}>
              <div>Autor: <strong style={{ color: 'var(--ia-fg)' }}>{detail.user?.email || detail.user?.name || 'sistema (null userId)'}</strong></div>
              {detail.entity && <div>Entidad: <code>{detail.entity}</code>{detail.entityId && <code> · {detail.entityId}</code>}</div>}
              {detail.moduleCode && <div>Módulo: <code>{detail.moduleCode}</code></div>}
              {detail.customerId && <div>Customer: <code>{detail.customerId}</code></div>}
              {detail.ipAddress && <div>IP: <code>{detail.ipAddress}</code></div>}
              {detail.userAgent && <div style={{ wordBreak: 'break-all' }}>UA: <code style={{ fontSize: 10 }}>{detail.userAgent}</code></div>}
            </div>
            {detail.metadata && (
              <>
                <div style={{ fontSize: 11, color: 'var(--ia-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Metadata</div>
                <pre style={{ fontSize: 11, background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 6, overflow: 'auto', margin: 0 }}>
                  {JSON.stringify(detail.metadata, null, 2)}
                </pre>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
