import { Navigate, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import BusinessProfilePage from './pages/BusinessProfilePage';
import ProductsPage from './pages/ProductsPage';
import RequestsPage from './pages/RequestsPage';
import OrdersPage from './pages/OrdersPage';
import InvoicesPage from './pages/InvoicesPage';
import NotificationsPage from './pages/NotificationsPage';
import { useAuth } from './context/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();

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
        ['/notifications', NotificationsPage],
      ].map(([path, Page]) => (
        <Route key={path} path={path} element={<ProtectedRoute><Page /></ProtectedRoute>} />
      ))}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
