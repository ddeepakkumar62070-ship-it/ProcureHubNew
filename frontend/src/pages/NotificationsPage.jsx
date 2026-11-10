import { useCallback, useEffect, useState } from 'react';
import WorkspaceLayout from '../components/WorkspaceLayout';
import api from '../services/api';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/notifications');
      setNotifications(data.notifications);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load notifications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  const markRead = async (id) => {
    setError('');
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((current) => current.map((item) => (
        item.id === id ? { ...item, readAt: new Date().toISOString() } : item
      )));
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not mark notification as read.');
    }
  };

  return (
    <WorkspaceLayout title="Notifications">
      {error && <div className="alert error" role="alert">{error}</div>}
      <section className="panel">
        <div className="section-title"><h2>Recent activity</h2><button className="secondary-btn" onClick={loadNotifications}>Refresh</button></div>
        {loading ? <p>Loading notifications…</p> : notifications.length === 0 ? <p className="empty-state">You have no notifications.</p> : (
          <div className="stack-list">
            {notifications.map((item) => (
              <article className={`notification-card${item.readAt ? '' : ' unread'}`} key={item.id}>
                <div className="section-title"><strong>{String(item.type).replaceAll('_', ' ')}</strong><span>{new Date(item.createdAt).toLocaleString()}</span></div>
                <p>{item.message}</p>
                {!item.readAt && <button className="text-button" onClick={() => markRead(item.id)}>Mark as read</button>}
              </article>
            ))}
          </div>
        )}
      </section>
    </WorkspaceLayout>
  );
}
