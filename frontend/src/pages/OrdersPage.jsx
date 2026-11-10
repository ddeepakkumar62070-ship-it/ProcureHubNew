import { useCallback, useEffect, useState } from 'react';
import WorkspaceLayout from '../components/WorkspaceLayout';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const supplierNextStatus = {
  PO_CREATED: 'CONFIRMED',
  CONFIRMED: 'PROCESSING',
  PROCESSING: 'SHIPPED',
  SHIPPED: 'OUT_FOR_DELIVERY',
  OUT_FOR_DELIVERY: 'DELIVERED',
};

export default function OrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [selected, setSelected] = useState(null);
  const [review, setReview] = useState({ rating: 5, comment: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/orders');
      setOrders(data.orders);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load purchase orders.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const openOrder = async (id) => {
    setError('');
    try {
      const { data } = await api.get(`/orders/${id}`);
      setSelected(data.order);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load order details.');
    }
  };

  const advanceOrder = async (status) => {
    setError('');
    setSuccess('');
    try {
      const { data } = await api.patch(`/orders/${selected.id}`, { status });
      setSuccess(data.message);
      setSelected(null);
      await loadOrders();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not update order status.');
    }
  };

  const submitReview = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      const { data } = await api.post('/reviews', {
        orderId: selected.id,
        rating: Number(review.rating),
        comment: review.comment,
      });
      setSuccess(data.message);
      setSelected(null);
      setReview({ rating: 5, comment: '' });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not submit supplier review.');
    }
  };

  return (
    <WorkspaceLayout title="Purchase orders">
      {error && <div className="alert error" role="alert">{error}</div>}
      {success && <div className="alert success" role="status">{success}</div>}
      <section className="panel">
        <div className="section-title"><h2>Order lifecycle</h2><button className="secondary-btn" onClick={loadOrders}>Refresh</button></div>
        {loading ? <p>Loading orders…</p> : orders.length === 0 ? <p className="empty-state">No orders yet. Accepted quotations can be converted into purchase orders from Requests &amp; quotations.</p> : (
          <div className="stack-list">
            {orders.map((order) => (
              <article className="workflow-card" key={order.id}>
                <div className="section-title"><div><h3>Order #{order.id}</h3><span>{user?.role === 'BUYER' ? `Supplier: ${order.supplierBusinessName || `#${order.supplierId}`}` : `Buyer: ${order.buyerBusinessName || `#${order.buyerId}`}`}</span></div><span className="status-pill">{order.status}</span></div>
                <p>{order.currency} {Number(order.totalAmount).toFixed(2)} · {order.items.length} line item(s)</p>
                <button className="secondary-btn" onClick={() => openOrder(order.id)}>View details and timeline</button>
              </article>
            ))}
          </div>
        )}
      </section>
      {selected && (
        <section className="panel order-detail">
          <div className="section-title"><h2>Order #{selected.id} details</h2><button className="text-button" onClick={() => setSelected(null)}>Close</button></div>
          <p><strong>Status:</strong> {selected.status} · <strong>Total:</strong> {selected.currency} {Number(selected.totalAmount).toFixed(2)}</p>
          <h3>Items</h3>
          <ul className="compact-list">{selected.items.map((item) => <li key={item.id}>{item.name}: {item.quantity} {item.unit} × {selected.currency} {Number(item.unitPrice).toFixed(2)}</li>)}</ul>
          <h3>Status timeline</h3>
          <ol className="timeline">{selected.history.map((entry, index) => <li key={`${entry.newStatus}-${index}`}><strong>{entry.newStatus}</strong><span>{new Date(entry.createdAt).toLocaleString()} · {entry.changedByName || 'User'}</span>{entry.note && <small>{entry.note}</small>}</li>)}</ol>
          {user?.role === 'SUPPLIER' && supplierNextStatus[selected.status] && (
            <button className="primary-btn" onClick={() => advanceOrder(supplierNextStatus[selected.status])}>
              Mark as {supplierNextStatus[selected.status].replaceAll('_', ' ').toLowerCase()}
            </button>
          )}
          {user?.role === 'SUPPLIER' && selected.status === 'PO_CREATED' && (
            <button className="secondary-btn" onClick={() => advanceOrder('REJECTED')}>Reject order</button>
          )}
          {user?.role === 'BUYER' && selected.status === 'COMPLETED' && (
            <form className="workspace-form review-form" onSubmit={submitReview}>
              <h3>Review this supplier</h3>
              <label>Rating<select value={review.rating} onChange={(event) => setReview({ ...review, rating: event.target.value })}>
                {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} / 5</option>)}
              </select></label>
              <label>Comment<textarea rows={3} maxLength={2000} value={review.comment} onChange={(event) => setReview({ ...review, comment: event.target.value })} /></label>
              <button className="primary-btn" type="submit">Submit review</button>
            </form>
          )}
        </section>
      )}
    </WorkspaceLayout>
  );
}
