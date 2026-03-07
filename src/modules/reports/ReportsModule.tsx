import { useState, useEffect } from 'react';
import { Download, FileText, TrendingUp, Calendar } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid
} from 'recharts';
import { format, subDays, startOfWeek, startOfMonth } from 'date-fns';
import toast from 'react-hot-toast';
import { useAppStore } from '../../store/appStore';

type ReportType = 'daily' | 'weekly' | 'monthly' | 'products' | 'categories';

export default function ReportsModule() {
  const [reportType, setReportType] = useState<ReportType>('daily');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState({
    start: format(new Date(), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd'),
  });
  const settings = useAppStore(s => s.settings);
  const currency = settings?.currency_symbol || '₨';

  useEffect(() => {
    loadReport();
  }, [reportType]);

  const loadReport = async () => {
    setLoading(true);
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const monthStr = format(new Date(), 'yyyy-MM-dd');

      let result: any;
      if (reportType === 'daily') {
        result = await window.electronAPI.reports.getDailySales(today);
      } else if (reportType === 'weekly') {
        result = await window.electronAPI.reports.getWeeklySales(weekStart);
      } else if (reportType === 'monthly') {
        result = await window.electronAPI.reports.getMonthlySales(new Date().getFullYear(), new Date().getMonth() + 1);
      } else if (reportType === 'products') {
        result = await window.electronAPI.reports.getProductPerformance(dateRange.start, dateRange.end);
      } else {
        result = await window.electronAPI.reports.getCategoryPerformance(dateRange.start, dateRange.end);
      }
      setData(result);
    } finally {
      setLoading(false);
    }
  };

  const fmt = (v: number) => `${currency}${(v || 0).toLocaleString()}`;
  const fmtK = (v: number) => v >= 1000 ? `${currency}${(v/1000).toFixed(1)}k` : `${currency}${v}`;

  const exportCSV = async () => {
    if (!data) return;
    let csvRows: string[] = [];

    if (reportType === 'daily' && data.orders) {
      csvRows = ['Order #,Cashier,Method,Total,Status', ...data.orders.map((o: any) => `${o.order_number},${o.cashier_name},${o.payment_method},${o.total},${o.status}`)];
    } else if (reportType === 'products' && Array.isArray(data)) {
      csvRows = ['Product,Category,Qty Sold,Revenue', ...data.map((r: any) => `${r.name},${r.category},${r.qty_sold},${r.revenue}`)];
    } else if (reportType === 'categories' && Array.isArray(data)) {
      csvRows = ['Category,Orders,Qty Sold,Revenue', ...data.map((r: any) => `${r.category},${r.orders},${r.qty_sold},${r.revenue}`)];
    } else if (Array.isArray(data)) {
      csvRows = ['Date,Orders,Total', ...data.map((r: any) => `${r.date},${r.orders},${r.total}`)];
    }

    if (csvRows.length === 0) {
      toast.error('No data to export');
      return;
    }

    const csv = csvRows.join('\n');
    const result = await window.electronAPI.export.csv(csv, `${reportType}_report_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    if (result.success) toast.success('Report exported!');
  };

  const reportTabs: { id: ReportType; label: string; icon: React.ReactNode }[] = [
    { id: 'daily', label: 'Daily', icon: <Calendar size={14} /> },
    { id: 'weekly', label: 'Weekly', icon: <Calendar size={14} /> },
    { id: 'monthly', label: 'Monthly', icon: <Calendar size={14} /> },
    { id: 'products', label: 'Products', icon: <FileText size={14} /> },
    { id: 'categories', label: 'Categories', icon: <TrendingUp size={14} /> },
  ];

  const barColors = ['#e25a26', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload?.length) {
      return (
        <div className="bg-dark-700 border border-dark-600 rounded-xl px-3 py-2.5 text-sm shadow-xl">
          <p className="text-dark-300 text-xs mb-1">{label}</p>
          {payload.map((p: any, i: number) => (
            <p key={i} style={{ color: p.color }} className="font-semibold">
              {p.name}: {p.name.includes('Total') || p.name === 'revenue' ? fmt(p.value) : p.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="page-header">Reports & Analytics</h1>
        <button onClick={exportCSV} className="btn-secondary flex items-center gap-2 text-sm">
          <Download size={14} />
          Export CSV
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-dark-800 p-1 rounded-xl w-fit border border-dark-700/50 flex-wrap">
        {reportTabs.map(t => (
          <button
            key={t.id}
            onClick={() => setReportType(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${reportType === t.id ? 'bg-brand-500 text-white' : 'text-dark-300 hover:text-white'}`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Date range for product/category reports */}
      {(reportType === 'products' || reportType === 'categories') && (
        <div className="flex gap-3 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm text-dark-400">From:</label>
            <input
              type="date"
              value={dateRange.start}
              onChange={e => setDateRange(r => ({...r, start: e.target.value}))}
              className="input-field w-40"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-dark-400">To:</label>
            <input
              type="date"
              value={dateRange.end}
              onChange={e => setDateRange(r => ({...r, end: e.target.value}))}
              className="input-field w-40"
            />
          </div>
          <button onClick={loadReport} className="btn-primary">Apply</button>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="card h-64 shimmer" />
          <div className="card h-48 shimmer" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Daily Report */}
          {reportType === 'daily' && data && (
            <>
              <div className="grid grid-cols-3 gap-4">
                <div className="card text-center">
                  <p className="text-dark-400 text-sm">Today's Revenue</p>
                  <p className="text-3xl font-bold text-brand-400 mt-1">{fmt(data.summary?.total || 0)}</p>
                </div>
                <div className="card text-center">
                  <p className="text-dark-400 text-sm">Total Orders</p>
                  <p className="text-3xl font-bold text-white mt-1">{data.summary?.count || 0}</p>
                </div>
                <div className="card text-center">
                  <p className="text-dark-400 text-sm">Avg Order Value</p>
                  <p className="text-3xl font-bold text-emerald-400 mt-1">
                    {fmt((data.summary?.count > 0 ? data.summary.total / data.summary.count : 0))}
                  </p>
                </div>
              </div>

              {/* By payment method */}
              {data.byPayment?.length > 0 && (
                <div className="card">
                  <h3 className="section-title mb-4">By Payment Method</h3>
                  <div className="grid grid-cols-3 gap-4">
                    {data.byPayment.map((p: any) => (
                      <div key={p.payment_method} className="bg-dark-700/50 rounded-xl p-4 text-center border border-dark-600/30">
                        <p className="text-dark-300 text-sm capitalize">{p.payment_method}</p>
                        <p className="text-xl font-bold text-white mt-1">{p.count} orders</p>
                        <p className="text-brand-400 font-semibold text-sm">{fmt(p.total)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Orders table */}
              <div className="card">
                <h3 className="section-title mb-4">Today's Orders</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-dark-700/50">
                        <th className="table-header py-2 px-3 text-left">Order #</th>
                        <th className="table-header py-2 px-3 text-left">Cashier</th>
                        <th className="table-header py-2 px-3 text-left">Method</th>
                        <th className="table-header py-2 px-3 text-right">Total</th>
                        <th className="table-header py-2 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.orders || []).slice(0, 20).map((o: any) => (
                        <tr key={o.id} className="border-b border-dark-700/30 hover:bg-dark-700/20">
                          <td className="table-cell font-mono text-xs">{o.order_number}</td>
                          <td className="table-cell">{o.cashier_name}</td>
                          <td className="table-cell capitalize">{o.payment_method}</td>
                          <td className="table-cell text-right font-semibold text-brand-400">{fmt(o.total)}</td>
                          <td className="table-cell text-center">
                            <span className={`badge ${o.status === 'completed' ? 'badge-success' : 'badge-danger'}`}>{o.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Weekly/Monthly Chart */}
          {(reportType === 'weekly' || reportType === 'monthly') && Array.isArray(data) && (
            <div className="card">
              <h3 className="section-title mb-4">{reportType === 'weekly' ? 'This Week' : 'This Month'}'s Sales</h3>
              <div className="mb-4">
                <p className="text-3xl font-bold text-brand-400">
                  {fmt(data.reduce((s: number, r: any) => s + (r.total || 0), 0))}
                </p>
                <p className="text-dark-400 text-sm">{data.reduce((s: number, r: any) => s + (r.orders || 0), 0)} total orders</p>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.map((d: any) => ({ ...d, Total: d.total }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2826" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#908d84' }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11, fill: '#908d84' }} tickFormatter={fmtK} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="Total" fill="#e25a26" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Product Performance */}
          {reportType === 'products' && Array.isArray(data) && (
            <div className="card">
              <h3 className="section-title mb-4">Product Performance</h3>
              {data.length === 0 ? (
                <p className="text-dark-400 text-center py-12">No data for this period</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-dark-700/50">
                        <th className="table-header py-2 px-3 text-left">Rank</th>
                        <th className="table-header py-2 px-3 text-left">Product</th>
                        <th className="table-header py-2 px-3 text-left">Category</th>
                        <th className="table-header py-2 px-3 text-right">Qty Sold</th>
                        <th className="table-header py-2 px-3 text-right">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.slice(0, 20).map((p: any, i: number) => (
                        <tr key={i} className="border-b border-dark-700/30 hover:bg-dark-700/20">
                          <td className="table-cell">
                            <span className={`font-bold ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-gray-400' : 'text-dark-400'}`}>#{i+1}</span>
                          </td>
                          <td className="table-cell font-medium text-white">{p.name}</td>
                          <td className="table-cell text-dark-400">{p.category}</td>
                          <td className="table-cell text-right text-white">{p.qty_sold}</td>
                          <td className="table-cell text-right font-semibold text-brand-400">{fmt(p.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Category Performance */}
          {reportType === 'categories' && Array.isArray(data) && (
            <div className="card">
              <h3 className="section-title mb-4">Category Performance</h3>
              {data.length === 0 ? (
                <p className="text-dark-400 text-center py-12">No data for this period</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={data.map((d: any) => ({ name: d.category, Revenue: d.revenue }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2826" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#908d84' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#908d84' }} tickFormatter={fmtK} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="Revenue" radius={[6, 6, 0, 0]}>
                        {data.map((_: any, i: number) => (
                          <Cell key={i} fill={barColors[i % barColors.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    {data.slice(0,6).map((c: any, i: number) => (
                      <div key={i} className="bg-dark-700/40 rounded-xl p-3 border border-dark-600/40">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: barColors[i % barColors.length] }} />
                          <span className="text-sm font-medium text-white truncate">{c.category}</span>
                        </div>
                        <p className="text-brand-400 font-bold">{fmt(c.revenue)}</p>
                        <p className="text-dark-400 text-xs">{c.qty_sold} items sold</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
