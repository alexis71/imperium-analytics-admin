import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Plus, PauseCircle, PlayCircle, Link2, Unlink, X, ExternalLink } from 'lucide-react';
import api from '../services/api';

export default function Customers() {
  const [customers, setCustomers] = useState(null);
  const [modules, setModules] = useState([]);
  const [msg, setMsg] = useState(null);
  const [attachFor, setAttachFor] = useState(null);
  const [form, setForm] = useState({ moduleCode: '', tenantIdInModule: '', tenantSlug: '', tier: 'herald', priceMXN: 399, licenseDays: 30 });
  const [availableTenants, setAvailableTenants] = useState(null);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [err, setErr] = useState(null);

  const load = async () => {
    const { data } = await api.request('/customers');
    setCustomers(data);
  };

  useEffect(() => {
    load();
    api.request('/modules').then((r) => setModules(r.data)).catch(() => {});
  }, []);

  const toggleModuleStatus = async (customerId, moduleCode, currentStatus) => {
    const action = currentStatus === 'suspended' ? 'unsuspend' : 'suspend';
    if (!confirm(`¿${action === 'suspend' ? 'Suspender' : 'Reactivar'} módulo ${moduleCode}?`)) return;
    try {
      await api.request(`/customers/${customerId}/modules/${moduleCode}/${action}`, {
        method: 'PATCH',
        body: JSON.stringify({ reason: 'Admin action' }),
      });
      setMsg({ type: 'ok', text: `Módulo ${action}ed en ${moduleCode}` });
      await load();
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    } finally { setTimeout(() => setMsg(null), 4000); }
  };

  const detachModule = async (customerId, moduleCode, customerName) => {
    if (!confirm(`⚠️ Desvincular módulo ${moduleCode.toUpperCase()} de ${customerName}?\n\nNo borra el tenant del vertical · solo rompe el vínculo en Admin.`)) return;
    try {
      await api.request(`/customers/${customerId}/modules/${moduleCode}`, { method: 'DELETE' });
      setMsg({ type: 'ok', text: `Módulo ${moduleCode} desvinculado` });
      await load();
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    } finally { setTimeout(() => setMsg(null), 4000); }
  };

  const attachModule = async (e) => {
    e.preventDefault();
    setErr(null);
    try {
      await api.request(`/customers/${attachFor.id}/modules`, {
        method: 'POST',
        body: JSON.stringify({
          moduleCode: form.moduleCode,
          tenantIdInModule: form.tenantIdInModule,
          tenantSlug: form.tenantSlug || null,
          tier: form.tier,
          priceMXN: Number(form.priceMXN || 0),
          licenseDays: Number(form.licenseDays || 30),
        }),
      });
      setMsg({ type: 'ok', text: `Módulo ${form.moduleCode} vinculado a ${attachFor.legalName}` });
      setAttachFor(null);
      setForm({ moduleCode: '', tenantIdInModule: '', tenantSlug: '', tier: 'herald', priceMXN: 399, licenseDays: 30 });
      setAvailableTenants(null);
      await load();
      setTimeout(() => setMsg(null), 4000);
    } catch (e) { setErr(e.message); }
  };

  const availableModules = (customer) => {
    const existing = new Set(customer.modules.map((m) => m.moduleCode));
    return modules.filter((m) => m.status === 'active' && !existing.has(m.code));
  };

  const onModuleCodeChange = async (code) => {
    setForm((f) => ({ ...f, moduleCode: code, tenantIdInModule: '', tenantSlug: '' }));
    if (!code) { setAvailableTenants(null); return; }
    setLoadingTenants(true);
    try {
      const { data } = await api.request(`/customers/available-tenants/${code}`);
      setAvailableTenants(data);
    } catch (e) {
      setErr(e.message);
    } finally { setLoadingTenants(false); }
  };

  const selectTenant = (t) => {
    setForm((f) => ({ ...f, tenantIdInModule: t.id, tenantSlug: t.slug || '', tier: t.tier || f.tier }));
  };

  if (!customers) return <div style={{ padding: 40, color: 'var(--ia-muted)' }}>Cargando...</div>;

  return (
    <div style={{ padding: 32, maxWidth: 1280 }}>
      <header style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Users size={22} style={{ color: 'var(--ia-accent)' }} /> Customers
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ia-muted)' }}>
            {customers.length} cliente{customers.length !== 1 ? 's' : ''} · cross-vertical
          </p>
        </div>
      </header>

      {msg && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13,
          background: msg.type === 'ok' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          color: msg.type === 'ok' ? '#6ee7b7' : '#fca5a5',
          border: `1px solid ${msg.type === 'ok' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
        }}>{msg.text}</div>
      )}

      {customers.length === 0 ? (
        <div className="sc" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 15, color: 'var(--ia-fg)', marginBottom: 8 }}>Sin customers aún</div>
          <div style={{ fontSize: 12, color: 'var(--ia-muted)' }}>
            Arranca RT · da signup a un tenant · o click "Sync tenants" en Modules
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {customers.map((c) => (
            <div key={c.id} className="sc" style={{ padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>{c.legalName}</div>
                  <div style={{ fontSize: 11, color: 'var(--ia-muted)' }}>
                    {c.rfc ? `RFC: ${c.rfc} · ` : ''}{c.contactEmail || 'sin email'}
                  </div>
                </div>
                <span style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 10,
                  background: c.status === 'active' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                  color: c.status === 'active' ? '#10b981' : '#ef4444',
                  textTransform: 'uppercase',
                }}>{c.status}</span>
                <Link to={`/customers/${c.id}`} title="Ver detalle + matriz cores"
                  style={{ marginLeft: 10, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 11, background: 'var(--ia-accent-soft)', color: 'var(--ia-accent)', border: '1px solid rgba(124,58,237,0.4)', borderRadius: 6, textDecoration: 'none' }}>
                  <ExternalLink size={11} /> Matriz
                </Link>
              </div>

              {c.modules.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {c.modules.map((m) => (
                    <div key={m.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 10px', borderRadius: 6,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      fontSize: 12,
                    }}>
                      <span style={{ color: 'var(--ia-accent)', textTransform: 'uppercase', fontSize: 10 }}>{m.moduleCode}</span>
                      <span style={{ color: 'var(--ia-fg)' }}>{m.moduleName}</span>
                      {m.currentLicense && (
                        <span style={{ color: 'var(--ia-muted)', fontSize: 10 }}>
                          · {m.currentLicense.tier} · {Math.ceil((new Date(m.currentLicense.expiresAt) - Date.now()) / 86400000)}d
                        </span>
                      )}
                      <span style={{
                        padding: '1px 6px', fontSize: 9, borderRadius: 3, textTransform: 'uppercase',
                        background: m.status === 'active' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                        color: m.status === 'active' ? '#10b981' : '#ef4444',
                      }}>{m.status}</span>
                      <button onClick={() => toggleModuleStatus(c.id, m.moduleCode, m.status)}
                        title={m.status === 'active' ? 'Suspender' : 'Reactivar'}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--ia-muted)' }}>
                        {m.status === 'active' ? <PauseCircle size={14} /> : <PlayCircle size={14} />}
                      </button>
                      <button onClick={() => detachModule(c.id, m.moduleCode, c.legalName)}
                        title="Desvincular módulo"
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: '#fca5a5' }}>
                        <Unlink size={13} />
                      </button>
                    </div>
                  ))}
                  {availableModules(c).length > 0 && (
                    <button onClick={() => setAttachFor(c)} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 10px', borderRadius: 6,
                      background: 'var(--ia-accent-soft)',
                      border: '1px dashed rgba(124,58,237,0.4)',
                      color: 'var(--ia-accent)', fontSize: 12, cursor: 'pointer',
                    }}>
                      <Link2 size={12} /> Vincular módulo
                    </button>
                  )}
                </div>
              )}

              {c.modules.length === 0 && availableModules(c).length > 0 && (
                <button onClick={() => setAttachFor(c)} style={{
                  marginTop: 8, fontSize: 12, padding: '6px 12px', cursor: 'pointer',
                  background: 'var(--ia-accent-soft)', border: '1px dashed rgba(124,58,237,0.4)',
                  color: 'var(--ia-accent)', borderRadius: 6,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}>
                  <Link2 size={12} /> Vincular primer módulo
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {attachFor && (
        <div onClick={() => setAttachFor(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100,
        }}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={attachModule} className="sc modal-panel" style={{ width: 460, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>Vincular módulo</h3>
              <button type="button" onClick={() => setAttachFor(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ia-muted)' }}><X size={18} /></button>
            </div>

            <p style={{ fontSize: 12, color: 'var(--ia-muted)', margin: '0 0 14px' }}>
              Customer: <strong style={{ color: 'var(--ia-fg)' }}>{attachFor.legalName}</strong>
            </p>

            <label className="lbl">Módulo (vertical)</label>
            <select className="inp" value={form.moduleCode} onChange={(e) => onModuleCodeChange(e.target.value)} required style={{ marginBottom: 12 }}>
              <option value="">Seleccionar...</option>
              {availableModules(attachFor).map((m) => (
                <option key={m.code} value={m.code}>{m.name} ({m.code})</option>
              ))}
            </select>

            {form.moduleCode && (
              <>
                <label className="lbl">Tenant del vertical *</label>
                {loadingTenants ? (
                  <div style={{ padding: 10, fontSize: 12, color: 'var(--ia-muted)' }}>Cargando tenants de {form.moduleCode}...</div>
                ) : availableTenants === null ? null : availableTenants.available.length === 0 && availableTenants.taken.length === 0 ? (
                  <div style={{ padding: 10, fontSize: 12, color: 'var(--ia-muted)', background: 'rgba(255,255,255,0.03)', borderRadius: 6, marginBottom: 12 }}>
                    El vertical <strong>{form.moduleCode}</strong> no tiene tenants todavía. Un admin del vertical debe hacer signup primero.
                  </div>
                ) : (
                  <div style={{ maxHeight: 180, overflowY: 'auto', marginBottom: 12, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
                    {availableTenants.available.length === 0 && (
                      <div style={{ padding: '10px 12px', fontSize: 11, color: '#fbbf24', background: 'rgba(245,158,11,0.1)' }}>
                        Todos los tenants de {form.moduleCode} ya están vinculados a otros customers.
                      </div>
                    )}
                    {availableTenants.available.map((t) => (
                      <div key={t.id} onClick={() => selectTenant(t)} style={{
                        padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)',
                        background: form.tenantIdInModule === t.id ? 'var(--ia-accent-soft)' : 'transparent',
                        color: form.tenantIdInModule === t.id ? 'var(--ia-accent)' : 'var(--ia-fg)',
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{t.name}</div>
                        <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace' }}>
                          {t.slug} · tier {t.tier} · {t.status}
                        </div>
                      </div>
                    ))}
                    {availableTenants.taken.length > 0 && (
                      <details style={{ padding: '8px 12px', fontSize: 10, color: '#64748b', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <summary style={{ cursor: 'pointer' }}>{availableTenants.taken.length} tenant(s) ya vinculados (click para ver)</summary>
                        {availableTenants.taken.map((t) => (
                          <div key={t.id} style={{ padding: '4px 0', fontSize: 10, color: '#475569' }}>
                            {t.name} · {t.slug}
                          </div>
                        ))}
                      </details>
                    )}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                  <div>
                    <label className="lbl">Tier</label>
                    <select className="inp" value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}>
                      <option value="trial">Trial</option>
                      <option value="scribe">Scribe</option>
                      <option value="herald">Herald</option>
                      <option value="steward">Steward</option>
                      <option value="regent">Regent</option>
                    </select>
                  </div>
                  <div>
                    <label className="lbl">Precio MXN</label>
                    <input type="number" className="inp" value={form.priceMXN} onChange={(e) => setForm({ ...form, priceMXN: e.target.value })} />
                  </div>
                  <div>
                    <label className="lbl">Días</label>
                    <input type="number" className="inp" value={form.licenseDays} onChange={(e) => setForm({ ...form, licenseDays: e.target.value })} />
                  </div>
                </div>
              </>
            )}

            {err && <div style={{ color: '#fca5a5', fontSize: 12, marginBottom: 12 }}>{err}</div>}

            <button type="submit" className="bp" style={{ width: '100%', justifyContent: 'center' }} disabled={!form.tenantIdInModule}>
              Vincular + crear licencia
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
