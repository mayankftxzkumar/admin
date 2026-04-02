import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ArrowLeft, ShieldBan, ShieldCheck, Store, Package, Receipt } from 'lucide-react';
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
}

const UserDetail = () => {
  const { uid } = useParams<{ uid: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'products' | 'bills'>('products');
  const [blocking, setBlocking] = useState(false);

  useEffect(() => {
    if (uid) fetchUserDetail(uid);
  }, [uid]);

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

      const productsSnap = await getDocs(collection(db, 'users', userId, 'products'));
      const products = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const billsSnap = await getDocs(collection(db, 'users', userId, 'bills'));
      const bills = billsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      setUser({
        uid: userId,
        email: data.email || '—',
        shopName: data.shopName || 'Unnamed',
        businessType: data.businessType || '—',
        disabled: data.disabled || false,
        products: products.sort((a: any, b: any) => a.name?.localeCompare(b.name || '')),
        bills: bills.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()),
      });
    } catch (err) {
      console.error(err);
      toast.error('Failed to load user');
    } finally {
      setLoading(false);
    }
  };

  const toggleBlock = async () => {
    if (!user || !uid) return;
    setBlocking(true);
    try {
      const newStatus = !user.disabled;
      await updateDoc(doc(db, 'users', uid), { disabled: newStatus });
      setUser({ ...user, disabled: newStatus });
      toast.success(newStatus ? 'User blocked' : 'User unblocked');
    } catch (err) {
      toast.error('Failed to update user status');
    } finally {
      setBlocking(false);
    }
  };

  const getGravatar = (email: string) => {
    const hash = md5(email.trim().toLowerCase());
    return `https://www.gravatar.com/avatar/${hash}?d=mp&s=128`;
  };

  if (loading || !user) {
    return (
      <>
        <div className="topbar">
          <div className="topbar-title">User Detail</div>
        </div>
        <div className="page-content">
          <div className="loading-state">
            <div className="spinner" />
            <span>Loading user…</span>
          </div>
        </div>
      </>
    );
  }

  const totalRevenue = user.bills.reduce((sum: number, b: any) => sum + (b.totalAmount || 0), 0);

  return (
    <>
      <div className="topbar">
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/users')}>
          <ArrowLeft size={16} /> Back to Users
        </button>
      </div>
      <div className="page-content">
        <div className="detail-header">
          <div className="detail-user">
            <div className="detail-avatar">
              <img src={getGravatar(user.email)} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
            </div>
            <div>
              <div className="detail-name">{user.shopName}</div>
              <div className="detail-email">{user.email}</div>
              <div className="detail-meta">
                <span className="detail-meta-item"><Store size={14} /> {user.businessType}</span>
                <span className="detail-meta-item"><Package size={14} /> {user.products.length} products</span>
                <span className="detail-meta-item"><Receipt size={14} /> {user.bills.length} bills</span>
                <span className="detail-meta-item" style={{ fontWeight: 700, color: '#10B981' }}>₹{totalRevenue.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>
          <div className="detail-actions">
            <span className={`badge ${user.disabled ? 'blocked' : 'active'}`} style={{ marginRight: 8 }}>
              <span className="badge-dot" />
              {user.disabled ? 'Blocked' : 'Active'}
            </span>
            <button 
              className={`btn btn-sm ${user.disabled ? 'btn-success' : 'btn-danger'}`}  
              onClick={toggleBlock}
              disabled={blocking}
            >
              {user.disabled ? <><ShieldCheck size={14} /> Unblock</> : <><ShieldBan size={14} /> Block</>}
            </button>
          </div>
        </div>

        <div className="detail-tabs">
          <button className={`detail-tab ${activeTab === 'products' ? 'active' : ''}`} onClick={() => setActiveTab('products')}>
            Products ({user.products.length})
          </button>
          <button className={`detail-tab ${activeTab === 'bills' ? 'active' : ''}`} onClick={() => setActiveTab('bills')}>
            Bills ({user.bills.length})
          </button>
        </div>

        {activeTab === 'products' && (
          <div className="card">
            {user.products.length === 0 ? (
              <div className="empty-state"><p>No products listed yet.</p></div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product Name</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Stock</th>
                    <th>Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {user.products.map((p: any) => (
                    <tr key={p.id} style={{ cursor: 'default' }}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td>{p.category || '—'}</td>
                      <td>₹{(p.price || 0).toLocaleString('en-IN')}</td>
                      <td>
                        <span style={{ color: (p.quantity || 0) <= (p.lowStockThreshold || 5) ? 'var(--danger)' : 'inherit' }}>
                          {p.quantity || 0}
                        </span>
                      </td>
                      <td>{p.unit || 'piece'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'bills' && (
          <div className="card">
            {user.bills.length === 0 ? (
              <div className="empty-state"><p>No bills generated yet.</p></div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Items</th>
                    <th>Amount</th>
                    <th>Payment</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {user.bills.map((b: any) => (
                    <tr key={b.id} style={{ cursor: 'default' }}>
                      <td>{b.date ? new Date(b.date).toLocaleDateString('en-IN') : '—'}</td>
                      <td>{b.customerName || 'Walk-in'}</td>
                      <td>{b.items?.length || 0} items</td>
                      <td style={{ fontWeight: 600 }}>₹{(b.totalAmount || 0).toLocaleString('en-IN')}</td>
                      <td>{b.paymentMethod || '—'}</td>
                      <td>
                        <span className={`badge ${b.isPaid !== false ? 'active' : 'blocked'}`}>
                          <span className="badge-dot" />
                          {b.isPaid !== false ? 'Paid' : 'Unpaid'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default UserDetail;
