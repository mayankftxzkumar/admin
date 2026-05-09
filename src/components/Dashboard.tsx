import { useEffect, useState } from 'react';
import { collection, getDocs, query, where, getCountFromServer, getAggregateFromServer, sum } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useNavigate } from 'react-router-dom';
import {
  Users, ShoppingBag, TrendingUp, ArrowUpRight, ArrowDownRight,
  Bell, UserPlus, Activity, ChevronRight, Sparkles,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import md5 from '../lib/md5';

interface Stats {
  totalUsers: number;
  totalRevenue: number;
  totalProducts: number;
  activeUsers: number;
  newUsersThisMonth: number;
  revenueThisMonth: number;
  revenueLastMonth: number;
}

interface TopMerchant {
  uid: string;
  shopName: string;
  email: string;
  revenue: number;
  bills: number;
}

const formatINR = (v: number): string => {
  const abs = Math.abs(v);
  if (abs >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return `₹${v.toLocaleString('en-IN')}`;
};

const formatAxis = (v: number): string => {
  const abs = Math.abs(v);
  if (abs >= 1e7) return `${(v / 1e7).toFixed(1)}Cr`;
  if (abs >= 1e5) return `${(v / 1e5).toFixed(1)}L`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
  return v.toString();
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0, totalRevenue: 0, totalProducts: 0, activeUsers: 0,
    newUsersThisMonth: 0, revenueThisMonth: 0, revenueLastMonth: 0,
  });
  const [revenueData, setRevenueData] = useState<{ month: string; revenue: number }[]>([]);
  const [topMerchants, setTopMerchants] = useState<TopMerchant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchDashboardData(); }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      let totalRevenue = 0;
      let totalProducts = 0;
      let activeUsers = 0;
      let newUsersThisMonth = 0;
      const monthlyRevenue: Record<string, number> = {};
      const merchantRevenue: TopMerchant[] = [];

      const now = new Date();
      const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(now.getDate() - 7);
      const sevenDaysAgoIso = sevenDaysAgo.toISOString();
      const sixMonthsAgo = new Date(now); sixMonthsAgo.setMonth(now.getMonth() - 6);
      const sixMonthsAgoIso = sixMonthsAgo.toISOString();
      const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const lastMonth = new Date(now); lastMonth.setMonth(now.getMonth() - 1);
      const lastMonthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
      const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const processUser = async (userDoc: any) => {
        const data = userDoc.data();
        const userMonthly: Record<string, number> = {};
        let isActive = false;
        const createdAt = data.createdAt as string | undefined;

        const [recentBillsSnap, productsCount, billsAgg] = await Promise.all([
          getDocs(query(
            collection(db, 'users', userDoc.id, 'bills'),
            where('date', '>=', sixMonthsAgoIso),
          )),
          getCountFromServer(collection(db, 'users', userDoc.id, 'products')),
          getAggregateFromServer(collection(db, 'users', userDoc.id, 'bills'), {
            totalRevenue: sum('totalAmount'),
          }),
        ]);

        let billCount = 0;
        for (const billDoc of recentBillsSnap.docs) {
          const d = billDoc.data();
          const amount = d.totalAmount || 0;
          billCount++;
          if (d.date) {
            const billDate = new Date(d.date);
            const monthKey = `${billDate.getFullYear()}-${String(billDate.getMonth() + 1).padStart(2, '0')}`;
            userMonthly[monthKey] = (userMonthly[monthKey] || 0) + amount;
            if (!isActive && d.date >= sevenDaysAgoIso) isActive = true;
          }
        }

        const userRevenue = billsAgg.data().totalRevenue || 0;

        return {
          userRevenue,
          userProducts: productsCount.data().count,
          isActive,
          userMonthly,
          isNewThisMonth: createdAt ? createdAt >= startOfThisMonth : false,
          merchant: {
            uid: userDoc.id,
            shopName: data.shopName || 'Unnamed Shop',
            email: data.email || '—',
            revenue: userRevenue,
            bills: billCount,
          } as TopMerchant,
        };
      };

      const BATCH_SIZE = 20;
      const userDocs = usersSnap.docs;
      for (let i = 0; i < userDocs.length; i += BATCH_SIZE) {
        const batch = userDocs.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(batch.map(processUser));
        for (const r of results) {
          totalRevenue += r.userRevenue;
          totalProducts += r.userProducts;
          if (r.isActive) activeUsers++;
          if (r.isNewThisMonth) newUsersThisMonth++;
          merchantRevenue.push(r.merchant);
          for (const [month, amount] of Object.entries(r.userMonthly)) {
            monthlyRevenue[month] = (monthlyRevenue[month] || 0) + amount;
          }
        }
      }

      const sortedMonths = Object.keys(monthlyRevenue).sort();
      const chartData = sortedMonths.slice(-6).map(month => ({
        month: new Date(month + '-01').toLocaleDateString('en-IN', { month: 'short' }),
        revenue: Math.round(monthlyRevenue[month]),
      }));

      const top = [...merchantRevenue]
        .filter(m => m.revenue > 0)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      setStats({
        totalUsers: usersSnap.size,
        totalRevenue,
        totalProducts,
        activeUsers,
        newUsersThisMonth,
        revenueThisMonth: monthlyRevenue[thisMonthKey] || 0,
        revenueLastMonth: monthlyRevenue[lastMonthKey] || 0,
      });
      setRevenueData(chartData);
      setTopMerchants(top);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const revenueDelta = stats.revenueLastMonth > 0
    ? ((stats.revenueThisMonth - stats.revenueLastMonth) / stats.revenueLastMonth) * 100
    : (stats.revenueThisMonth > 0 ? 100 : 0);

  const activeRate = stats.totalUsers > 0
    ? Math.round((stats.activeUsers / stats.totalUsers) * 100)
    : 0;

  if (loading) {
    return (
      <div className="page-content">
        <div className="loading-state">
          <div className="spinner" />
          <span>Loading analytics…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-header-title">Welcome back 👋</div>
          <div className="page-header-subtitle">Here's what's happening with vyapify today.</div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="quick-actions">
        <button className="quick-action" onClick={() => navigate('/users')}>
          <div className="quick-action-icon"><Users size={18} /></div>
          <div className="quick-action-text">
            <div className="quick-action-title">View merchants</div>
            <div className="quick-action-sub">{stats.totalUsers} registered</div>
          </div>
          <ChevronRight size={16} color="#9CA3AF" />
        </button>
        <button className="quick-action" onClick={() => navigate('/notifications')}>
          <div className="quick-action-icon"><Bell size={18} /></div>
          <div className="quick-action-text">
            <div className="quick-action-title">Send notification</div>
            <div className="quick-action-sub">Push to all merchants</div>
          </div>
          <ChevronRight size={16} color="#9CA3AF" />
        </button>
      </div>

      {/* Stats grid: hero + 3 cards */}
      <div className="dash-grid">
        {/* Hero — total revenue with monthly comparison */}
        <div className="hero-metric">
          <div className="hero-label">Total Revenue</div>
          <div className="hero-value" title={`₹${stats.totalRevenue.toLocaleString('en-IN')}`}>
            {formatINR(stats.totalRevenue)}
          </div>
          <div className="hero-sub">
            <span>This month: {formatINR(stats.revenueThisMonth)}</span>
            <span className={`delta ${revenueDelta > 0 ? 'up' : revenueDelta < 0 ? 'down' : 'flat'}`}>
              {revenueDelta > 0 ? <ArrowUpRight size={11} /> : revenueDelta < 0 ? <ArrowDownRight size={11} /> : null}
              {revenueDelta === 0 ? '—' : `${Math.abs(revenueDelta).toFixed(0)}%`}
            </span>
          </div>
        </div>

        {/* Right side: 3 stacked stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <CompactStat
            label="Merchants"
            value={stats.totalUsers.toString()}
            icon={<Users size={16} />}
            iconClass="yellow"
            sub={stats.newUsersThisMonth > 0 ? `+${stats.newUsersThisMonth} this month` : 'No new this month'}
            deltaPositive={stats.newUsersThisMonth > 0}
          />
          <CompactStat
            label="Active (7d)"
            value={`${stats.activeUsers}`}
            icon={<Activity size={16} />}
            iconClass="green"
            sub={`${activeRate}% engagement`}
          />
          <CompactStat
            label="Products listed"
            value={stats.totalProducts.toLocaleString()}
            icon={<ShoppingBag size={16} />}
            iconClass="blue"
            sub="Across all merchants"
          />
        </div>
      </div>

      {/* Revenue chart + top merchants */}
      <div className="dash-grid">
        <div className="chart-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
            <div>
              <div className="chart-card-title" style={{ marginBottom: 2 }}>Revenue trend</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Last 6 months</div>
            </div>
            <Sparkles size={16} color="#9CA3AF" />
          </div>
          {revenueData.length === 0 ? (
            <div className="empty-state-v2" style={{ padding: '48px 0' }}>
              <div className="empty-icon"><TrendingUp size={20} /></div>
              <h3>No revenue yet</h3>
              <p>Once merchants start generating bills, you'll see the trend here.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={revenueData} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#EAB308" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#EAB308" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={formatAxis} width={50} />
                <Tooltip
                  contentStyle={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: '8px', fontSize: '13px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  formatter={(value: any) => [`₹${value.toLocaleString('en-IN')}`, 'Revenue']}
                />
                <Area type="monotone" dataKey="revenue" stroke="#EAB308" fill="url(#revGrad)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top Merchants Leaderboard */}
        <div className="card">
          <div className="section-header">
            <div className="section-title">Top merchants</div>
            <span className="section-link" onClick={() => navigate('/users')}>View all</span>
          </div>
          {topMerchants.length === 0 ? (
            <div className="empty-state-v2">
              <div className="empty-icon"><UserPlus size={20} /></div>
              <h3>No merchants yet</h3>
              <p>Top earners will appear here once revenue starts coming in.</p>
            </div>
          ) : (
            topMerchants.map((m, i) => (
              <div key={m.uid} className="leaderboard-row" onClick={() => navigate(`/users/${m.uid}`)}>
                <div className={`leaderboard-rank ${i < 3 ? 'top' : ''}`}>#{i + 1}</div>
                <div className="user-avatar">
                  <img src={`https://www.gravatar.com/avatar/${md5(m.email.trim().toLowerCase())}?d=mp&s=72`} alt="" />
                </div>
                <div className="leaderboard-info">
                  <div className="leaderboard-name">{m.shopName}</div>
                  <div className="leaderboard-meta">{m.bills} bills · last 6mo</div>
                </div>
                <div className="leaderboard-amount">{formatINR(m.revenue)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

interface CompactStatProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  iconClass: string;
  sub: string;
  deltaPositive?: boolean;
}

const CompactStat = ({ label, value, icon, iconClass, sub, deltaPositive }: CompactStatProps) => (
  <div className="stat-card" style={{ padding: 18, gap: 8, flexDirection: 'row', alignItems: 'center' }}>
    <div className={`stat-icon ${iconClass}`} style={{ width: 36, height: 36, borderRadius: 8 }}>{icon}</div>
    <div style={{ flex: 1 }}>
      <div className="stat-label" style={{ fontSize: '0.7rem', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: '1.3rem', fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1, marginBottom: 2 }}>
        {value}
      </div>
      <div style={{ fontSize: '0.7rem', color: deltaPositive ? 'var(--success)' : 'var(--text-muted)', fontWeight: deltaPositive ? 600 : 400 }}>
        {sub}
      </div>
    </div>
  </div>
);

export default Dashboard;
