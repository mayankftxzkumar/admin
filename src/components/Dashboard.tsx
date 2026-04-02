import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Users, IndianRupee, ShoppingBag, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

interface Stats {
  totalUsers: number;
  totalRevenue: number;
  totalProducts: number;
  activeUsers: number;
}

const Dashboard = () => {
  const [stats, setStats] = useState<Stats>({ totalUsers: 0, totalRevenue: 0, totalProducts: 0, activeUsers: 0 });
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // Fetch all users
      const usersSnap = await getDocs(collection(db, 'users'));
      let totalRevenue = 0;
      let totalProducts = 0;
      let activeUsers = 0;
      const monthlyRevenue: Record<string, number> = {};

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      for (const userDoc of usersSnap.docs) {
        // Count bills
        const billsSnap = await getDocs(collection(db, 'users', userDoc.id, 'bills'));
        let userRevenue = 0;
        let latestBillDate: Date | null = null as Date | null;

        billsSnap.forEach((billDoc) => {
          const data = billDoc.data();
          const amount = data.totalAmount || 0;
          userRevenue += amount;
          totalRevenue += amount;

          // Track monthly revenue
          if (data.date) {
            const billDate = new Date(data.date);
            const monthKey = `${billDate.getFullYear()}-${String(billDate.getMonth() + 1).padStart(2, '0')}`;
            monthlyRevenue[monthKey] = (monthlyRevenue[monthKey] || 0) + amount;
            if (!latestBillDate || billDate > latestBillDate) {
              latestBillDate = billDate;
            }
          }
        });

        if (latestBillDate && latestBillDate > sevenDaysAgo) {
          activeUsers++;
        }

        // Count products
        const productsSnap = await getDocs(collection(db, 'users', userDoc.id, 'products'));
        totalProducts += productsSnap.size;
      }

      // Prepare revenue data for chart
      const sortedMonths = Object.keys(monthlyRevenue).sort();
      const chartData = sortedMonths.slice(-6).map(month => ({
        month: new Date(month + '-01').toLocaleDateString('en-IN', { month: 'short' }),
        revenue: Math.round(monthlyRevenue[month]),
      }));

      setStats({
        totalUsers: usersSnap.size,
        totalRevenue,
        totalProducts,
        activeUsers,
      });
      setRevenueData(chartData);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <>
        <div className="topbar">
          <div className="topbar-title">Dashboard</div>
        </div>
        <div className="page-content">
          <div className="loading-state">
            <div className="spinner" />
            <span>Loading analytics…</span>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">Dashboard</div>
        <div className="topbar-breadcrumb">Overview & Analytics</div>
      </div>
      <div className="page-content">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-label">Total Users</span>
              <div className="stat-icon yellow"><Users size={20} /></div>
            </div>
            <div className="stat-value">{stats.totalUsers}</div>
          </div>

          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-label">Total Revenue</span>
              <div className="stat-icon green"><IndianRupee size={20} /></div>
            </div>
            <div className="stat-value">₹{stats.totalRevenue.toLocaleString('en-IN')}</div>
          </div>

          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-label">Products Listed</span>
              <div className="stat-icon blue"><ShoppingBag size={20} /></div>
            </div>
            <div className="stat-value">{stats.totalProducts.toLocaleString()}</div>
          </div>

          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-label">Active (7d)</span>
              <div className="stat-icon yellow"><TrendingUp size={20} /></div>
            </div>
            <div className="stat-value">{stats.activeUsers}</div>
          </div>
        </div>

        <div className="charts-row">
          <div className="chart-card">
            <div className="chart-card-title">Revenue Trend</div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: '8px', fontSize: '13px' }}
                  formatter={(value: any) => [`₹${value.toLocaleString('en-IN')}`, 'Revenue']}
                />
                <Area type="monotone" dataKey="revenue" stroke="#EAB308" fill="rgba(234,179,8,0.1)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <div className="chart-card-title">Monthly Revenue (Bar)</div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: '8px', fontSize: '13px' }}
                  formatter={(value: any) => [`₹${value.toLocaleString('en-IN')}`, 'Revenue']}
                />
                <Bar dataKey="revenue" fill="#EAB308" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </>
  );
};

export default Dashboard;
