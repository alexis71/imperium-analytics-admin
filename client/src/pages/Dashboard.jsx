import { useEffect, useState } from 'react';
import { Users, Package, Key, Webhook, AlertTriangle, DollarSign, TrendingUp, FileClock } from 'lucide-react';
import api from '../services/api';

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.dashboard.stats().then((r) => setData(r.data)).catch(() => {});
  }, []);

  const k = data?.kpis || {};

  return (
    <div style={{ padding: 32, maxWidth: 1280 }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>Dashboard</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ia-muted)' }}>
          Vista cross-vertical · Imperium Analytics Admin
        </p>
      </header>

      {/* Financial KPIs · N°80 B3 · agrega trend mes vs anterior + reconciliations signal */}
      <div style={{ fontSize: 11, color: 'var(--ia-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Financiero</div>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Kpi icon={TrendingUp} label="MRR · activo" value={`$${(k.mrrMXN ?? 0).toLocaleString('es-MX')}`} accent />
        <Kpi
          icon={DollarSign}
          label="Facturado mes actual"
          value={`$${(k.monthInvoicedMXN ?? 0).toLocaleString('es-MX')}`}
          delta={k.invoicedDeltaPct}
          deltaSub={`vs $${(k.prevMonthInvoicedMXN ?? 0).toLocaleString('es-MX')} mes pasado`}
        />
        <Kpi
          icon={DollarSign}
          label="Pagado mes actual"
          value={`$${(k.monthPaidMXN ?? 0).toLocaleString('es-MX')}`}
          delta={k.paidDeltaPct}
          deltaSub={`${k.paidInvoicesThisMonth ?? 0} facturas pagadas este mes`}
          success
        />
        <Kpi icon={FileClock} label="Facturas por cobrar" value={k.unpaidInvoices ?? 0} warn={(k.unpaidInvoices ?? 0) > 0} />
      </section>

      {/* Operativo */}
      <div style={{ fontSize: 11, color: 'var(--ia-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Operativo</div>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 28 }}>
        <Kpi icon={Users} label="Customers activos" value={k.customers ?? '—'} />
        <Kpi icon={Package} label="Verticales" value={k.modules ?? '—'} />
        <Kpi icon={Key} label="Licencias activas" value={k.licenses ?? '—'} />
        <Kpi icon={Webhook} label="Webhooks totales" value={k.webhooks ?? '—'} />
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 14, color: 'var(--ia-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          Eventos recientes
        </h2>
        <div className="sc" style={{ padding: 16 }}>
          {(data?.recentEvents?.length ?? 0) === 0 ? (
            <div style={{ color: 'var(--ia-muted)', fontSize: 13, padding: 12 }}>
              Sin eventos aún.
            </div>
          ) : (
            data.recentEvents.map((e) => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', fontSize: 13 }}>
                <span style={{ padding: '2px 6px', background: 'var(--ia-accent-soft)', color: 'var(--ia-accent)', borderRadius: 4, fontSize: 11, textTransform: 'uppercase' }}>{e.moduleCode}</span>
                <span>{e.event}</span>
                <span style={{ marginLeft: 'auto', color: 'var(--ia-muted)', fontSize: 11 }}>
                  {new Date(e.createdAt).toLocaleString('es-MX')}
                </span>
                {!e.verified && <AlertTriangle size={14} style={{ color: '#ef4444' }} />}
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 14, color: 'var(--ia-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          Próximas expiraciones (30d)
        </h2>
        <div className="sc" style={{ padding: 16 }}>
          {(data?.upcomingExpirations?.length ?? 0) === 0 ? (
            <div style={{ color: 'var(--ia-muted)', fontSize: 13, padding: 12 }}>
              Ninguna licencia expira en los próximos 30 días.
            </div>
          ) : (
            data.upcomingExpirations.map((l) => (
              <div key={l.id} style={{ display: 'flex', padding: '8px 0', fontSize: 13, gap: 10 }}>
                <span style={{ fontWeight: 500 }}>{l.customerName}</span>
                <span style={{ color: 'var(--ia-muted)' }}>· {l.moduleName}</span>
                <span style={{ marginLeft: 'auto', color: l.daysRemaining < 7 ? '#fca5a5' : 'var(--ia-muted)' }}>
                  {l.daysRemaining}d
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, accent, success, warn, delta, deltaSub }) {
  const color = accent ? 'var(--ia-accent)' : success ? '#10b981' : warn ? '#f59e0b' : 'var(--ia-accent)';
  // N°80 B3 · delta = % change vs prev period (null = sin comparativo)
  const hasDelta = typeof delta === 'number';
  const isUp = delta > 0;
  const isDown = delta < 0;
  const deltaColor = isUp ? '#10b981' : isDown ? '#fca5a5' : 'var(--ia-muted)';
  return (
    <div className="sc" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Icon size={14} style={{ color }} />
        <span style={{ fontSize: 10, color: 'var(--ia-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, color: warn ? '#fbbf24' : 'var(--ia-fg)' }}>{value}</div>
      {(hasDelta || deltaSub) && (
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 6 }}>
          {hasDelta && (
            <span style={{ fontSize: 10, fontWeight: 600, color: deltaColor }}>
              {isUp ? '↑' : isDown ? '↓' : '='} {Math.abs(delta)}%
            </span>
          )}
          {deltaSub && (
            <span style={{ fontSize: 9, color: 'var(--ia-muted)' }}>{deltaSub}</span>
          )}
        </div>
      )}
    </div>
  );
}
