import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, getCountFromServer, getAggregateFromServer, sum, count } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronRight, Users as UsersIcon, ShieldBan, Activity, ChevronLeft, ChevronsLeft, ChevronsRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
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

type SortKey = 'shopName' | 'productCount' | 'billCount' | 'totalRevenue';
type SortDir = 'asc' | 'desc';
type FilterMode = 'all' | 'active' | 'blocked';

const PAGE_SIZE = 15;

const formatINR = (v: number): string => {
  const abs = Math.abs(v);
  if (abs >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return `₹${v.toLocaleString('en-IN')}`;
};

const UsersTable = () => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [sortKey, setSortKey] = useState<SortKey>('totalRevenue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  useEffect(() => { fetchUsers(); }, []);
  useEffect(() => { setPage(1); }, [searchQuery, filter]);

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
          const [productsCount, billsAgg] = await Promise.all([
            getCountFromServer(collection(db, 'users', userDoc.id, 'products')),
            getAggregateFromServer(collection(db, 'users', userDoc.id, 'bills'), {
              billCount: count(),
              totalRevenue: sum('totalAmount'),
            }),
          ]);
          return {
            uid: userDoc.id,
            email: data.email || '—',
            shopName: data.shopName || 'Unnamed Shop',
            businessType: data.businessType || '—',
            productCount: productsCount.data().count,
            billCount: billsAgg.data().billCount,
            totalRevenue: billsAgg.data().totalRevenue || 0,
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

  // Counts (always computed from full set, not after search/sort)
  const counts = useMemo(() => ({
    all: users.length,
    active: users.filter(u => !u.disabled).length,
    blocked: users.filter(u => u.disabled).length,
  }), [users]);

  // Apply filter + search + sort
  const processed = useMemo(() => {
    let list = users;
    if (filter === 'active') list = list.filter(u => !u.disabled);
    if (filter === 'blocked') list = list.filter(u => u.disabled);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(u =>
        u.shopName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.businessType.toLowerCase().includes(q)
      );
    }
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'shopName') cmp = a.shopName.localeCompare(b.shopName);
      else cmp = (a[sortKey] as number) - (b[sortKey] as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [users, filter, searchQuery, sortKey, sortDir]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(processed.length / PAGE_SIZE));
  const pageRows = processed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'shopName' ? 'asc' : 'desc'); }
  };

  const SortHeader = ({ label, k, align = 'left' }: { label: string; k: SortKey; align?: 'left' | 'right' }) => {
    const sorted = sortKey === k;
    return (
      <th
        className={`sortable ${sorted ? 'sorted' : ''}`}
        onClick={() => handleSort(k)}
        style={{ textAlign: align }}
      >
        {label}
        <span className="sort-arrow">
          {!sorted ? <ArrowUpDown size={11} /> : sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
        </span>
      </th>
    );
  };

  if (loading) {
    return (
      <div className="page-content">
        <div className="loading-state">
          <div className="spinner" />
          <span>Loading merchants…</span>
        </div>
      </div>
    );
  }

  const getGravatarUrl = (email: string) =>
    `https://www.gravatar.com/avatar/${md5(email.trim().toLowerCase())}?d=mp&s=72`;

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <div className="page-header-title">Merchants</div>
          <div className="page-header-subtitle">{counts.all} registered · {counts.active} active · {counts.blocked} blocked</div>
        </div>
        <div className="page-header-actions">
          <div className="search-wrapper">
            <Search size={16} />
            <input
              className="search-input"
              type="text"
              placeholder="Search shop, email, business…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Filter chips */}
      <div className="chip-row" style={{ marginBottom: 16 }}>
        <div className={`chip ${filter === 'all' ? 'selected' : ''}`} onClick={() => setFilter('all')}>
          <UsersIcon size={13} /> All <span className="chip-count">{counts.all}</span>
        </div>
        <div className={`chip ${filter === 'active' ? 'selected' : ''}`} onClick={() => setFilter('active')}>
          <Activity size={13} /> Active <span className="chip-count">{counts.active}</span>
        </div>
        <div className={`chip ${filter === 'blocked' ? 'selected' : ''}`} onClick={() => setFilter('blocked')}>
          <ShieldBan size={13} /> Blocked <span className="chip-count">{counts.blocked}</span>
        </div>
      </div>

      <div className="card">
        {processed.length === 0 ? (
          <div className="empty-state-v2">
            <div className="empty-icon"><UsersIcon size={20} /></div>
            <h3>No merchants found</h3>
            <p>{searchQuery || filter !== 'all'
              ? 'Try clearing search or changing filters.'
              : 'Once merchants sign up, they\'ll appear here.'}</p>
          </div>
        ) : (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <SortHeader label="Merchant" k="shopName" />
                  <th>Business</th>
                  <SortHeader label="Products" k="productCount" />
                  <SortHeader label="Bills" k="billCount" />
                  <SortHeader label="Revenue" k="totalRevenue" />
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((user) => (
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
                    <td style={{ color: 'var(--text-secondary)' }}>{user.businessType}</td>
                    <td>{user.productCount}</td>
                    <td>{user.billCount}</td>
                    <td title={`₹${user.totalRevenue.toLocaleString('en-IN')}`} style={{ fontWeight: 600 }}>
                      {formatINR(user.totalRevenue)}
                    </td>
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

            {totalPages > 1 && (
              <div className="pagination">
                <span>
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, processed.length)} of {processed.length}
                </span>
                <div className="pagination-controls">
                  <button className="pagination-btn" disabled={page === 1} onClick={() => setPage(1)} title="First page">
                    <ChevronsLeft size={14} />
                  </button>
                  <button className="pagination-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)} title="Previous">
                    <ChevronLeft size={14} />
                  </button>
                  <span style={{ padding: '0 8px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {page} / {totalPages}
                  </span>
                  <button className="pagination-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)} title="Next">
                    <ChevronRight size={14} />
                  </button>
                  <button className="pagination-btn" disabled={page === totalPages} onClick={() => setPage(totalPages)} title="Last page">
                    <ChevronsRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default UsersTable;
