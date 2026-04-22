import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Send, Users, User, Clock, CheckCircle, XCircle, Bell } from 'lucide-react';
import toast from 'react-hot-toast';

interface NotifLog {
  id: string;
  title: string;
  body: string;
  target: string;
  sentAt: string;
  status: string;
}

const Notifications = () => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [target, setTarget] = useState<'all' | 'single'>('all');
  const [targetUid, setTargetUid] = useState('');
  const [sending, setSending] = useState(false);
  const [logs, setLogs] = useState<NotifLog[]>([]);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'notifications_log'), orderBy('sentAt', 'desc'), limit(20)));
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as NotifLog)));
    } catch (e) {
      console.log('No notification logs yet');
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      toast.error('Please fill in both title and body.');
      return;
    }
    if (target === 'single' && !targetUid.trim()) {
      toast.error('Please enter a user UID.');
      return;
    }

    setSending(true);
    try {
      // Get the admin's ID token for authorization
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        toast.error('Session expired. Please re-login.');
        return;
      }

      const response = await fetch('/api/send-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          target: target === 'all' ? 'ALL_USERS' : targetUid.trim(),
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(
          target === 'all'
            ? '🔔 Notification sent to all users!'
            : `🔔 Notification sent to user!`
        );
        setTitle('');
        setBody('');
        setTargetUid('');
        fetchLogs(); // Refresh the history
      } else {
        toast.error(data.error || 'Failed to send notification');
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to reach notification API. Check Vercel deployment.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">Notifications</div>
        <div className="topbar-breadcrumb">Send push notifications to merchants</div>
      </div>
      <div className="page-content">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* Composer */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Compose Notification</div>
            </div>
            <form onSubmit={handleSend} style={{ padding: 24 }} className="notif-form">
              <div className="form-group">
                <label className="form-label">Target Audience</label>
                <div className="radio-group">
                  <div
                    className={`radio-option ${target === 'all' ? 'selected' : ''}`}
                    onClick={() => setTarget('all')}
                  >
                    <Users size={16} />
                    All Users
                  </div>
                  <div
                    className={`radio-option ${target === 'single' ? 'selected' : ''}`}
                    onClick={() => setTarget('single')}
                  >
                    <User size={16} />
                    Specific User
                  </div>
                </div>
              </div>

              {target === 'single' && (
                <div className="form-group">
                  <label className="form-label">User UID</label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="Paste the user's Firebase UID"
                    value={targetUid}
                    onChange={(e) => setTargetUid(e.target.value)}
                  />
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Notification Title</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="e.g. 🎉 New Feature: Export to CSV"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={100}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Body Message</label>
                <textarea
                  className="form-textarea"
                  placeholder="Write your notification message here…"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={500}
                />
              </div>

              <button className="btn btn-primary" type="submit" disabled={sending}>
                <Send size={16} />
                {sending ? 'Sending…' : 'Send Notification'}
              </button>
            </form>
          </div>

          {/* History */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Recent Notifications</div>
            </div>
            <div style={{ padding: logs.length > 0 ? 0 : 24 }}>
              {logs.length === 0 ? (
                <div className="empty-state" style={{ padding: '40px 20px' }}>
                  <Bell size={32} style={{ opacity: 0.3 }} />
                  <p>No notifications sent yet</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {logs.map((log) => (
                    <div key={log.id} style={{
                      padding: '14px 24px',
                      borderBottom: '1px solid var(--border-light)',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                    }}>
                      {log.status === 'sent' ? (
                        <CheckCircle size={16} color="var(--success)" style={{ marginTop: 2, flexShrink: 0 }} />
                      ) : log.status === 'failed' ? (
                        <XCircle size={16} color="var(--danger)" style={{ marginTop: 2, flexShrink: 0 }} />
                      ) : (
                        <Clock size={16} color="var(--warning)" style={{ marginTop: 2, flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{log.title}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>{log.body}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 6, display: 'flex', gap: 12 }}>
                          <span>To: {log.target === 'ALL_USERS' ? 'All Users' : log.target?.substring(0, 12) + '…'}</span>
                          {log.sentAt && <span>{new Date(log.sentAt).toLocaleString('en-IN')}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Notifications;
