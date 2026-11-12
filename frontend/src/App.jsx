import { Navigate, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import BusinessProfilePage from './pages/BusinessProfilePage';
import ProductsPage from './pages/ProductsPage';
import RequestsPage from './pages/RequestsPage';
import OrdersPage from './pages/OrdersPage';
import OrderDetailsPage from './pages/OrderDetailsPage';
import InvoicesPage from './pages/InvoicesPage';
import NotificationsPage from './pages/NotificationsPage';
import ReturnsPage from './pages/ReturnsPage';
import ComplaintsPage from './pages/ComplaintsPage';
import RefundsPage from './pages/RefundsPage';
import { useAuth } from './context/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { user, authReady } = useAuth();

  if (!authReady) return <div className="loading-state">Checking your session…</div>;
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      {[
        ['/profile', BusinessProfilePage],
        ['/products', ProductsPage],
        ['/requests', RequestsPage],
        ['/orders', OrdersPage],
        ['/invoices', InvoicesPage],
        ['/returns', ReturnsPage],
        ['/complaints', ComplaintsPage],
        ['/refunds', RefundsPage],
        ['/notifications', NotificationsPage],
      ].map(([path, Page]) => (
        <Route key={path} path={path} element={<ProtectedRoute><Page /></ProtectedRoute>} />
      ))}
      <Route path="/orders/:orderId" element={<ProtectedRoute><OrderDetailsPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
