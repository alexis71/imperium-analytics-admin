import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Package, Boxes, Key, FileText, Webhook, History, Settings, LogOut, ShieldOff, KeyRound } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

const NAV = [
  { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/customers',    icon: Users,           label: 'Customers' },
  { to: '/verticales',   icon: Package,         label: 'Verticales' },
  { to: '/licenses',     icon: Key,             label: 'Licenses' },
  { to: '/invoices',     icon: FileText,        label: 'Invoices' },
  { to: '/webhooks',     icon: Webhook,         label: 'Webhooks' },
  { to: '/admin-override', icon: ShieldOff,     label: 'Soporte cliente' },
  { to: '/settings',     icon: Settings,        label: 'Settings' },
  { to: '/audit',        icon: History,         label: 'Audit' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{
        width: 240, background: 'var(--ia-surface)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        padding: 20, display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <div className="ia-seal" />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Imperium Analytics</div>
            <div style={{ fontSize: 10, color: 'var(--ia-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Admin</div>
          </div>
        </div>

        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {NAV.map((item) => {
            const Icon = item.icon;
            if (item.disabled) {
              return (
                <div key={item.to} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 6,
                  color: '#4b5563', fontSize: 13,
                  cursor: 'not-allowed',
                }}>
                  <Icon size={16} />
                  <span>{item.label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 9, color: '#475569', textTransform: 'uppercase' }}>{item.phase || 'C.2+'}</span>
                </div>
              );
            }
            return (
              <NavLink key={item.to} to={item.to}
                style={({ isActive }) => ({
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 6,
                  color: isActive ? 'var(--ia-accent)' : 'var(--ia-fg)',
                  background: isActive ? 'var(--ia-accent-soft)' : 'transparent',
                  fontSize: 13, fontWeight: isActive ? 600 : 400,
                  textDecoration: 'none',
                })}>
                <Icon size={16} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--ia-fg)', marginBottom: 2 }}>{user?.name}</div>
          <div style={{ fontSize: 10, color: 'var(--ia-muted)', marginBottom: 10 }}>{user?.email}</div>
          {/* N°66 · link a /change-password (route ya existe fuera de Protected · UI gap cerrado · permite cambio voluntario post-onboarding) */}
          <button onClick={() => nav('/change-password')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12, color: 'var(--ia-muted)',
              background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
              marginBottom: 8,
            }}>
            <KeyRound size={12} /> Cambiar contraseña
          </button>
          <button onClick={async () => { await logout(); nav('/login'); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12, color: 'var(--ia-muted)',
              background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
            }}>
            <LogOut size={12} /> Cerrar sesión
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, overflowY: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}
