import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const links = [
  ['Dashboard', '/dashboard'],
  ['Business profile', '/profile'],
  ['Products', '/products'],
  ['Requests & quotations', '/requests'],
  ['Orders', '/orders'],
  ['Invoices', '/invoices'],
  ['Notifications', '/notifications'],
];

export default function WorkspaceLayout({ title, children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const signOut = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="page-shell dashboard-shell">
      <nav className="topbar">
        <Link className="brand" to="/dashboard">ProcureHub</Link>
        <div className="nav-actions">
          <span className="user-pill">{user?.role}</span>
          <button className="secondary-btn" onClick={signOut}>Logout</button>
        </div>
      </nav>
      <div className="workspace-nav" aria-label="Workspace navigation">
        {links.map(([label, path]) => <Link key={path} to={path}>{label}</Link>)}
      </div>
      <header className="page-header">
        <span className="eyebrow">{user?.role} workspace</span>
        <h1>{title}</h1>
      </header>
      {children}
    </div>
  );
}
