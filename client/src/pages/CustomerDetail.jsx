import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Users, Layers } from 'lucide-react';
import { ModuleMatrix } from '@nomadknight/module-matrix';
import api from '../services/api';
import { adminAdapter } from '../services/moduleMatrixAdapter';

export default function CustomerDetail() {
  const { id } = useParams();
  const [customer, setCustomer] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.request(`/customers/${id}`)
      .then(r => setCustomer(r.data))
      .catch(e => setError(e.message));
  }, [id]);

  if (error) return <div style={{ padding: 40, color: '#fca5a5' }}>Error: {error}</div>;
  if (!customer) return <div style={{ padding: 40, color: 'var(--ia-muted)' }}>Cargando...</div>;

  const adapter = adminAdapter(id);

  return (
    <div style={{ padding: 32, maxWidth: 1280 }}>
      <Link to="/customers" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--ia-muted)', fontSize: 12, textDecoration: 'none', marginBottom: 14 }}>
        <ArrowLeft size={14} /> Customers
      </Link>

      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Users size={22} style={{ color: 'var(--ia-accent)' }} /> {customer.legalName}
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ia-muted)' }}>
          {customer.rfc ? `RFC: ${customer.rfc} · ` : ''}{customer.contactEmail || 'sin email'} · status: {customer.status}
        </p>
      </header>

      <div className="sc" style={{ padding: 18, marginBottom: 18 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Layers size={18} style={{ color: '#16a34a' }} />
          Matriz módulos core × verticales
        </h2>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--ia-muted)' }}>
          Click una celda activa/suspendida para acciones super-admin: suspender · reactivar · extender licencia · cambiar tier.
          Las activaciones nuevas las hace el cliente desde su Hub (self-service) o tú via "Vincular módulo" en la lista de Customers.
        </p>
        <ModuleMatrix mode="admin" pricesVisible={true} adapter={adapter} />
      </div>

      <div className="sc" style={{ padding: 18 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600 }}>Módulos vinculados (vista plana)</h2>
        {(!customer.modules || customer.modules.length === 0) ? (
          <div style={{ fontSize: 12, color: 'var(--ia-muted)' }}>Sin módulos · vincular desde la lista Customers</div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
            {customer.modules.map(m => (
              <li key={m.id} style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                <span>
                  <strong style={{ color: 'var(--ia-accent)' }}>{m.moduleCode}</strong>
                  {m.parentVerticalCode && <span style={{ color: 'var(--ia-muted)' }}> × {m.parentVerticalCode}</span>}
                  <span style={{ color: 'var(--ia-muted)', marginLeft: 8 }}>· {m.module?.name}</span>
                </span>
                <span style={{ color: m.status === 'active' ? '#10b981' : '#ef4444' }}>{m.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
