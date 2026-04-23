import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Plus, Download, Loader2 } from 'lucide-react';
import api from '../services/api';

export default function Invoices() {
  const [invoices, setInvoices] = useState(null);
  const [filter, setFilter] = useState('all');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const query = filter === 'all' ? '' : `?status=${filter}`;
    const { data } = await api.request('/invoices' + query);
    setInvoices(data);
  };

  useEffect(() => { load(); }, [filter]);

  const generateBulk = async () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    if (!confirm(`Generar facturas del período ${year}-${String(month).padStart(2, '0')} para TODOS los customers activos?`)) return;

    setBusy(true);
    try {
      const { data } = await api.request('/invoices/generate', {
        method: 'POST',
        body: JSON.stringify({ year, month }),
      });
      setMsg({ type: 'ok', text: `${data.generated} generadas · ${data.skipped} ya existían · ${data.errors?.length || 0} errores` });
      await load();
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(null), 5000);
    }
  };

  const downloadPdf = async (inv) => {
    try {
      const token = api.getToken();
      const res = await fetch(`/api/v1/invoices/${inv.id}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Error al generar PDF');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${inv.numero}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { alert(e.message); }
  };

  if (!invoices) return <div style={{ padding: 40 }}>Cargando...</div>;

  return (
    <div style={{ padding: 32, maxWidth: 1280 }}>
      <header style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileText size={22} style={{ color: 'var(--ia-accent)' }} /> Invoices
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ia-muted)' }}>
            {invoices.length} factura{invoices.length !== 1 ? 's' : ''} · facturación consolidada mensual
          </p>
        </div>
        <button onClick={generateBulk} disabled={busy} className="bp" style={{ fontSize: 13 }}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Generar mes actual
        </button>
      </header>

      {msg && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13,
          background: msg.type === 'ok' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          color: msg.type === 'ok' ? '#6ee7b7' : '#fca5a5',
          border: `1px solid ${msg.type === 'ok' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
        }}>{msg.text}</div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[
          { k: 'all', label: 'Todas' },
          { k: 'draft', label: 'Draft' },
          { k: 'sent', label: 'Enviadas' },
          { k: 'paid', label: 'Pagadas' },
          { k: 'overdue', label: 'Vencidas' },
        ].map((f) => (
          <button key={f.k} onClick={() => setFilter(f.k)} style={{
            padding: '6px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
            background: filter === f.k ? 'var(--ia-accent-soft)' : 'transparent',
            color: filter === f.k ? 'var(--ia-accent)' : 'var(--ia-muted)',
            border: `1px solid ${filter === f.k ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.08)'}`,
          }}>{f.label}</button>
        ))}
      </div>

      {invoices.length === 0 ? (
        <div className="sc" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 15, color: 'var(--ia-fg)', marginBottom: 8 }}>Sin facturas</div>
          <div style={{ fontSize: 12, color: 'var(--ia-muted)' }}>
            Click "Generar mes actual" para crear facturas de todos los customers con módulos activos.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {invoices.map((inv) => {
            const pct = inv.totalMXN > 0 ? Math.min(100, (inv.paidMXN / inv.totalMXN) * 100) : 0;
            const statusColor = {
              draft: '#64748b', sent: '#f59e0b', paid: '#10b981',
              overdue: '#ef4444', cancelled: '#475569',
            }[inv.status] || '#64748b';
            return (
              <div key={inv.id} className="sc" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--ia-accent)', minWidth: 140 }}>{inv.numero}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{inv.customerName}</div>
                  <div style={{ fontSize: 10, color: 'var(--ia-muted)' }}>
                    {new Date(inv.periodStart).toLocaleDateString('es-MX', { year: 'numeric', month: 'long' })}
                    {inv.customerRfc ? ` · ${inv.customerRfc}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 120 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>${inv.totalMXN.toLocaleString('es-MX')}</div>
                  {inv.paidMXN > 0 && (
                    <div style={{ fontSize: 10, color: '#10b981' }}>
                      Pagado ${inv.paidMXN.toLocaleString('es-MX')} ({pct.toFixed(0)}%)
                    </div>
                  )}
                </div>
                <span style={{
                  padding: '3px 10px', fontSize: 10, borderRadius: 10,
                  background: statusColor + '20', color: statusColor,
                  textTransform: 'uppercase', minWidth: 70, textAlign: 'center',
                }}>{inv.status}</span>
                <Link to={`/invoices/${inv.id}`} style={{
                  padding: '6px 10px', fontSize: 11, color: 'var(--ia-fg)',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6, textDecoration: 'none',
                }}>Abrir</Link>
                <button onClick={() => downloadPdf(inv)} title="Descargar PDF"
                  style={{
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6, padding: 6, cursor: 'pointer', color: 'var(--ia-muted)',
                  }}>
                  <Download size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
