import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import WorkspaceLayout from '../components/WorkspaceLayout';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const lifecycle = [
  ['PO_CREATED', 'Order created'],
  ['CONFIRMED', 'Order confirmed'],
  ['PROCESSING', 'Processing'],
  ['SHIPPED', 'Shipped'],
  ['OUT_FOR_DELIVERY', 'Out for delivery'],
  ['DELIVERED', 'Delivered'],
  ['INVOICE_GENERATED', 'Invoice generated'],
  ['PAYMENT_PENDING', 'Payment pending'],
  ['PAID', 'Paid'],
  ['COMPLETED', 'Completed'],
];

const supplierNextStatus = {
  PO_CREATED: 'CONFIRMED',
  CONFIRMED: 'PROCESSING',
  PROCESSING: 'SHIPPED',
  SHIPPED: 'OUT_FOR_DELIVERY',
  OUT_FOR_DELIVERY: 'DELIVERED',
};

const returnEligibleStatuses = new Set(['DELIVERED', 'PAYMENT_PENDING', 'PAID', 'COMPLETED']);
const formatDate = (value) => value ? new Date(value).toLocaleString() : 'Not available';

export default function OrderDetailsPage() {
  const { orderId } = useParams();
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [review, setReview] = useState({ rating: 5, comment: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadOrder = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/orders/${orderId}`);
      setOrder(data.order);
    } catch (requestError) {
      setOrder(null);
      setError(requestError.response?.status === 404
        ? 'Order not found or you do not have permission to view it.'
        : requestError.response?.data?.message || 'Could not load order details.');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { loadOrder(); }, [loadOrder]);

  const advanceOrder = async (status) => {
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const { data } = await api.patch(`/orders/${order.id}`, { status });
      setSuccess(data.message);
      await loadOrder();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not update order status.');
    } finally {
      setSaving(false);
    }
  };

  const submitReview = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const { data } = await api.post('/reviews', {
        orderId: order.id,
        rating: Number(review.rating),
        comment: review.comment,
      });
      setSuccess(data.message);
      setReview({ rating: 5, comment: '' });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not submit supplier review.');
    } finally {
      setSaving(false);
    }
  };

  const occurredStatuses = new Set(order?.history.map((entry) => entry.newStatus) || []);
  const currentStage = lifecycle.findIndex(([status]) => status === order?.status);
  const deliveredEvent = order?.history.find((entry) => entry.newStatus === 'DELIVERED');

  return (
    <WorkspaceLayout title={order ? `Order #${order.id}` : 'Order details'}>
      <div className="order-detail-actions">
        <Link className="text-button" to="/orders">← Back to orders</Link>
        {order?.returns.length > 0 && <Link className="text-button" to="/returns">View return records</Link>}
        {order?.returns.some((item) => item.refundId) && <Link className="text-button" to="/refunds">View refund records</Link>}
        {order?.invoice && <Link className="text-button" to="/invoices">View invoices and payments</Link>}
      </div>
      {error && order && <div className="alert error" role="alert">{error}</div>}
      {success && <div className="alert success" role="status">{success}</div>}
      {loading ? <section className="panel"><p>Loading order details…</p></section> : !order ? (
        <section className="panel"><p className="alert error" role="alert">{error || 'Order not found.'}</p></section>
      ) : (
        <>
          <section className="panel">
            <div className="section-title">
              <div><h2>Order #{order.id}</h2><span>Created {formatDate(order.createdAt)}</span></div>
              <span className="status-pill">{order.status.replaceAll('_', ' ')}</span>
            </div>
            <div className="order-parties">
              <section>
                <h3>Buyer</h3>
                <p>{order.buyerBusinessName || order.buyerName}</p>
                {order.buyerBusinessName && <p>Contact: {order.buyerName}</p>}
                {order.buyerPhone && <p>{order.buyerPhone}</p>}
                {order.buyerAddress && <p>{order.buyerAddress}</p>}
              </section>
              <section>
                <h3>Supplier</h3>
                <p>{order.supplierBusinessName || order.supplierName}</p>
                {order.supplierBusinessName && <p>Contact: {order.supplierName}</p>}
                {order.supplierPhone && <p>{order.supplierPhone}</p>}
                {order.supplierAddress && <p>{order.supplierAddress}</p>}
              </section>
            </div>
            <h3>Products</h3>
            <div className="order-lines">
              {order.items.map((item) => (
                <article className="order-line" key={item.id}>
                  <div><strong>{item.name}</strong>{item.description && <p>{item.description}</p>}</div>
                  <span>{item.quantity} {item.unit}</span>
                  <span>{order.currency} {Number(item.unitPrice).toFixed(2)} / unit</span>
                  <strong>{order.currency} {Number(item.lineTotal).toFixed(2)}</strong>
                </article>
              ))}
            </div>
            <div className="order-total">
              <span>Subtotal</span><strong>{order.currency} {Number(order.items.reduce((sum, item) => sum + Number(item.lineTotal), 0)).toFixed(2)}</strong>
              <span>Total</span><strong>{order.currency} {Number(order.totalAmount).toFixed(2)}</strong>
            </div>
            <h3>Delivery information</h3>
            <p>{order.deliveryAddress || 'No delivery address was recorded for this order.'}</p>
            {order.deliveryDeadline && <p>Requested by {formatDate(order.deliveryDeadline)}</p>}
            {deliveredEvent && <p>Delivered {formatDate(deliveredEvent.createdAt)}</p>}
          </section>

          <section className="panel">
            <h2>Order timeline</h2>
            <ol className="order-lifecycle">
              {lifecycle.map(([status, label], index) => {
                const event = order.history.find((entry) => entry.newStatus === status);
                const state = index === currentStage ? 'current' : event ? 'completed' : 'pending';
                return (
                  <li className={`lifecycle-${state}`} key={status}>
                    <span className="lifecycle-marker" aria-hidden="true" />
                    <div><strong>{label}</strong>
                      {event && <time dateTime={new Date(event.createdAt).toISOString()}>{formatDate(event.createdAt)}</time>}
                      {event?.note && <small>{event.note}</small>}
                      {!event && state === 'current' && <small>Current status</small>}
                      {!event && state === 'pending' && <small>Pending</small>}
                    </div>
                  </li>
                );
              })}
              {['REJECTED', 'CANCELLED'].includes(order.status) && (
                <li className="lifecycle-current">
                  <span className="lifecycle-marker" aria-hidden="true" />
                  <div><strong>{order.status.replaceAll('_', ' ')}</strong><small>Current status</small></div>
                </li>
              )}
            </ol>
            <h3>Recorded order events</h3>
            <ol className="timeline">
              {order.history.map((entry, index) => (
                <li key={`${entry.newStatus}-${index}`}>
                  <strong>{entry.newStatus.replaceAll('_', ' ')}</strong>
                  <span>{formatDate(entry.createdAt)} · {entry.changedByName || 'User'}</span>
                  {entry.note && <small>{entry.note}</small>}
                </li>
              ))}
            </ol>
          </section>

          {order.invoice && (
            <section className="panel">
              <h2>Invoice and payments</h2>
              <p><Link className="text-button" to="/invoices">{order.invoice.invoiceNumber}</Link> · {order.invoice.status} · {order.invoice.currency} {Number(order.invoice.amount).toFixed(2)}</p>
              {order.invoice.createdAt && <p>Issued {formatDate(order.invoice.createdAt)}</p>}
              <h3>Payment records</h3>
              {order.invoice.payments.length ? (
                <ul className="compact-list">{order.invoice.payments.map((payment) => (
                  <li key={payment.id}>{payment.status} · {payment.currency} {Number(payment.amount).toFixed(2)} · {formatDate(payment.paidAt || payment.createdAt)}{payment.reference && ` · ${payment.reference}`}</li>
                ))}</ul>
              ) : <p>No payment records.</p>}
              {order.returns.some((item) => item.refundId) && <Link className="text-button" to="/refunds">View refund status and history</Link>}
            </section>
          )}

          {order.returns.length > 0 && (
            <section className="panel">
              <h2>Returns</h2>
              <div className="stack-list">
                {order.returns.map((returnRequest) => (
                  <article className="workflow-card" key={returnRequest.id}>
                    <div className="section-title"><h3>Return #{returnRequest.id}</h3><span className="status-pill">{returnRequest.status.replaceAll('_', ' ')}</span></div>
                    <p>{returnRequest.reason} · Submitted {formatDate(returnRequest.createdAt)}</p>
                    <ul className="compact-list">{returnRequest.items.map((item) => <li key={item.orderItemId}>{item.name}: {item.quantity} {item.unit}</li>)}</ul>
                    {returnRequest.refundId && <p>Refund #{returnRequest.refundId}: {returnRequest.refundCurrency} {Number(returnRequest.refundAmount).toFixed(2)} · {returnRequest.refundStatus.replaceAll('_', ' ').toLowerCase()} <Link className="text-button" to="/refunds">View refund</Link></p>}
                    {returnRequest.description && <p>{returnRequest.description}</p>}
                  </article>
                ))}
              </div>
            </section>
          )}

          {user?.role === 'BUYER' && returnEligibleStatuses.has(order.status) && (
            order.items.some((item) => {
              const returned = order.returns
                .filter((request) => request.status !== 'RETURN_REJECTED')
                .flatMap((request) => request.items)
                .filter((line) => Number(line.orderItemId) === Number(item.id))
                .reduce((sum, line) => sum + Number(line.quantity), 0);
              return Number(item.quantity) - returned > 0.0005;
            }) && <Link className="primary-btn" to={`/returns?orderId=${order.id}`}>Start return request</Link>
          )}
          {user?.role === 'SUPPLIER' && supplierNextStatus[order.status] && (
            <button className="primary-btn" disabled={saving} onClick={() => advanceOrder(supplierNextStatus[order.status])}>
              {saving ? 'Updating…' : `Mark as ${supplierNextStatus[order.status].replaceAll('_', ' ').toLowerCase()}`}
            </button>
          )}
          {user?.role === 'SUPPLIER' && order.status === 'PO_CREATED' && (
            <button className="secondary-btn" disabled={saving} onClick={() => advanceOrder('REJECTED')}>Reject order</button>
          )}
          {user?.role === 'BUYER' && order.status === 'COMPLETED' && (
            <form className="workspace-form review-form" onSubmit={submitReview}>
              <h3>Review this supplier</h3>
              <label>Rating<select value={review.rating} onChange={(event) => setReview({ ...review, rating: event.target.value })}>
                {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} / 5</option>)}
              </select></label>
              <label>Comment<textarea rows={3} maxLength={2000} value={review.comment} onChange={(event) => setReview({ ...review, comment: event.target.value })} /></label>
              <button className="primary-btn" type="submit" disabled={saving}>{saving ? 'Submitting…' : 'Submit review'}</button>
            </form>
          )}
        </>
      )}
    </WorkspaceLayout>
  );
}
