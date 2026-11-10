import { useEffect, useState } from 'react';
import WorkspaceLayout from '../components/WorkspaceLayout';
import api from '../services/api';

const fields = [
  ['name', 'Business name'],
  ['businessType', 'Business type'],
  ['phone', 'Phone'],
  ['address', 'Address'],
  ['website', 'Website'],
  ['taxIdentifier', 'Tax identifier'],
  ['description', 'Description'],
];

export default function BusinessProfilePage() {
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadProfile = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/businesses/me');
      setForm(data.business);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load business profile.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProfile(); }, []);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = Object.fromEntries(fields.map(([key]) => [key, form[key] || '']));
      const { data } = await api.patch('/businesses/me', payload);
      setForm(data.business);
      setSuccess(data.message);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not save business profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <WorkspaceLayout title="Business profile">
      <section className="panel">
        {loading ? <p>Loading business profile…</p> : (
          <form className="workspace-form" onSubmit={save}>
            {error && <div className="alert error" role="alert">{error}</div>}
            {success && <div className="alert success" role="status">{success}</div>}
            {fields.map(([key, label]) => (
              <label key={key}>
                {label}
                {key === 'description' || key === 'address'
                  ? <textarea rows={key === 'description' ? 4 : 3} value={form[key] || ''} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
                  : <input value={form[key] || ''} onChange={(event) => setForm({ ...form, [key]: event.target.value })} required={key === 'name'} />}
              </label>
            ))}
            <button className="primary-btn" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
          </form>
        )}
      </section>
    </WorkspaceLayout>
  );
}
