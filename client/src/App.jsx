import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Login from './pages/Login';
import MfaVerify from './pages/MfaVerify';
import MfaSetup from './pages/MfaSetup';
import ChangePassword from './pages/ChangePassword';
import Dashboard from './pages/Dashboard';
import Modules from './pages/Modules';
import Customers from './pages/Customers';
import Licenses from './pages/Licenses';
import Webhooks from './pages/Webhooks';
import AuditLog from './pages/AuditLog';
import Invoices from './pages/Invoices';
import InvoiceDetail from './pages/InvoiceDetail';
import Settings from './pages/Settings';
import Layout from './components/Layout';

function Protected({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div style={{ padding: 40, color: 'var(--ia-muted)' }}>Cargando...</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (user.forcePasswordChange) return <Navigate to="/change-password" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/mfa/verify" element={<MfaVerify />} />
      <Route path="/mfa/setup" element={<MfaSetup />} />
      <Route path="/change-password" element={<ChangePassword />} />

      <Route path="/" element={<Protected><Layout /></Protected>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="customers" element={<Customers />} />
        <Route path="verticales" element={<Modules />} />
        <Route path="modules" element={<Navigate to="/verticales" replace />} />
        <Route path="licenses" element={<Licenses />} />
        <Route path="webhooks" element={<Webhooks />} />
        <Route path="audit" element={<AuditLog />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="invoices/:id" element={<InvoiceDetail />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
