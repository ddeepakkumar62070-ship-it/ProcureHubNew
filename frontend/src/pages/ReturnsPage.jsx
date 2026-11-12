import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import WorkspaceLayout from '../components/WorkspaceLayout';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const returnEligibleStatuses = new Set(['DELIVERED', 'PAYMENT_PENDING', 'PAID', 'COMPLETED']);

const hasRemainingReturnQuantity = (order, returns) => order.items.some((item) => {
  const claimed = returns
    .filter((returnRequest) => Number(returnRequest.orderId) === Number(order.id)
      && returnRequest.status !== 'RETURN_REJECTED')
    .flatMap((returnRequest) => returnRequest.items)
    .filter((line) => Number(line.orderItemId) === Number(item.id))
    .reduce((sum, line) => sum + Number(line.quantity), 0);
  return Number(item.quantity) - claimed > 0.0005;
});

export default function ReturnsPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [returns, setReturns] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [explanations, setExplanations] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
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
      setError(requestError.response?.data?.message || 'Could not load return requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const selectedOrder = orders.find((order) => String(order.id) === selectedOrderId);
  const requestedOrderId = searchParams.get('orderId');
  const claimedQuantity = (orderItemId) => returns
    .filter((returnRequest) => returnRequest.status !== 'RETURN_REJECTED')
    .flatMap((returnRequest) => returnRequest.items.map((item) => ({ ...item, orderId: returnRequest.orderId })))
    .filter((item) => Number(item.orderId) === Number(selectedOrderId)
      && Number(item.orderItemId) === Number(orderItemId))
    .reduce((sum, item) => sum + Number(item.quantity), 0);
  const eligibleOrders = useMemo(
    () => orders.filter((order) => returnEligibleStatuses.has(order.status)
      && hasRemainingReturnQuantity(order, returns)),
    [orders, returns],
  );

  useEffect(() => {
    if (!loading && requestedOrderId && eligibleOrders.some((order) => String(order.id) === requestedOrderId)) {
      setSelectedOrderId(requestedOrderId);
    }
  }, [eligibleOrders, loading, requestedOrderId]);

  const submitReturn = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!selectedOrder) return;
    const items = selectedOrder.items
      .filter((item) => Number(quantities[item.id]) > 0)
      .map((item) => ({ orderItemId: item.id, quantity: Number(quantities[item.id]) }));
    if (!items.length) {
      setError('Enter a return quantity for at least one order item.');
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post('/returns', {
        orderId: selectedOrder.id,
        reason,
        description,
        items,
      });
      setSuccess(data.message);
      setSelectedOrderId('');
      setQuantities({});
      setReason('');
      setDescription('');
      await loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not submit the return request.');
    } finally {
      setSaving(false);
    }
  };

  const openReturn = async (id) => {
    setError('');
    try {
      const { data } = await api.get(`/returns/${id}`);
      setSelectedReturn(data.returnRequest);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load return details.');
    }
  };

  const updateReturn = async (returnRequest, status) => {
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const { data } = await api.patch(`/returns/${returnRequest.id}/status`, {
        status,
        explanation: explanations[returnRequest.id] || '',
      });
      setSelectedReturn(data.returnRequest);
      setSuccess(data.message);
      await loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not update the return request.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <WorkspaceLayout title="Order returns">
      {error && <div className="alert error" role="alert">{error}</div>}
      {success && <div className="alert success" role="status">{success}</div>}
      {user?.role === 'BUYER' && (
        <section className="panel">
          <h2>Request a return</h2>
          <p>Returns are available for delivered orders. Supplier approval creates an auditable refund record for any eligible paid amount; inventory is restored only after the supplier receives and completes the return.</p>
          {eligibleOrders.length === 0 ? <p className="empty-state">No delivered orders are currently eligible for a return request.</p> : (
            <form className="workspace-form grid-form" onSubmit={submitReturn}>
              <label className="full-width">Delivered order
                <select required value={selectedOrderId} onChange={(event) => { setSelectedOrderId(event.target.value); setQuantities({}); }}>
                  <option value="">Select an order</option>
                  {eligibleOrders.map((order) => <option key={order.id} value={order.id}>Order #{order.id} · {order.status}</option>)}
                </select>
              </label>
              {selectedOrder && <div className="full-width request-lines">
                <h3>Select items and quantities</h3>
                {selectedOrder.items.map((item) => (
                  <label className="request-line" key={item.id}>
                    <span>{item.name} · purchased {item.quantity} {item.unit}</span>
                    <span>Return quantity</span>
                    <input
                      type="number"
                      min="0"
                      max={Math.max(0, Number(item.quantity) - claimedQuantity(item.id))}
                      step="0.001"
                      value={quantities[item.id] || ''}
                      onChange={(event) => setQuantities({ ...quantities, [item.id]: event.target.value })}
                    />
                  </label>
                ))}
              </div>}
              <label>Reason<input required maxLength={120} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
              <label className="full-width">Details<textarea rows={3} maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
              <button className="primary-btn" type="submit" disabled={saving}>{saving ? 'Submitting…' : 'Submit return request'}</button>
            </form>
          )}
        </section>
      )}
      <section className="panel">
        <div className="section-title"><h2>Return requests</h2><button className="secondary-btn" onClick={loadData} disabled={loading}>Refresh</button></div>
        {loading ? <p>Loading return requests…</p> : returns.length === 0 ? <p className="empty-state">No return requests have been submitted.</p> : (
          <div className="stack-list">
            {returns.map((item) => (
              <article className="workflow-card" key={item.id}>
                <div className="section-title">
                  <div><h3>Return #{item.id} · Order #{item.orderId}</h3><span>{item.reason}</span></div>
                  <span className="status-pill">{item.status}</span>
                </div>
                <ul className="compact-list">{item.items.map((line) => <li key={`${item.id}-${line.orderItemId}`}>{line.name}: {line.quantity} {line.unit}</li>)}</ul>
                {item.refundId && <p>Refund #{item.refundId}: {item.refundCurrency} {Number(item.refundAmount).toFixed(2)} · {item.refundStatus.replaceAll('_', ' ').toLowerCase()}</p>}
                {item.refundId && <Link className="text-button" to="/refunds">View refund details</Link>}
                <button className="secondary-btn" onClick={() => openReturn(item.id)}>View history</button>
                {user?.role === 'SUPPLIER' && item.status === 'RETURN_REQUESTED' && (
                  <div className="return-actions">
                    <label>Decision note<textarea rows={2} maxLength={2000} value={explanations[item.id] || ''} onChange={(event) => setExplanations({ ...explanations, [item.id]: event.target.value })} /></label>
                    <div className="button-row">
                      <button className="primary-btn" disabled={saving} onClick={() => updateReturn(item, 'RETURN_APPROVED')}>Approve</button>
                      <button className="secondary-btn" disabled={saving} onClick={() => updateReturn(item, 'RETURN_REJECTED')}>Reject</button>
                    </div>
                  </div>
                )}
                {user?.role === 'SUPPLIER' && item.status === 'RETURN_APPROVED' && (
                  <button className="primary-btn" disabled={saving} onClick={() => updateReturn(item, 'RETURN_COMPLETED')}>Mark return completed</button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
      {selectedReturn && (
        <section className="panel">
          <div className="section-title"><h2>Return #{selectedReturn.id} history</h2><button className="text-button" onClick={() => setSelectedReturn(null)}>Close</button></div>
          {selectedReturn.description && <p>{selectedReturn.description}</p>}
          <ol className="timeline">{selectedReturn.history.map((entry, index) => (
            <li key={`${entry.newStatus}-${index}`}><strong>{entry.newStatus}</strong><span>{new Date(entry.createdAt).toLocaleString()} · {entry.changedByName}</span>{entry.note && <small>{entry.note}</small>}</li>
          ))}</ol>
        </section>
      )}
    </WorkspaceLayout>
  );
}
