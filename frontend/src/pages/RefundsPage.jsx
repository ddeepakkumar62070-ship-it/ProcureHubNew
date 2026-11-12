import { useCallback, useEffect, useState } from 'react';
import WorkspaceLayout from '../components/WorkspaceLayout';
import api from '../services/api';

const localDateTime = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

export default function RefundsPage() {
  const [refunds, setRefunds] = useState([]);
  const [selected, setSelected] = useState(null);
  const [reference, setReference] = useState('');
  const [processedAt, setProcessedAt] = useState(localDateTime);
  const [note, setNote] = useState('');
  const [manualTransferConfirmed, setManualTransferConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadRefunds = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/refunds');
      setRefunds(data.refunds);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load refund records.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRefunds(); }, [loadRefunds]);

  const openRefund = async (id) => {
    setError('');
    try {
      const { data } = await api.get(`/refunds/${id}`);
      setSelected(data.refund);
      setReference(data.refund.transactionReference || '');
      setNote('');
      setManualTransferConfirmed(false);
      setProcessedAt(localDateTime());
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load refund details.');
    }
  };

  const updateRefund = async (status) => {
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const { data } = await api.patch(`/refunds/${selected.id}`, {
        status,
        transactionReference: reference,
        processedAt,
        manualTransferConfirmed,
        note,
      });
      setSelected(data.refund);
      setSuccess(data.message);
      setManualTransferConfirmed(false);
      await loadRefunds();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not update the refund record.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <WorkspaceLayout title="Refunds">
      {error && <div className="alert error" role="alert">{error}</div>}
      {success && <div className="alert success" role="status">{success}</div>}
      <section className="panel">
        <div className="section-title"><h2>Refund records</h2><button className="secondary-btn" onClick={loadRefunds} disabled={loading}>Refresh</button></div>
        <p>Refund entries track eligible paid amounts. ProcureHub does not transfer money; an administrator records a manual transfer only after it has actually been made.</p>
        {loading ? <p>Loading refunds…</p> : refunds.length === 0 ? <p className="empty-state">No refunds are associated with your account.</p> : (
          <div className="stack-list">
            {refunds.map((refund) => (
              <article className="workflow-card" key={refund.id}>
                <div className="section-title">
                  <div><h3>Refund #{refund.id} · Return #{refund.returnId}</h3><span>Order #{refund.orderId} · {refund.invoiceNumber}</span></div>
                  <span className="status-pill">{refund.status.replaceAll('_', ' ').toLowerCase()}</span>
                </div>
                <p><strong>{refund.currency} {Number(refund.amount).toFixed(2)}</strong> · {refund.reason}</p>
                {refund.transactionReference && <p>Reference: {refund.transactionReference}</p>}
                {refund.processedAt && <p>Processed: {new Date(refund.processedAt).toLocaleString()}</p>}
                <button className="secondary-btn" onClick={() => openRefund(refund.id)}>View details and history</button>
              </article>
            ))}
          </div>
        )}
      </section>
      {selected && (
        <section className="panel">
          <div className="section-title"><h2>Refund #{selected.id}</h2><button className="text-button" onClick={() => setSelected(null)}>Close</button></div>
          <p><strong>Status:</strong> {selected.status.replaceAll('_', ' ').toLowerCase()}</p>
          <p><strong>Amount:</strong> {selected.currency} {Number(selected.amount).toFixed(2)} · <strong>Invoice:</strong> {selected.invoiceNumber} ({selected.invoiceStatus})</p>
          <p><strong>Return:</strong> #{selected.returnId} · Order #{selected.orderId} · {selected.reason}</p>
          <ul className="compact-list">{selected.items.map((item, index) => (
            <li key={`${selected.id}-${index}`}>{item.name}: {item.quantity} {item.unit} × {selected.currency} {Number(item.unitPrice).toFixed(2)} = {selected.currency} {Number(item.lineValue).toFixed(2)}</li>
          ))}</ul>
          {selected.transactionReference && <p><strong>Transaction reference:</strong> {selected.transactionReference}</p>}
          {selected.processedAt && <p><strong>Recorded processing date:</strong> {new Date(selected.processedAt).toLocaleString()}</p>}
          <h3>Refund history</h3>
          <ol className="timeline">{selected.history.map((entry) => (
            <li key={entry.id}>
              <strong>{entry.newStatus.replaceAll('_', ' ').toLowerCase()}</strong>
              <span>{new Date(entry.createdAt).toLocaleString()} · {entry.changedByName} ({entry.changedByRole})</span>
              {entry.transactionReference && <small>Reference: {entry.transactionReference}</small>}
              {entry.note && <small>{entry.note}</small>}
              {entry.processedAt && <small>Manual processing date: {new Date(entry.processedAt).toLocaleString()}</small>}
            </li>
          ))}</ol>
          {selected.status !== 'NOT_APPLICABLE' && selected.status !== 'REFUND_PROCESSED' && (
            <div className="refund-admin-form">
              <h3>Administrator refund record</h3>
              {selected.status === 'REFUND_PENDING' && (
                <>
                  <label>Transaction reference (optional)<input maxLength={120} value={reference} onChange={(event) => setReference(event.target.value)} /></label>
                  <label>Manual transfer date and time<input type="datetime-local" value={processedAt} onChange={(event) => setProcessedAt(event.target.value)} /></label>
                  <label>Processing note<textarea rows={2} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} /></label>
                  <label className="checkbox-label">
                    <input type="checkbox" checked={manualTransferConfirmed} onChange={(event) => setManualTransferConfirmed(event.target.checked)} />
                    I confirm that the refund was actually transferred manually outside ProcureHub.
                  </label>
                  <div className="button-row">
                    <button className="primary-btn" disabled={saving || !manualTransferConfirmed} onClick={() => updateRefund('REFUND_PROCESSED')}>Record manual refund as processed</button>
                    <button className="secondary-btn" disabled={saving || !note.trim()} onClick={() => updateRefund('REFUND_FAILED')}>Mark failed</button>
                  </div>
                </>
              )}
              {selected.status === 'REFUND_FAILED' && (
                <>
                  <label>Retry note<textarea rows={2} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} /></label>
                  <button className="secondary-btn" disabled={saving} onClick={() => updateRefund('REFUND_PENDING')}>Return to pending</button>
                </>
              )}
            </div>
          )}
          {selected.status === 'NOT_APPLICABLE' && <p className="alert info">No paid invoice balance was available when this return was approved, so no refund is due.</p>}
          {selected.status === 'REFUND_PROCESSED' && <p className="alert info">This record documents a manual refund. It is not evidence that ProcureHub transferred funds.</p>}
        </section>
      )}
    </WorkspaceLayout>
  );
}
