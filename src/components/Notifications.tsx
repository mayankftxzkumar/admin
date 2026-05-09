import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Send, Users, User, Clock, CheckCircle, XCircle, Bell, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

interface NotifLog {
  id: string;
  title: string;
  body: string;
  target: string;
  sentAt: string;
  status: string;
}

interface Template {
  id: string;
  emoji: string;
  label: string;
  title: string;
  body: string;
}

const TEMPLATES: Template[] = [
  {
    id: 'welcome',
    emoji: '👋',
    label: 'Welcome',
    title: '👋 Welcome to Vyapify!',
    body: 'Thanks for joining. Set up your shop in under 2 minutes and start billing today.',
  },
  {
    id: 'feature',
    emoji: '✨',
    label: 'New feature',
    title: '✨ New: Customer dues tracking',
    body: 'Track unpaid bills and outstanding amounts directly from the dashboard.',
  },
  {
    id: 'reminder',
    emoji: '🔔',
    label: 'Daily reminder',
    title: '🔔 Don\'t miss a sale today',
    body: 'Open Vyapify to record today\'s bills and keep your inventory up to date.',
  },
  {
    id: 'maintenance',
    emoji: '🛠',
    label: 'Maintenance',
    title: '🛠 Scheduled maintenance tonight',
    body: 'Vyapify will be briefly unavailable from 2–3 AM IST for system upgrades.',
  },
  {
    id: 'tip',
    emoji: '💡',
    label: 'Pro tip',
    title: '💡 Did you know?',
    body: 'You can scan product names with your camera using OCR — no typing required.',
  },
];

const TITLE_MAX = 100;
const BODY_MAX = 240;

