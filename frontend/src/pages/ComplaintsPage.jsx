import { useCallback, useEffect, useState } from 'react';
import WorkspaceLayout from '../components/WorkspaceLayout';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const adminTransitions = {
  OPEN: ['UNDER_REVIEW', 'RESOLVED', 'REJECTED'],
  UNDER_REVIEW: ['RESOLVED', 'REJECTED'],
  RESOLVED: ['CLOSED'],
  REJECTED: ['CLOSED'],
};

const categories = [
  ['quality', 'Product or service quality'],
  ['delivery', 'Delivery'],
  ['invoice_payment', 'Invoice or payment'],
  ['communication', 'Communication'],
  ['other', 'Other'],
];

export default function ComplaintsPage() {
  const { user } = useAuth();
  const [complaints, setComplaints] = useState([]);
  const [orders, setOrders] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ orderId: '', category: 'other', title: '', description: '' });
  const [response, setResponse] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const complaintRequest = api.get('/complaints');
      const requests = user?.role === 'ADMIN' ? [complaintRequest] : [complaintRequest, api.get('/orders')];
      const results = await Promise.all(requests);
      setComplaints(results[0].data.complaints);
      if (results[1]) setOrders(results[1].data.orders);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load complaints.');
    } finally {
      setLoading(false);
    }
  }, [user?.role]);

  useEffect(() => { loadData(); }, [loadData]);

  const createComplaint = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const payload = {
        ...form,
        orderId: form.orderId || undefined,
      };
      const { data } = await api.post('/complaints', payload);
      setSuccess(data.message);
      setForm({ orderId: '', category: 'other', title: '', description: '' });
      await loadData();
      setSelected(data.complaint);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not submit the complaint.');
    } finally {
      setSaving(false);
    }
  };

  const openComplaint = async (id) => {
    setError('');
    try {
      const { data } = await api.get(`/complaints/${id}`);
      setSelected(data.complaint);
      setResponse('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load complaint details.');
    }
  };

  const addResponse = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const { data } = await api.post(`/complaints/${selected.id}/responses`, { response });
      setSelected(data.complaint);
      setResponse('');
      setSuccess(data.message);
      await loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not add a complaint response.');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (status) => {
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const { data } = await api.patch(`/complaints/${selected.id}/status`, {
        status,
        note: statusNote,
      });
      setSelected(data.complaint);
      setStatusNote('');
      setSuccess(data.message);
      await loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not update complaint status.');
    } finally {
      setSaving(false);
    }
  };

  const canRespond = selected
    && selected.status !== 'CLOSED'
    && (user?.role === 'ADMIN'
      || Number(selected.complainantId) === Number(user?.id)
      || Number(selected.respondentId) === Number(user?.id));

  return (
    <WorkspaceLayout title="Complaints and resolutions">
      {error && <div className="alert error" role="alert">{error}</div>}
      {success && <div className="alert success" role="status">{success}</div>}
      {user?.role !== 'ADMIN' && (
        <section className="panel">
          <h2>Submit a complaint</h2>
          <form className="workspace-form grid-form" onSubmit={createComplaint}>
            <label>Related order (optional)
              <select value={form.orderId} onChange={(event) => setForm({ ...form, orderId: event.target.value })}>
                <option value="">General complaint</option>
                {orders.map((order) => <option key={order.id} value={order.id}>Order #{order.id}</option>)}
              </select>
            </label>
            <label>Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
              {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            <label className="full-width">Title<input required maxLength={200} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
            <label className="full-width">Details<textarea required rows={4} maxLength={10000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
            <button className="primary-btn" type="submit" disabled={saving}>{saving ? 'Submitting…' : 'Submit complaint'}</button>
          </form>
        </section>
      )}
      <section className="panel">
        <div className="section-title"><h2>{user?.role === 'ADMIN' ? 'All complaints' : 'Your complaints and responses'}</h2><button className="secondary-btn" onClick={loadData} disabled={loading}>Refresh</button></div>
        {loading ? <p>Loading complaints…</p> : complaints.length === 0 ? <p className="empty-state">No complaints have been submitted.</p> : (
          <div className="stack-list">
            {complaints.map((complaint) => (
              <article className="workflow-card" key={complaint.id}>
                <div className="section-title"><div><h3>{complaint.title}</h3><span>{complaint.category.replaceAll('_', ' ')} · {complaint.orderId ? `Order #${complaint.orderId}` : 'General'} · #{complaint.id}</span></div><span className="status-pill">{complaint.status}</span></div>
                {user?.role === 'ADMIN' && <p>{complaint.complainantName} ({complaint.complainantRole}){complaint.respondentName ? ` · Other party: ${complaint.respondentName}` : ''}</p>}
                <p>{complaint.description}</p>
                <button className="secondary-btn" onClick={() => openComplaint(complaint.id)}>View discussion and history</button>
              </article>
            ))}
          </div>
        )}
      </section>
      {selected && (
        <section className="panel">
          <div className="section-title"><h2>{selected.title}</h2><button className="text-button" onClick={() => setSelected(null)}>Close</button></div>
          <p>{selected.description}</p>
          <p><strong>Status:</strong> {selected.status} · <strong>Category:</strong> {selected.category.replaceAll('_', ' ')}</p>
          {selected.history.length > 0 && <ol className="timeline">{selected.history.map((entry) => (
            <li key={entry.id}>
              <strong>{entry.action === 'STATUS' ? entry.status : `${entry.actionByName} responded`}</strong>
              <span>{new Date(entry.createdAt).toLocaleString()} · {entry.actionByName} ({entry.actionByRole})</span>
              {entry.response && <small>{entry.response}</small>}
            </li>
          ))}</ol>}
          {canRespond && (
            <form className="workspace-form" onSubmit={addResponse}>
              <label>Response<textarea required rows={3} maxLength={4000} value={response} onChange={(event) => setResponse(event.target.value)} /></label>
              <button className="primary-btn" type="submit" disabled={saving}>{saving ? 'Sending…' : 'Add response'}</button>
            </form>
          )}
          {user?.role === 'ADMIN' && adminTransitions[selected.status]?.length > 0 && (
            <div className="complaint-admin-actions">
              <label>Status note<textarea rows={2} maxLength={4000} value={statusNote} onChange={(event) => setStatusNote(event.target.value)} /></label>
              <div className="button-row">{adminTransitions[selected.status].map((status) => (
                <button className="secondary-btn" key={status} disabled={saving} onClick={() => changeStatus(status)}>{status.replaceAll('_', ' ')}</button>
              ))}</div>
            </div>
          )}
        </section>
      )}
    </WorkspaceLayout>
  );
}
