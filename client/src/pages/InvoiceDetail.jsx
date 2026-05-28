import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Download, DollarSign, Plus, X, RefreshCcw, Loader2, Webhook, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '../services/api';

export default function InvoiceDetail() {
  const { id } = useParams();
  const [inv, setInv] = useState(null);
  const [payModal, setPayModal] = useState(false);
  const [form, setForm] = useState({ amountMXN: '', method: 'transferencia', reference: '', notes: '' });
  const [err, setErr] = useState(null);
  // N°80 C2 · manual reconcile + webhooks de este cliente
  const [webhooks, setWebhooks] = useState(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileMsg, setReconcileMsg] = useState(null);

  const load = async () => {
    const { data } = await api.request(`/invoices/${id}`);
    setInv(data);
    // N°80 C2 · cargar PaymentEvents del customer vía proxy a Hub
    if (data?.customer?.id) {
      try {
        const { data: ev } = await api.request(`/billing-proxy/customer-webhooks/${data.customer.id}`);
        setWebhooks(ev);
      } catch (e) { setWebhooks({ error: e.message }); }
    }
  };

  useEffect(() => { load(); }, [id]);

  // N°80 C2 · forzar reconcile (cron-equivalent on-demand)
  const forceReconcile = async () => {
    setReconciling(true); setReconcileMsg(null);
    try {
      const { data } = await api.request('/billing-proxy/reconcile', { method: 'POST' });
      setReconcileMsg({ type: 'ok', text: `Reconcile · ${data.matched} matched · ${data.skipped} skip · ${data.checked} revisados` });
      await load();
    } catch (e) {
      setReconcileMsg({ type: 'err', text: e.message });
    } finally {
      setReconciling(false);
      setTimeout(() => setReconcileMsg(null), 6000);
    }
  };

  const registerPayment = async (e) => {
    e.preventDefault();
    setErr(null);
    try {
      await api.request(`/invoices/${id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amountMXN: Number(form.amountMXN),
          method: form.method,
          reference: form.reference || null,
          notes: form.notes || null,
        }),
      });
      setPayModal(false);
      setForm({ amountMXN: '', method: 'transferencia', reference: '', notes: '' });
      await load();
    } catch (e) { setErr(e.message); }
  };

  const downloadPdf = async () => {
    const token = api.getToken();
    const res = await fetch(`/api/v1/invoices/${id}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return alert('Error PDF');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${inv.numero}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!inv) return <div style={{ padding: 40 }}>Cargando...</div>;

  const items = Array.isArray(inv.items) ? inv.items : [];
  const paidTotal = inv.payments.reduce((s, p) => s + p.amountMXN, 0);
  const remaining = inv.totalMXN - paidTotal;

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <Link to="/invoices" style={{ fontSize: 12, color: 'var(--ia-muted)', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 16, textDecoration: 'none' }}>
        <ArrowLeft size={12} /> Invoices
      </Link>

      <div className="sc" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--ia-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Factura</div>
            <div style={{ fontFamily: 'monospace', fontSize: 22, color: 'var(--ia-accent)' }}>{inv.numero}</div>
            <div style={{ fontSize: 13, color: 'var(--ia-fg)', marginTop: 10 }}>
              <strong>{inv.customer.legalName}</strong>{inv.customer.rfc ? ` · RFC ${inv.customer.rfc}` : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 32, fontWeight: 600 }}>${inv.totalMXN.toLocaleString('es-MX')}</div>
            <span style={{
              padding: '4px 12px', fontSize: 11, borderRadius: 10, textTransform: 'uppercase',
              background: { draft: 'rgba(100,116,139,0.2)', sent: 'rgba(245,158,11,0.2)', paid: 'rgba(16,185,129,0.2)', overdue: 'rgba(239,68,68,0.2)' }[inv.status] || 'rgba(100,116,139,0.2)',
              color: { draft: '#94a3b8', sent: '#fbbf24', paid: '#34d399', overdue: '#fca5a5' }[inv.status] || '#94a3b8',
            }}>{inv.status}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--ia-muted)', marginBottom: 20, flexWrap: 'wrap' }}>
          <div>Período: <strong style={{ color: 'var(--ia-fg)' }}>{new Date(inv.periodStart).toLocaleDateString('es-MX', { year: 'numeric', month: 'long' })}</strong></div>
          <div>Emitida: <strong style={{ color: 'var(--ia-fg)' }}>{inv.issuedAt ? new Date(inv.issuedAt).toLocaleDateString('es-MX') : '—'}</strong></div>
          <div>Vence: <strong style={{ color: 'var(--ia-fg)' }}>{inv.dueAt ? new Date(inv.dueAt).toLocaleDateString('es-MX') : '—'}</strong></div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={downloadPdf} className="bp" style={{ fontSize: 13 }}>
            <Download size={13} /> PDF
          </button>
          {inv.status !== 'paid' && inv.status !== 'cancelled' && (
            <button onClick={() => { setForm((f) => ({ ...f, amountMXN: String(remaining) })); setPayModal(true); }}
              style={{
                fontSize: 13, padding: '10px 16px',
                background: 'rgba(16,185,129,0.15)', color: '#34d399',
                border: '1px solid rgba(16,185,129,0.4)', borderRadius: 8,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
              <Plus size={13} /> Registrar pago
            </button>
          )}
        </div>
      </div>

      <div className="sc" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--ia-muted)', textTransform: 'uppercase', marginBottom: 12 }}>Items</div>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 500, color: 'var(--ia-muted)' }}>Descripción</th>
              <th style={{ textAlign: 'right', padding: '8px 0', color: 'var(--ia-muted)' }}>Cant</th>
              <th style={{ textAlign: 'right', padding: '8px 0', color: 'var(--ia-muted)' }}>P.U.</th>
              <th style={{ textAlign: 'right', padding: '8px 0', color: 'var(--ia-muted)' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <td style={{ padding: '10px 0' }}>{it.description}</td>
                <td style={{ textAlign: 'right' }}>{it.quantity}</td>
                <td style={{ textAlign: 'right' }}>${(it.unitPriceMXN || 0).toLocaleString('es-MX')}</td>
                <td style={{ textAlign: 'right', fontWeight: 500 }}>${(it.totalMXN || 0).toLocaleString('es-MX')}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, fontSize: 13 }}>
          <div style={{ display: 'flex', gap: 40 }}>
            <span style={{ color: 'var(--ia-muted)' }}>Subtotal</span>
            <span>${inv.subtotalMXN.toLocaleString('es-MX')}</span>
          </div>
          <div style={{ display: 'flex', gap: 40 }}>
            <span style={{ color: 'var(--ia-muted)' }}>IVA 16%</span>
            <span>${inv.ivaMXN.toLocaleString('es-MX')}</span>
          </div>
          <div style={{ display: 'flex', gap: 40, fontSize: 15, fontWeight: 600, paddingTop: 8, borderTop: '1px solid var(--ia-accent)' }}>
            <span>Total</span>
            <span style={{ color: 'var(--ia-accent)' }}>${inv.totalMXN.toLocaleString('es-MX')}</span>
          </div>
        </div>
      </div>

      {inv.payments.length > 0 && (
        <div className="sc" style={{ padding: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--ia-muted)', textTransform: 'uppercase', marginBottom: 12 }}>
            Pagos ({inv.payments.length}) · ${paidTotal.toLocaleString('es-MX')} de ${inv.totalMXN.toLocaleString('es-MX')}
          </div>
          {inv.payments.map((p) => (
            <div key={p.id} style={{ display: 'flex', gap: 12, fontSize: 13, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
              <DollarSign size={14} style={{ color: '#10b981', marginTop: 2 }} />
              <div style={{ flex: 1 }}>
                <div>${p.amountMXN.toLocaleString('es-MX')} · {p.method}</div>
                {p.reference && <div style={{ fontSize: 11, color: 'var(--ia-muted)' }}>Ref: {p.reference}</div>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ia-muted)' }}>{new Date(p.paidAt).toLocaleDateString('es-MX')}</div>
            </div>
          ))}
        </div>
      )}

      {/* N°80 C2 · Webhooks del cliente + forzar reconcile */}
      <div className="sc" style={{ padding: 20, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--ia-muted)', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Webhook size={13} /> Pagos vía webhook (MP / Stripe)
          </div>
          <button onClick={forceReconcile} disabled={reconciling}
            style={{
              fontSize: 12, padding: '6px 12px', borderRadius: 6,
              background: 'rgba(124,58,237,0.12)', color: 'var(--ia-accent)',
              border: '1px solid rgba(124,58,237,0.35)', cursor: reconciling ? 'wait' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
            title="Fuerza un pase de reconciliación en Hub · matchea PaymentEvents pendientes con invoices">
            {reconciling ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />}
            {reconciling ? 'Reconciliando…' : 'Forzar reconciliación'}
          </button>
        </div>

        {reconcileMsg && (
          <div style={{
            padding: '8px 12px', borderRadius: 6, marginBottom: 10, fontSize: 12,
            background: reconcileMsg.type === 'ok' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
            color: reconcileMsg.type === 'ok' ? '#6ee7b7' : '#fca5a5',
            border: `1px solid ${reconcileMsg.type === 'ok' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}>{reconcileMsg.text}</div>
        )}

        {webhooks?.error ? (
          <div style={{ fontSize: 12, color: '#fca5a5', display: 'flex', gap: 6, alignItems: 'center' }}>
            <AlertCircle size={13} /> Hub no accesible: {webhooks.error}
          </div>
        ) : !webhooks ? (
          <div style={{ fontSize: 12, color: 'var(--ia-muted)' }}>Cargando webhooks…</div>
        ) : webhooks.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--ia-muted)' }}>
            Sin PaymentEvents para este cliente todavía · llegan cuando MP/Stripe notifican un pago.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {webhooks.map((w) => {
              const matchedThis = w.matchedInvoiceNumero === inv.numero;
              return (
                <div key={w.id} style={{
                  display: 'flex', gap: 10, alignItems: 'center', fontSize: 12,
                  padding: '8px 10px', borderRadius: 6,
                  background: matchedThis ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${matchedThis ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.05)'}`,
                }}>
                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'rgba(124,58,237,0.15)', color: 'var(--ia-accent)', textTransform: 'uppercase' }}>{w.provider}</span>
                  <span style={{ fontWeight: 500 }}>${(w.amountMxn ?? 0).toLocaleString('es-MX')}</span>
                  <span style={{ color: 'var(--ia-muted)' }}>{w.status || '—'}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ia-muted)' }}>
                    {w.reconciledAt
                      ? <span style={{ color: matchedThis ? '#34d399' : '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <CheckCircle2 size={11} /> {w.matchedInvoiceNumero || 'reconciled'}
                        </span>
                      : <span style={{ color: '#fbbf24' }}>{w.reconcileSkipReason ? 'skip: ' + w.reconcileSkipReason.slice(0, 30) : 'pendiente'}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {payModal && (
        <div onClick={() => setPayModal(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100,
        }}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={registerPayment}
            className="sc" style={{ width: 400, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Registrar pago</h3>
              <button type="button" onClick={() => setPayModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--ia-muted)', cursor: 'pointer' }}><X size={16} /></button>
            </div>

            <label className="lbl">Monto MXN</label>
            <input type="number" min="1" className="inp" value={form.amountMXN} onChange={(e) => setForm({ ...form, amountMXN: e.target.value })} required style={{ marginBottom: 12 }} />

            <label className="lbl">Método</label>
            <select className="inp" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} style={{ marginBottom: 12 }}>
              <option value="transferencia">Transferencia</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="efectivo">Efectivo</option>
              <option value="mercadopago">MercadoPago</option>
              <option value="stripe">Stripe</option>
              <option value="otro">Otro</option>
            </select>

            <label className="lbl">Referencia (opcional)</label>
            <input type="text" className="inp" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="folio, últimos 4, etc." style={{ marginBottom: 12 }} />

            <label className="lbl">Notas (opcional)</label>
            <input type="text" className="inp" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ marginBottom: 18 }} />

            {err && <div style={{ color: '#fca5a5', fontSize: 12, marginBottom: 12 }}>{err}</div>}

            <button type="submit" className="bp" style={{ width: '100%', justifyContent: 'center' }}>Registrar</button>
          </form>
        </div>
      )}
    </div>
  );
}