const Notifications = () => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [target, setTarget] = useState<'all' | 'single'>('all');
  const [targetUid, setTargetUid] = useState('');
  const [sending, setSending] = useState(false);
  const [logs, setLogs] = useState<NotifLog[]>([]);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'sent' | 'failed'>('all');

  useEffect(() => { fetchLogs(); }, []);

  const fetchLogs = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'notifications_log'), orderBy('sentAt', 'desc'), limit(20)));
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as NotifLog)));
    } catch {
      // no logs collection yet — silent
    }
  };

  const applyTemplate = (t: Template) => {
    setTitle(t.title);
    setBody(t.body);
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
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        toast.error('Session expired. Please re-login.');
        return;
      }

      const response = await fetch('/api/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          target: target === 'all' ? 'ALL_USERS' : targetUid.trim(),
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(target === 'all' ? '🔔 Sent to all merchants!' : '🔔 Sent successfully');
        setTitle('');
        setBody('');
        setTargetUid('');
        fetchLogs();
      } else {
        toast.error(data.error || 'Failed to send notification');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to reach notification API. Check Vercel deployment.');
    } finally {
      setSending(false);
    }
  };

  const filteredLogs = logs.filter(l => {
    if (historyFilter === 'all') return true;
    if (historyFilter === 'sent') return l.status === 'sent';
    if (historyFilter === 'failed') return l.status === 'failed';
    return true;
  });

  const previewTitle = title || 'Your notification title';
  const previewBody = body || 'Your message body will appear here as you type. Keep it short and clear.';

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <div className="page-header-title">Notifications</div>
          <div className="page-header-subtitle">Send push notifications to merchants. Live preview on the right.</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 24, alignItems: 'flex-start' }}>
        {/* Left: composer + history */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Compose</div>
            </div>
            <form onSubmit={handleSend} style={{ padding: 24 }} className="notif-form">
              {/* Templates */}
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={13} /> Quick templates
                </label>
                <div className="template-row">
                  {TEMPLATES.map(t => (
                    <button key={t.id} type="button" className="template-btn" onClick={() => applyTemplate(t)}>
                      {t.emoji} {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target */}
              <div className="form-group">
                <label className="form-label">Target audience</label>
                <div className="radio-group">
                  <div className={`radio-option ${target === 'all' ? 'selected' : ''}`} onClick={() => setTarget('all')}>
                    <Users size={16} /> All merchants
                  </div>
                  <div className={`radio-option ${target === 'single' ? 'selected' : ''}`} onClick={() => setTarget('single')}>
                    <User size={16} /> Specific merchant
                  </div>
                </div>
              </div>

              {target === 'single' && (
                <div className="form-group">
                  <label className="form-label">Merchant UID</label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="Paste the merchant's Firebase UID"
                    value={targetUid}
                    onChange={(e) => setTargetUid(e.target.value)}
                  />
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Title</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="e.g. ✨ New feature: CSV export"
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
                  maxLength={TITLE_MAX}
                />
                <div className={`char-counter ${title.length > TITLE_MAX * 0.9 ? 'warn' : ''}`}>
                  {title.length} / {TITLE_MAX}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Message body</label>
                <textarea
                  className="form-textarea"
                  placeholder="Write your notification message here…"
                  value={body}
                  onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
                  maxLength={BODY_MAX}
                  rows={4}
                />
                <div className={`char-counter ${body.length > BODY_MAX * 0.9 ? 'warn' : ''}`}>
                  {body.length} / {BODY_MAX}
                </div>
              </div>

              <button className="btn btn-primary" type="submit" disabled={sending || !title.trim() || !body.trim()}>
                <Send size={15} />
                {sending ? 'Sending…' : `Send to ${target === 'all' ? 'all merchants' : '1 merchant'}`}
              </button>
            </form>
          </div>

          {/* History */}
          <div className="card">
            <div className="section-header">
              <div className="section-title">Recent notifications</div>
              <div className="chip-row">
                <div className={`chip ${historyFilter === 'all' ? 'selected' : ''}`} onClick={() => setHistoryFilter('all')} style={{ padding: '4px 10px', fontSize: '0.7rem' }}>
                  All <span className="chip-count">{logs.length}</span>
                </div>
                <div className={`chip ${historyFilter === 'sent' ? 'selected' : ''}`} onClick={() => setHistoryFilter('sent')} style={{ padding: '4px 10px', fontSize: '0.7rem' }}>
                  Sent <span className="chip-count">{logs.filter(l => l.status === 'sent').length}</span>
                </div>
                <div className={`chip ${historyFilter === 'failed' ? 'selected' : ''}`} onClick={() => setHistoryFilter('failed')} style={{ padding: '4px 10px', fontSize: '0.7rem' }}>
                  Failed <span className="chip-count">{logs.filter(l => l.status === 'failed').length}</span>
                </div>
              </div>
            </div>
            {filteredLogs.length === 0 ? (
              <div className="empty-state-v2">
                <div className="empty-icon"><Bell size={20} /></div>
                <h3>{logs.length === 0 ? 'No notifications sent yet' : 'No matches'}</h3>
                <p>{logs.length === 0 ? 'Compose your first notification above.' : 'Try a different filter.'}</p>
              </div>
            ) : (
              filteredLogs.map(log => (
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
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>{log.body}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 6, display: 'flex', gap: 12 }}>
                      <span>{log.target === 'ALL_USERS' ? 'All merchants' : `User: ${log.target?.substring(0, 12)}…`}</span>
                      {log.sentAt && <span>{new Date(log.sentAt).toLocaleString('en-IN')}</span>}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: live phone preview */}
        <div style={{ position: 'sticky', top: 24 }}>
          <div className="card" style={{ padding: 24 }}>
            <div className="section-title" style={{ marginBottom: 16, textAlign: 'center' }}>Live preview</div>
            <div className="phone-preview">
              <div className="phone-status-bar">
                <span>9:41</span>
                <span>📶 100%</span>
              </div>
              <div className="phone-notif">
                <div className="phone-notif-icon">V</div>
                <div className="phone-notif-content">
                  <div className="phone-notif-app">
                    <span>VYAPIFY</span>
                    <span>now</span>
                  </div>
                  <div className="phone-notif-title">{previewTitle}</div>
                  <div className="phone-notif-body">{previewBody}</div>
                </div>
              </div>
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 12 }}>
              This is how your notification will look on a merchant's phone.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Notifications;
