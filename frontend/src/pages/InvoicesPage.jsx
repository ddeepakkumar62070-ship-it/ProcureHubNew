import { useCallback, useEffect, useState } from 'react';
import WorkspaceLayout from '../components/WorkspaceLayout';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export default function InvoicesPage() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [details, setDetails] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/invoices');
      setInvoices(data.invoices);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load invoices.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  const showDetails = async (id) => {
    setError('');
    try {
      const { data } = await api.get(`/invoices/${id}`);
      setDetails(data.invoice);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load invoice details.');
    }
  };

  const recordPayment = async () => {
    setError('');
    setSuccess('');
    try {
      const amountPaid = details.payments
        .filter((payment) => ['PAID', 'COMPLETED'].includes(payment.status))
        .reduce((sum, payment) => sum + Number(payment.amount), 0);
      const remaining = Number(details.amount) - amountPaid;
      const { data } = await api.post(`/invoices/${details.id}/payments`, {
        amount: Number(remaining.toFixed(2)),
        status: 'PAID',
        idempotencyKey: crypto.randomUUID(),
      });
      setSuccess(`${data.message} Order status: ${data.orderStatus}.`);
      setDetails(null);
      await loadInvoices();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not record payment.');
    }
  };

  return (
    <WorkspaceLayout title="Invoices and payments">
      {error && <div className="alert error" role="alert">{error}</div>}
      {success && <div className="alert success" role="status">{success}</div>}
      <section className="panel">
        <div className="section-title"><h2>Invoices</h2><button className="secondary-btn" onClick={loadInvoices}>Refresh</button></div>
        {loading ? <p>Loading invoices…</p> : invoices.length === 0 ? <p className="empty-state">No invoices have been generated. Invoices are created after an order is delivered.</p> : (
          <div className="stack-list">
            {invoices.map((invoice) => (
              <article className="workflow-card" key={invoice.id}>
                <div className="section-title"><div><h3>{invoice.invoiceNumber}</h3><span>Order #{invoice.orderId} · {new Date(invoice.createdAt).toLocaleDateString()}</span></div><span className="status-pill">{invoice.status}</span></div>
                <p><strong>{invoice.currency} {Number(invoice.amount).toFixed(2)}</strong></p>
                <button className="secondary-btn" onClick={() => showDetails(invoice.id)}>View invoice</button>
              </article>
            ))}
          </div>
        )}
      </section>
      {details && (
        <section className="panel invoice-detail">
          <div className="section-title"><h2>{details.invoiceNumber}</h2><button className="text-button" onClick={() => setDetails(null)}>Close</button></div>
          <p>{details.currency} {Number(details.amount).toFixed(2)} · {details.status}</p>
          <ul className="compact-list">{details.items.map((item) => <li key={item.id}>{item.name}: {item.quantity} {item.unit} × {details.currency} {Number(item.unitPrice).toFixed(2)} = {details.currency} {Number(item.lineTotal).toFixed(2)}</li>)}</ul>
          <h3>Payment records</h3>
          {details.payments.length ? <ul className="compact-list">{details.payments.map((payment) => <li key={payment.id}>{payment.status}: {details.currency} {Number(payment.amount).toFixed(2)} · {new Date(payment.createdAt).toLocaleString()}</li>)}</ul> : <p>No payments recorded.</p>}
          {user?.role === 'BUYER' && !['PAID', 'VOID'].includes(details.status) && (
            <div className="alert info">
              <p>This records a payment marked as paid for development workflow testing; no payment provider or bank transfer is connected.</p>
              <button className="primary-btn" onClick={recordPayment}>Record full balance as paid</button>
            </div>
          )}
        </section>
      )}
    </WorkspaceLayout>
  );
}
