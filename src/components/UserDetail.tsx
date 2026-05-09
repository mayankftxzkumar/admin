import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  ArrowLeft, ShieldBan, ShieldCheck, Store, Package, Receipt, Users as UsersIcon,
  IndianRupee, AlertTriangle, Calendar, Phone,
} from 'lucide-react';
import md5 from '../lib/md5';
import toast from 'react-hot-toast';

interface UserData {
  uid: string;
  email: string;
  shopName: string;
  businessType: string;
  disabled: boolean;
  products: any[];
  bills: any[];
  customers: any[];
  dues: any[];
}

type Tab = 'overview' | 'products' | 'bills' | 'customers' | 'dues';

const formatINR = (v: number): string => {
  const abs = Math.abs(v);
  if (abs >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return `₹${v.toLocaleString('en-IN')}`;
};

const UserDetail = () => {
  const { uid } = useParams<{ uid: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [blocking, setBlocking] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);

  useEffect(() => { if (uid) fetchUserDetail(uid); }, [uid]);

  const fetchUserDetail = async (userId: string) => {
    setLoading(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (!userDoc.exists()) {
        toast.error('User not found');
        navigate('/users');
        return;
      }
      const data = userDoc.data();

      const [productsSnap, billsSnap, customersSnap, duesSnap] = await Promise.all([
        getDocs(collection(db, 'users', userId, 'products')),
        getDocs(collection(db, 'users', userId, 'bills')),
        getDocs(collection(db, 'users', userId, 'customers')),
        getDocs(collection(db, 'users', userId, 'dues')),
      ]);

      setUser({
        uid: userId,
        email: data.email || '—',
        shopName: data.shopName || 'Unnamed',
        businessType: data.businessType || '—',
        disabled: data.disabled || false,
        products: productsSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => a.name?.localeCompare(b.name || '')),
        bills: billsSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        customers: customersSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        dues: duesSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => new Date(b.dueDate || 0).getTime() - new Date(a.dueDate || 0).getTime()),
      });
    } catch (err) {
      console.error(err);
      toast.error('Failed to load user');
    } finally {
      setLoading(false);
    }
  };

  const performBlock = async () => {
    if (!user || !uid) return;
    setBlocking(true);
    setShowBlockModal(false);
    try {
      const newStatus = !user.disabled;
      await updateDoc(doc(db, 'users', uid), { disabled: newStatus });
      setUser({ ...user, disabled: newStatus });
      toast.success(newStatus ? 'Merchant blocked' : 'Merchant unblocked');
    } catch (err) {
      toast.error('Failed to update merchant status');
    } finally {
      setBlocking(false);
    }
  };

  const getGravatar = (email: string) =>
    `https://www.gravatar.com/avatar/${md5(email.trim().toLowerCase())}?d=mp&s=128`;

  if (loading || !user) {
    return (
      <div className="page-content">
        <div className="loading-state">
          <div className="spinner" />
          <span>Loading merchant…</span>
        </div>
      </div>
    );
  }

  const totalRevenue = user.bills.reduce((s: number, b: any) => s + (b.totalAmount || 0), 0);
  const lowStock = user.products.filter((p: any) => (p.quantity || 0) <= (p.lowStockThreshold || 5)).length;
  const outstandingDues = user.dues.filter((d: any) => !d.isPaid).reduce((s: number, d: any) => s + (d.remainingAmount || d.amount || 0), 0);
  const last30Bills = user.bills.filter((b: any) => {
    const d = new Date(b.date);
    return Date.now() - d.getTime() < 30 * 24 * 60 * 60 * 1000;
  });
  const last30Revenue = last30Bills.reduce((s: number, b: any) => s + (b.totalAmount || 0), 0);
  const recentBills = user.bills.slice(0, 5);

  return (
    <div className="page-content">
      {/* Top action bar */}
      <button className="btn btn-secondary btn-sm" onClick={() => navigate('/users')} style={{ marginBottom: 16 }}>
        <ArrowLeft size={14} /> Back to merchants
      </button>

      {/* Header */}
      <div className="detail-header">
        <div className="detail-user">
          <div className="detail-avatar">
            <img src={getGravatar(user.email)} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
          </div>
          <div>
            <div className="detail-name">{user.shopName}</div>
            <div className="detail-email">{user.email}</div>
            <div className="detail-meta">
              <span className="detail-meta-item"><Store size={13} /> {user.businessType}</span>
              <span className="detail-meta-item">UID: {user.uid.substring(0, 8)}…</span>
            </div>
          </div>
        </div>
        <div className="detail-actions">
          <span className={`badge ${user.disabled ? 'blocked' : 'active'}`}>
            <span className="badge-dot" />
            {user.disabled ? 'Blocked' : 'Active'}
          </span>
          <button
            className={`btn btn-sm ${user.disabled ? 'btn-success' : 'btn-danger'}`}
            onClick={() => setShowBlockModal(true)}
            disabled={blocking}
          >
            {user.disabled ? <><ShieldCheck size={14} /> Unblock</> : <><ShieldBan size={14} /> Block</>}
          </button>
        </div>
      </div>

      {/* Stat row (always visible) */}
      <div className="detail-stats-row">
        <div className="mini-stat">
          <div className="mini-stat-label">Lifetime Revenue</div>
          <div className="mini-stat-value" title={`₹${totalRevenue.toLocaleString('en-IN')}`}>{formatINR(totalRevenue)}</div>
          <div className="mini-stat-sub">{user.bills.length} bills</div>
        </div>
        <div className="mini-stat">
          <div className="mini-stat-label">Last 30 Days</div>
          <div className="mini-stat-value">{formatINR(last30Revenue)}</div>
          <div className="mini-stat-sub">{last30Bills.length} bills</div>
        </div>
        <div className="mini-stat">
          <div className="mini-stat-label">Products</div>
          <div className="mini-stat-value">{user.products.length}</div>
          <div className="mini-stat-sub" style={{ color: lowStock > 0 ? 'var(--danger)' : undefined }}>
            {lowStock > 0 ? `${lowStock} low stock` : 'All in stock'}
          </div>
        </div>
        <div className="mini-stat">
          <div className="mini-stat-label">Outstanding Dues</div>
          <div className="mini-stat-value" style={{ color: outstandingDues > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
            {formatINR(outstandingDues)}
          </div>
          <div className="mini-stat-sub">{user.dues.filter((d: any) => !d.isPaid).length} unpaid</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="detail-tabs">
        <button className={`detail-tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
          Overview
        </button>
        <button className={`detail-tab ${activeTab === 'products' ? 'active' : ''}`} onClick={() => setActiveTab('products')}>
          Products ({user.products.length})
        </button>
        <button className={`detail-tab ${activeTab === 'bills' ? 'active' : ''}`} onClick={() => setActiveTab('bills')}>
          Bills ({user.bills.length})
        </button>
        <button className={`detail-tab ${activeTab === 'customers' ? 'active' : ''}`} onClick={() => setActiveTab('customers')}>
          Customers ({user.customers.length})
        </button>
        <button className={`detail-tab ${activeTab === 'dues' ? 'active' : ''}`} onClick={() => setActiveTab('dues')}>
          Dues ({user.dues.length})
        </button>
      </div>

      {/* Overview */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Recent bills */}
          <div className="card">
            <div className="section-header">
              <div className="section-title">Recent bills</div>
              {user.bills.length > 5 && <span className="section-link" onClick={() => setActiveTab('bills')}>View all</span>}
            </div>
            {recentBills.length === 0 ? (
              <div className="empty-state-v2"><div className="empty-icon"><Receipt size={20} /></div><h3>No bills yet</h3><p>This merchant hasn't generated any bills.</p></div>
            ) : (
              recentBills.map((b: any) => (
                <div key={b.id} style={{ padding: '12px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{b.customerName || 'Walk-in customer'}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {b.date ? new Date(b.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'} · {b.items?.length || 0} items · {b.paymentMethod || '—'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>₹{(b.totalAmount || 0).toLocaleString('en-IN')}</div>
                    <span className={`badge ${b.isPaid !== false ? 'active' : 'blocked'}`} style={{ marginTop: 2 }}>
                      <span className="badge-dot" />{b.isPaid !== false ? 'Paid' : 'Unpaid'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Top products by stock */}
          <div className="card">
            <div className="section-header">
              <div className="section-title">{lowStock > 0 ? '⚠️ Low stock alerts' : 'Inventory snapshot'}</div>
              {user.products.length > 5 && <span className="section-link" onClick={() => setActiveTab('products')}>View all</span>}
            </div>
            {user.products.length === 0 ? (
              <div className="empty-state-v2"><div className="empty-icon"><Package size={20} /></div><h3>No products</h3><p>This merchant hasn't added any products yet.</p></div>
            ) : (() => {
              const display = lowStock > 0
                ? user.products.filter((p: any) => (p.quantity || 0) <= (p.lowStockThreshold || 5)).slice(0, 5)
                : user.products.slice(0, 5);
              return display.map((p: any) => (
                <div key={p.id} style={{ padding: '12px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{p.category || 'Uncategorized'} · ₹{(p.price || 0).toLocaleString('en-IN')}/{p.unit || 'pc'}</div>
                  </div>
                  <div style={{ textAlign: 'right', marginLeft: 12 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: (p.quantity || 0) <= (p.lowStockThreshold || 5) ? 'var(--danger)' : 'inherit' }}>
                      {p.quantity || 0} {p.unit || 'pc'}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>in stock</div>
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {/* Products */}
      {activeTab === 'products' && (
        <div className="card">
          {user.products.length === 0 ? (
            <div className="empty-state-v2"><div className="empty-icon"><Package size={20} /></div><h3>No products listed</h3><p>This merchant hasn't added any products to their inventory yet.</p></div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Unit</th>
                </tr>
              </thead>
              <tbody>
                {user.products.map((p: any) => (
                  <tr key={p.id} style={{ cursor: 'default' }}>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{p.category || '—'}</td>
                    <td>₹{(p.price || 0).toLocaleString('en-IN')}</td>
                    <td>
                      <span style={{
                        color: (p.quantity || 0) <= (p.lowStockThreshold || 5) ? 'var(--danger)' : 'inherit',
                        fontWeight: (p.quantity || 0) <= (p.lowStockThreshold || 5) ? 600 : 400,
                      }}>
                        {p.quantity || 0}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{p.unit || 'piece'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Bills */}
      {activeTab === 'bills' && (
        <div className="card">
          {user.bills.length === 0 ? (
            <div className="empty-state-v2"><div className="empty-icon"><Receipt size={20} /></div><h3>No bills generated</h3><p>This merchant hasn't created any bills yet.</p></div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th><th>Customer</th><th>Items</th><th>Amount</th><th>Payment</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {user.bills.map((b: any) => (
                  <tr key={b.id} style={{ cursor: 'default' }}>
                    <td><Calendar size={12} style={{ marginRight: 6, opacity: 0.5, verticalAlign: 'middle' }} />{b.date ? new Date(b.date).toLocaleDateString('en-IN') : '—'}</td>
                    <td>{b.customerName || <span style={{ color: 'var(--text-muted)' }}>Walk-in</span>}</td>
                    <td>{b.items?.length || 0}</td>
                    <td style={{ fontWeight: 600 }}>₹{(b.totalAmount || 0).toLocaleString('en-IN')}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{b.paymentMethod || '—'}</td>
                    <td>
                      <span className={`badge ${b.isPaid !== false ? 'active' : 'blocked'}`}>
                        <span className="badge-dot" />{b.isPaid !== false ? 'Paid' : 'Unpaid'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Customers */}
      {activeTab === 'customers' && (
        <div className="card">
          {user.customers.length === 0 ? (
            <div className="empty-state-v2"><div className="empty-icon"><UsersIcon size={20} /></div><h3>No customers tracked</h3><p>Customers are automatically saved when bills are generated with a phone number.</p></div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th><th>Phone</th><th>First seen</th>
                </tr>
              </thead>
              <tbody>
                {user.customers.map((c: any) => (
                  <tr key={c.id} style={{ cursor: 'default' }}>
                    <td style={{ fontWeight: 600 }}>{c.name || '—'}</td>
                    <td><Phone size={12} style={{ marginRight: 6, opacity: 0.5, verticalAlign: 'middle' }} />{c.phone || c.id || '—'}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{c.firstSeen ? new Date(c.firstSeen).toLocaleDateString('en-IN') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Dues */}
      {activeTab === 'dues' && (
        <div className="card">
          {user.dues.length === 0 ? (
            <div className="empty-state-v2"><div className="empty-icon"><IndianRupee size={20} /></div><h3>No dues recorded</h3><p>Outstanding bills marked as unpaid will show up here.</p></div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer</th><th>Phone</th><th>Amount</th><th>Paid</th><th>Remaining</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {user.dues.map((d: any) => {
                  const remaining = d.remainingAmount ?? ((d.amount || 0) - (d.paidAmount || 0));
                  return (
                    <tr key={d.id} style={{ cursor: 'default' }}>
                      <td style={{ fontWeight: 600 }}>{d.customerName || '—'}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{d.customerPhone || '—'}</td>
                      <td>₹{(d.amount || 0).toLocaleString('en-IN')}</td>
                      <td style={{ color: 'var(--success)' }}>₹{(d.paidAmount || 0).toLocaleString('en-IN')}</td>
                      <td style={{ fontWeight: 600, color: remaining > 0 ? 'var(--danger)' : 'inherit' }}>
                        ₹{remaining.toLocaleString('en-IN')}
                      </td>
                      <td>
                        <span className={`badge ${d.isPaid ? 'active' : 'blocked'}`}>
                          <span className="badge-dot" />{d.isPaid ? 'Paid' : 'Pending'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Block confirm modal */}
      {showBlockModal && (
        <div className="modal-overlay" onClick={() => setShowBlockModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className={`modal-icon ${user.disabled ? 'success' : 'danger'}`}>
              {user.disabled ? <ShieldCheck size={24} /> : <AlertTriangle size={24} />}
            </div>
            <div className="modal-title">
              {user.disabled ? 'Unblock this merchant?' : 'Block this merchant?'}
            </div>
            <div className="modal-text">
              {user.disabled
                ? `${user.shopName} will regain full access to the app and be able to sync data again.`
                : `${user.shopName} will lose access to the app on their next launch. Their data is preserved and can be restored later by unblocking.`}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => setShowBlockModal(false)}>Cancel</button>
              <button
                className={`btn btn-sm ${user.disabled ? 'btn-success' : 'btn-danger'}`}
                onClick={performBlock}
                disabled={blocking}
              >
                {user.disabled ? 'Yes, unblock' : 'Yes, block'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserDetail;
