import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkspaceLayout from '../components/WorkspaceLayout';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const returnEligibleStatuses = new Set(['DELIVERED', 'PAYMENT_PENDING', 'PAID', 'COMPLETED']);

export default function OrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [returns, setReturns] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [orderResponse, returnResponse] = await Promise.all([
        api.get('/orders'),
        api.get('/returns'),
      ]);
      setOrders(orderResponse.data.orders);
      setReturns(returnResponse.data.returns);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load purchase orders.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const returnsByOrder = new Map();
  for (const returnRequest of returns) {
    const current = returnsByOrder.get(Number(returnRequest.orderId)) || [];
    current.push(returnRequest);
    returnsByOrder.set(Number(returnRequest.orderId), current);
  }

  const canStartReturn = (order) => {
    if (user?.role !== 'BUYER' || !returnEligibleStatuses.has(order.status)) return false;
    const existing = returnsByOrder.get(Number(order.id)) || [];
    const claimed = new Map();
    for (const returnRequest of existing) {
      if (returnRequest.status === 'RETURN_REJECTED') continue;
      for (const item of returnRequest.items) {
        claimed.set(Number(item.orderItemId), (claimed.get(Number(item.orderItemId)) || 0) + Number(item.quantity));
      }
    }
    return order.items.some((item) => Number(item.quantity) - (claimed.get(Number(item.id)) || 0) > 0.0005);
  };

  return (
    <WorkspaceLayout title="Purchase orders">
      {error && <div className="alert error" role="alert">{error}</div>}
      <section className="panel">
        <div className="section-title">
          <h2>Order lifecycle</h2>
          <button className="secondary-btn" onClick={loadOrders} disabled={loading}>Refresh</button>
        </div>
        {loading ? <p>Loading orders…</p> : orders.length === 0 ? (
          <p className="empty-state">No orders yet. Accepted quotations can be converted into purchase orders from Requests &amp; quotations.</p>
        ) : (
          <div className="stack-list">
            {orders.map((order) => {
              const orderReturns = returnsByOrder.get(Number(order.id)) || [];
              return (
                <article className="workflow-card" key={order.id}>
                  <div className="section-title">
                    <div>
                      <h3>Order #{order.id}</h3>
                      <span>{user?.role === 'BUYER'
                        ? `Supplier: ${order.supplierBusinessName || `#${order.supplierId}`}`
                        : `Buyer: ${order.buyerBusinessName || `#${order.buyerId}`}`}</span>
                    </div>
                    <span className="status-pill">{order.status}</span>
                  </div>
                  <p>{order.currency} {Number(order.totalAmount).toFixed(2)} · {order.items.length} line item(s)</p>
                  {orderReturns.length > 0 && (
                    <p className="order-return-status">
                      Returns: {orderReturns.map((item) => `#${item.id} ${item.status.replaceAll('_', ' ').toLowerCase()}`).join(' · ')}
                    </p>
                  )}
                  <div className="button-row">
                    <Link className="secondary-btn" to={`/orders/${order.id}`}>View Details</Link>
                    {canStartReturn(order) && (
                      <Link className="secondary-btn" to={`/returns?orderId=${order.id}`}>Return</Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </WorkspaceLayout>
  );
}
