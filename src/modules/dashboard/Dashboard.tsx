import { useEffect, useState } from 'react';
import { TrendingUp, ShoppingBag, Calendar, AlertTriangle, Coffee, ArrowUp, ArrowDown } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { DashboardData, SalesTrendPoint } from '../../types';
import { useAppStore } from '../../store/appStore';
import { format, parseISO } from 'date-fns';

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [trend, setTrend] = useState<SalesTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const settings = useAppStore(s => s.settings);
  const currency = settings?.currency_symbol || '₨';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [dashData, trendData] = await Promise.all([
      window.electronAPI.reports.getDashboard(),
      window.electronAPI.reports.getSalesTrend(14),
    ]);
    setData(dashData);
    setTrend(trendData);
    setLoading(false);
  };

  const fmtMoney = (v: number) => `${currency}${v.toLocaleString('en-PK', { minimumFractionDigits: 0 })}`;
  const fmtDate = (d: string) => {
    try { return format(parseISO(d), 'MMM dd, h:mm a'); } catch { return d; }
  };

  const categoryColors = ['#e25a26', '#3b82f6', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6'];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload?.length) {
      return (
        <div className="bg-dark-700 border border-dark-600 rounded-xl px-3 py-2 text-sm shadow-xl">
          <p className="text-dark-300 text-xs mb-1">{label}</p>
          <p className="text-white font-semibold">{fmtMoney(payload[0].value)}</p>
          {payload[1] && <p className="text-dark-300 text-xs">{payload[1].value} orders</p>}
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-28 card shimmer rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 h-64 card shimmer rounded-2xl" />
          <div className="h-64 card shimmer rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const trendChartData = trend.map(t => ({
    date: format(parseISO(t.date), 'MMM dd'),
    Sales: t.total,
    Orders: t.orders,
  }));

  const categoryData = data.topProducts.map((p, i) => ({
    name: p.name,
    value: p.revenue,
    color: categoryColors[i % categoryColors.length],
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header">Dashboard</h1>
          <p className="text-dark-400 text-sm mt-0.5">
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
        <button onClick={loadData} className="btn-secondary text-sm flex items-center gap-2">
          <TrendingUp size={14} />
          Refresh
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Today's Sales"
          value={fmtMoney(data.todaySales.total)}
          sub={`${data.todaySales.count} orders`}
          icon={<Coffee size={20} />}
          color="text-brand-400"
          bgColor="bg-brand-500/10"
          borderColor="border-brand-500/20"
          trend={+2.5}
        />
        <StatCard
          label="This Week"
          value={fmtMoney(data.weeklySales.total)}
          sub={`${data.weeklySales.count} orders`}
          icon={<TrendingUp size={20} />}
          color="text-blue-400"
          bgColor="bg-blue-500/10"
          borderColor="border-blue-500/20"
          trend={+8.1}
        />
        <StatCard
          label="This Month"
          value={fmtMoney(data.monthlySales.total)}
          sub={`${data.monthlySales.count} orders`}
          icon={<Calendar size={20} />}
          color="text-emerald-400"
          bgColor="bg-emerald-500/10"
          borderColor="border-emerald-500/20"
          trend={+12.3}
        />
        <StatCard
          label="Low Stock Alerts"
          value={String(data.lowStock.count)}
          sub="items need restocking"
          icon={<AlertTriangle size={20} />}
          color="text-amber-400"
          bgColor="bg-amber-500/10"
          borderColor="border-amber-500/20"
          isAlert={data.lowStock.count > 0}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Sales Trend */}
        <div className="col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title">Sales Trend (14 days)</h2>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trendChartData}>
              <defs>
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#e25a26" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#e25a26" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#908d84' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#908d84' }} axisLine={false} tickLine={false} tickFormatter={v => `${currency}${v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="Sales" stroke="#e25a26" strokeWidth={2} fill="url(#salesGrad)" dot={false} activeDot={{ r: 4, fill: '#e25a26' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Top Products Pie */}
        <div className="card">
          <h2 className="section-title mb-4">Top Products</h2>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="45%" outerRadius={70} innerRadius={40}
                     dataKey="value" paddingAngle={3}>
                  {categoryData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Legend
                  formatter={(value) => <span className="text-xs text-dark-200">{value}</span>}
                  iconSize={8}
                />
                <Tooltip formatter={(v: number) => fmtMoney(v)} contentStyle={{ background: '#252420', border: '1px solid #3d3b35', borderRadius: '12px', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-dark-400 text-sm">
              No sales data yet
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Recent Orders */}
        <div className="col-span-2 card">
          <h2 className="section-title mb-4">Recent Orders</h2>
          <div className="space-y-0">
            <div className="grid grid-cols-4 px-3 pb-2 border-b border-dark-700/50">
              <span className="table-header">Order</span>
              <span className="table-header">Cashier</span>
              <span className="table-header">Method</span>
              <span className="table-header text-right">Total</span>
            </div>
            {data.recentOrders.length === 0 && (
              <p className="text-dark-400 text-sm py-8 text-center">No orders yet today</p>
            )}
            {data.recentOrders.slice(0, 8).map(order => (
              <div key={order.id} className="grid grid-cols-4 px-3 py-2.5 hover:bg-dark-700/30 rounded-lg transition-colors">
                <div>
                  <p className="text-sm font-medium text-white">{order.order_number}</p>
                  <p className="text-xs text-dark-400">{fmtDate(order.created_at)}</p>
                </div>
                <span className="text-sm text-dark-200 self-center">{order.cashier_name || (order as any).cashier}</span>
                <span className="self-center">
                  <span className={`badge text-xs ${
                    order.payment_method === 'cash' ? 'badge-success' :
                    order.payment_method === 'card' ? 'badge-info' : 'badge-warning'
                  }`}>
                    {order.payment_method}
                  </span>
                </span>
                <span className="text-sm font-semibold text-white text-right self-center">
                  {fmtMoney(order.total)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Performing Items */}
        <div className="card">
          <h2 className="section-title mb-4">Best Sellers</h2>
          <div className="space-y-3">
            {data.topProducts.length === 0 && (
              <p className="text-dark-400 text-sm text-center py-6">No data yet</p>
            )}
            {data.topProducts.map((p, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                  i === 0 ? 'bg-amber-500/20 text-amber-400' :
                  i === 1 ? 'bg-dark-500/20 text-dark-300' :
                  'bg-brand-500/10 text-brand-400'
                }`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{p.name}</p>
                  <p className="text-xs text-dark-400">{p.qty_sold} sold</p>
                </div>
                <p className="text-sm font-semibold text-brand-400">{fmtMoney(p.revenue)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon, color, bgColor, borderColor, trend, isAlert }: {
  label: string; value: string; sub: string; icon: React.ReactNode;
  color: string; bgColor: string; borderColor: string; trend?: number; isAlert?: boolean;
}) {
  return (
    <div className={`card border ${borderColor} ${isAlert ? 'animate-pulse-soft' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl ${bgColor} border ${borderColor} flex items-center justify-center ${color}`}>
          {icon}
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-0.5 text-xs font-medium ${trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {trend >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <div>
        <p className={`text-2xl font-bold font-display ${isAlert && Number(value) > 0 ? 'text-amber-400' : 'text-white'}`}>
          {value}
        </p>
        <p className="text-xs text-dark-400 mt-0.5">{label}</p>
        <p className="text-xs text-dark-500 mt-1">{sub}</p>
      </div>
    </div>
  );
}
