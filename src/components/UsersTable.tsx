import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronRight } from 'lucide-react';
import md5 from '../lib/md5';

interface UserRow {
  uid: string;
  email: string;
  shopName: string;
  businessType: string;
  productCount: number;
  billCount: number;
  totalRevenue: number;
  disabled: boolean;
}

const UsersTable = () => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [filtered, setFiltered] = useState<UserRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFiltered(users);
    } else {
      const q = searchQuery.toLowerCase();
      setFiltered(users.filter(u =>
        u.shopName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.businessType.toLowerCase().includes(q)
      ));
    }
  }, [searchQuery, users]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const userList: UserRow[] = [];

      const BATCH = 20;
      const userDocs = usersSnap.docs;
      for (let i = 0; i < userDocs.length; i += BATCH) {
        const batch = userDocs.slice(i, i + BATCH);
        const rows = await Promise.all(batch.map(async (userDoc) => {
          const data = userDoc.data();
          const [productsSnap, billsSnap] = await Promise.all([
            getDocs(collection(db, 'users', userDoc.id, 'products')),
            getDocs(collection(db, 'users', userDoc.id, 'bills')),
          ]);
          let totalRevenue = 0;
          billsSnap.forEach(b => { totalRevenue += b.data().totalAmount || 0; });
          return {
            uid: userDoc.id,
            email: data.email || '—',
            shopName: data.shopName || 'Unnamed Shop',
            businessType: data.businessType || '—',
            productCount: productsSnap.size,
            billCount: billsSnap.size,
            totalRevenue,
            disabled: data.disabled || false,
          } as UserRow;
        }));
        userList.push(...rows);
      }

      setUsers(userList);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  const getGravatarUrl = (email: string) => {
    const hash = md5(email.trim().toLowerCase());
    return `https://www.gravatar.com/avatar/${hash}?d=mp&s=72`;
  };

  if (loading) {
    return (
      <>
        <div className="topbar">
          <div className="topbar-title">Users</div>
        </div>
        <div className="page-content">
          <div className="loading-state">
            <div className="spinner" />
            <span>Loading users…</span>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">Users</div>
        <div className="topbar-breadcrumb">{users.length} registered merchants</div>
      </div>
      <div className="page-content">
        <div className="card">
          <div className="card-header">
            <div className="card-title">All Merchants</div>
            <div className="search-wrapper">
              <Search size={16} />
              <input
                className="search-input"
                type="text"
                placeholder="Search by shop name, email…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">
              <p>No users found</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Merchant</th>
                  <th>Business</th>
                  <th>Products</th>
                  <th>Bills</th>
                  <th>Revenue</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => (
                  <tr key={user.uid} onClick={() => navigate(`/users/${user.uid}`)}>
                    <td>
                      <div className="user-cell">
                        <div className="user-avatar">
                          <img src={getGravatarUrl(user.email)} alt="" />
                        </div>
                        <div>
                          <div className="user-name">{user.shopName}</div>
                          <div className="user-email">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>{user.businessType}</td>
                    <td>{user.productCount}</td>
                    <td>{user.billCount}</td>
                    <td>₹{user.totalRevenue.toLocaleString('en-IN')}</td>
                    <td>
                      <span className={`badge ${user.disabled ? 'blocked' : 'active'}`}>
                        <span className="badge-dot" />
                        {user.disabled ? 'Blocked' : 'Active'}
                      </span>
                    </td>
                    <td><ChevronRight size={16} color="#9CA3AF" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
};

export default UsersTable;
