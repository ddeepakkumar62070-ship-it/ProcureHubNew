import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState({ summary: {}, products: [], requests: [], quotations: [], orders: [], reviews: [] });
  const [reviews, setReviews] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryName, setCategoryName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    if (!user) return;
    setErrorMessage('');
    try {
      const calls = [
        api.get(`/dashboard/${String(user.role).toLowerCase()}`),
        api.get('/reviews'),
      ];
      if (user.role === 'ADMIN') calls.push(api.get('/categories?includeInactive=true'));
      const [response, reviewResponse, categoryResponse] = await Promise.all(calls);
      setData(response.data);
      setReviews(reviewResponse.data.reviews);
      if (categoryResponse) setCategories(categoryResponse.data.categories);
    } catch (error) {
      setErrorMessage(error.response?.data?.message || 'Dashboard data could not be loaded. Please retry.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  if (!user) {
    return null;
  }

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const setUserActive = async (targetUser) => {
    setBusyId(`user-${targetUser.id}`);
    setErrorMessage('');
    setActionMessage('');
    try {
      const { data: result } = await api.patch(`/admin/users/${targetUser.id}/status`, { isActive: !targetUser.isActive });
      setActionMessage(result.message);
      await loadDashboard();
    } catch (error) {
      setErrorMessage(error.response?.data?.message || 'Could not change user status.');
    } finally {
      setBusyId(null);
    }
  };

  const createCategory = async (event) => {
    event.preventDefault();
    setBusyId('category-create');
    setErrorMessage('');
    setActionMessage('');
    try {
      const { data: result } = await api.post('/categories', { name: categoryName });
      setCategoryName('');
      setActionMessage(result.message);
      await loadDashboard();
    } catch (error) {
      setErrorMessage(error.response?.data?.message || 'Could not create category.');
    } finally {
      setBusyId(null);
    }
  };

  const setCategoryActive = async (category) => {
    setBusyId(`category-${category.id}`);
    setErrorMessage('');
    setActionMessage('');
    try {
      const { data: result } = await api.patch(`/categories/${category.id}`, { isActive: !category.isActive });
      setActionMessage(result.message);
      await loadDashboard();
    } catch (error) {
      setErrorMessage(error.response?.data?.message || 'Could not update category.');
    } finally {
      setBusyId(null);
    }
  };

  const setProductActive = async (product) => {
    setBusyId(`product-${product.id}`);
    setErrorMessage('');
    setActionMessage('');
    try {
      const { data: result } = product.isActive
        ? await api.delete(`/products/${product.id}`)
        : await api.put(`/products/${product.id}`, { isActive: true });
      setActionMessage(result.message);
      await loadDashboard();
    } catch (error) {
      setErrorMessage(error.response?.data?.message || 'Could not update product.');
    } finally {
      setBusyId(null);
    }
  };

  const renderBuyer = () => (
    <div className="dashboard-grid">
      <div className="panel">
        <h3>Buyer overview</h3>
        <div className="metric-row">
          <div className="metric"><span>Active requests</span><strong>{data.summary.activeRequests || 0}</strong></div>
          <div className="metric"><span>Quotations</span><strong>{data.summary.quotationsReceived || 0}</strong></div>
          <div className="metric"><span>Orders</span><strong>{data.summary.orders || 0}</strong></div>
        </div>
      </div>
      <div className="panel">
        <h3>Purchase requests</h3>
        {data.requests?.map((request) => (
          <div className="list-card" key={request.id}>
            <h4>{request.title}</h4>
            <p>{request.category}</p>
            <small>{request.status}</small>
          </div>
        ))}
      </div>
      <div className="panel">
        <h3>Quotations</h3>
        {data.quotations?.map((quote) => (
          <div className="list-card" key={quote.id}>
            <h4>{quote.supplierName}</h4>
            <p>INR {quote.amount}</p>
            <small>{quote.status}</small>
          </div>
        ))}
      </div>
    </div>
  );

  const renderSupplier = () => (
    <div className="dashboard-grid">
      <div className="panel">
        <h3>Supplier overview</h3>
        <div className="metric-row">
          <div className="metric"><span>Products</span><strong>{data.summary.products || 0}</strong></div>
          <div className="metric"><span>Open requests</span><strong>{data.summary.openRequests || 0}</strong></div>
          <div className="metric"><span>Orders</span><strong>{data.summary.orders || 0}</strong></div>
        </div>
      </div>
      <div className="panel">
        <h3>Products</h3>
        {data.products?.map((product) => (
          <div className="list-card" key={product.id}>
            <h4>{product.name}</h4>
            <p>{product.category}</p>
            <small>Stock: {product.stock}</small>
          </div>
        ))}
      </div>
      <div className="panel">
        <h3>Orders</h3>
        {data.orders?.map((order) => (
          <div className="list-card" key={order.id}>
            <h4>Order #{order.id}</h4>
            <p>Amount: INR {order.totalAmount}</p>
            <small>{order.status}</small>
          </div>
        ))}
      </div>
    </div>
  );

  const renderAdmin = () => (
    <div className="dashboard-grid">
      <div className="panel">
        <h3>Admin overview</h3>
        <div className="metric-row">
          <div className="metric"><span>Users</span><strong>{data.summary.users || 0}</strong></div>
          <div className="metric"><span>Products</span><strong>{data.summary.products || 0}</strong></div>
          <div className="metric"><span>Orders</span><strong>{data.summary.orders || 0}</strong></div>
          <div className="metric"><span>Reviews</span><strong>{data.summary.reviews || 0}</strong></div>
        </div>
      </div>
      <div className="panel">
        <h3>Users</h3>
        {data.users?.map((item) => (
          <div className="list-card" key={item.id}>
            <div className="section-title"><h4>{item.name}</h4><span className="status-pill">{item.isActive ? 'Active' : 'Inactive'}</span></div>
            <p>{item.role} · {item.businessName || 'No business profile'}</p>
            <small>{item.email}</small>
            <button
              className="secondary-btn"
              disabled={busyId === `user-${item.id}` || (item.id === user.id && item.isActive)}
              onClick={() => setUserActive(item)}
            >
              {item.isActive ? 'Deactivate account' : 'Reactivate account'}
            </button>
          </div>
        ))}
      </div>
      <div className="panel">
        <h3>Category management</h3>
        <form className="inline-form admin-category-form" onSubmit={createCategory}>
          <input required maxLength={120} value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="New category name" />
          <button className="primary-btn" disabled={busyId === 'category-create'}>Add category</button>
        </form>
        {categories.map((category) => (
          <div className="list-card section-title" key={category.id}>
            <div><h4>{category.name}</h4><small>{category.isActive ? 'Available to users' : 'Inactive'}</small></div>
            <button className="secondary-btn" disabled={busyId === `category-${category.id}`} onClick={() => setCategoryActive(category)}>
              {category.isActive ? 'Deactivate' : 'Reactivate'}
            </button>
          </div>
        ))}
      </div>
      <div className="panel">
        <h3>Catalogue management</h3>
        {data.products?.map((product) => (
          <div className="list-card section-title" key={product.id}>
            <div><h4>{product.name}</h4><small>{product.category} · {product.supplierName} · Stock {product.stock}</small></div>
            <button className="secondary-btn" disabled={busyId === `product-${product.id}`} onClick={() => setProductActive(product)}>
              {product.isActive ? 'Deactivate' : 'Reactivate'}
            </button>
          </div>
        ))}
      </div>
      <div className="panel">
        <h3>Recent purchase orders</h3>
        {data.orders?.map((order) => (
          <div className="list-card" key={order.id}>
            <h4>Order #{order.id} · {order.status}</h4>
            <p>{order.buyerBusinessName || `Buyer #${order.buyerId}`} → {order.supplierBusinessName || `Supplier #${order.supplierId}`}</p>
            <small>{order.currency} {Number(order.totalAmount).toFixed(2)}</small>
          </div>
        ))}
        {!data.orders?.length && <p className="empty-state">No orders yet.</p>}
      </div>
    </div>
  );

  return (
    <div className="page-shell dashboard-shell">
      <nav className="topbar">
        <Link className="brand" to="/" aria-label="ProcureHub home">
          <img className="brand-logo" src="/procurehub-logo.png" alt="ProcureHub" />
        </Link>
        <div className="nav-actions">
          <span className="user-pill">{user.role}</span>
          <button className="secondary-btn" onClick={handleLogout}>Logout</button>
        </div>
      </nav>

      <header className="page-header">
        <div>
          <span className="eyebrow">Dashboard</span>
          <h1>Welcome, {user.name}</h1>
        </div>
      </header>
      <nav className="workspace-nav" aria-label="Workspace navigation">
        <Link to="/profile">Business profile</Link>
        <Link to="/products">Products &amp; inventory</Link>
        <Link to="/requests">Requests &amp; quotations</Link>
        <Link to="/orders">Orders</Link>
        <Link to="/invoices">Invoices</Link>
        <Link to="/complaints">Complaints</Link>
        <Link to="/notifications">Notifications</Link>
      </nav>

      {errorMessage && <div className="alert error" role="alert">{errorMessage}<button className="text-button" onClick={loadDashboard}>Retry</button></div>}
      {actionMessage && <div className="alert success" role="status">{actionMessage}</div>}
      {loading ? <div className="loading-state">Loading dashboard...</div> : (
        <>
          {user.role === 'BUYER' && renderBuyer()}
          {user.role === 'SUPPLIER' && renderSupplier()}
          {user.role === 'ADMIN' && renderAdmin()}
          <section className="panel dashboard-notifications">
            <div className="section-title"><h2>Recent notifications</h2><Link className="text-button" to="/notifications">View all</Link></div>
            {data.summary.recentNotifications?.length
              ? data.summary.recentNotifications.map((notification) => (
                <div className="list-card" key={notification.id}>
                  <h4>{String(notification.type).replaceAll('_', ' ')}</h4>
                  <p>{notification.message}</p>
                </div>
              ))
              : <p className="empty-state">No recent notifications.</p>}
          </section>
          <section className="panel">
            <div className="section-title"><h2>{user.role === 'BUYER' ? 'Your supplier reviews' : 'Recent supplier reviews'}</h2><Link className="text-button" to="/orders">Review a completed order</Link></div>
            {reviews.length
              ? reviews.slice(0, 5).map((review) => (
                <div className="list-card" key={review.id}>
                  <h4>{review.rating} / 5 · Order #{review.orderId}</h4>
                  <p>{review.comment || 'No written comment.'}</p>
                  <small>{user.role === 'BUYER' ? (review.supplierBusinessName || 'Supplier') : (review.buyerBusinessName || 'Buyer')}</small>
                </div>
              ))
              : <p className="empty-state">No reviews yet.</p>}
          </section>
        </>
      )}
    </div>
  );
}
