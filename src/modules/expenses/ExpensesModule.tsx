import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, DollarSign, Download } from 'lucide-react';
import { Expense } from '../../types';
import toast from 'react-hot-toast';
import Modal from '../../components/ui/Modal';
import { format, parseISO, startOfMonth } from 'date-fns';
import { useAppStore } from '../../store/appStore';

const EXPENSE_CATEGORIES = [
  'Rent', 'Utilities', 'Salaries', 'Ingredients', 'Equipment', 'Marketing', 'Maintenance', 'Other'
];

export default function ExpensesModule() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; expense?: Expense }>({ open: false });
  const [dateFilter, setDateFilter] = useState(format(startOfMonth(new Date()), 'yyyy-MM'));
  const settings = useAppStore(s => s.settings);
  const currency = settings?.currency_symbol || '₨';

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const data = await window.electronAPI.expenses.getAll();
    setExpenses(data);
    setLoading(false);
  };

  const deleteExpense = async (id: number) => {
    if (!confirm('Delete this expense?')) return;
    await window.electronAPI.expenses.delete(id);
    toast.success('Expense deleted');
    loadData();
  };

  const filtered = expenses.filter(e => e.date.startsWith(dateFilter));
  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const byCategory = EXPENSE_CATEGORIES.map(cat => ({
    cat,
    total: filtered.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0),
    count: filtered.filter(e => e.category === cat).length,
  })).filter(c => c.count > 0);

  const fmt = (v: number) => `${currency}${v.toLocaleString()}`;
  const fmtDate = (d: string) => {
    try { return format(parseISO(d), 'MMM dd, yyyy'); } catch { return d; }
  };

  const exportCSV = async () => {
    const rows = ['Date,Category,Description,Amount,Payment,Reference',
      ...filtered.map(e => `${e.date},${e.category},${e.description},${e.amount},${e.payment_method},${e.reference || ''}`)
    ];
    await window.electronAPI.export.csv(rows.join('\n'), `expenses_${dateFilter}.csv`);
    toast.success('Exported!');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="page-header">Expenses</h1>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="btn-secondary flex items-center gap-2 text-sm">
            <Download size={14} />Export
          </button>
          <button onClick={() => setModal({ open: true })} className="btn-primary flex items-center gap-2">
            <Plus size={16} />Add Expense
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card col-span-1 text-center">
          <DollarSign size={22} className="text-red-400 mx-auto mb-2" />
          <p className="text-3xl font-bold text-red-400">{fmt(total)}</p>
          <p className="text-dark-400 text-sm mt-1">Total This Month</p>
        </div>
        <div className="card col-span-2">
          <p className="text-sm text-dark-400 mb-3">By Category</p>
          <div className="grid grid-cols-2 gap-2">
            {byCategory.slice(0, 4).map(c => (
              <div key={c.cat} className="flex justify-between items-center text-sm">
                <span className="text-dark-300">{c.cat}</span>
                <span className="font-semibold text-white">{fmt(c.total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-dark-400">Month:</label>
        <input
          type="month"
          value={dateFilter}
          onChange={e => setDateFilter(e.target.value)}
          className="input-field w-44"
        />
        <span className="text-dark-400 text-sm">{filtered.length} expenses</span>
      </div>

      {/* Table */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-700/50">
                <th className="table-header py-2 px-4 text-left">Date</th>
                <th className="table-header py-2 px-4 text-left">Category</th>
                <th className="table-header py-2 px-4 text-left">Description</th>
                <th className="table-header py-2 px-4 text-left">Method</th>
                <th className="table-header py-2 px-4 text-right">Amount</th>
                <th className="table-header py-2 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i}><td colSpan={6} className="py-2 px-4"><div className="h-8 shimmer rounded" /></td></tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-dark-400 py-12">No expenses this month</td></tr>
              ) : (
                filtered.map(e => (
                  <tr key={e.id} className="border-b border-dark-700/30 hover:bg-dark-700/20">
                    <td className="table-cell text-dark-300">{fmtDate(e.date)}</td>
                    <td className="table-cell">
                      <span className="badge-brand">{e.category}</span>
                    </td>
                    <td className="table-cell text-white">{e.description}</td>
                    <td className="table-cell text-dark-400 capitalize">{e.payment_method}</td>
                    <td className="table-cell text-right font-semibold text-red-400">{fmt(e.amount)}</td>
                    <td className="table-cell">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => setModal({ open: true, expense: e })} className="text-dark-400 hover:text-blue-400 p-1">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => deleteExpense(e.id)} className="text-dark-400 hover:text-red-400 p-1">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal.open && (
        <ExpenseFormModal expense={modal.expense} onClose={() => setModal({ open: false })} onSaved={loadData} />
      )}
    </div>
  );
}

function ExpenseFormModal({ expense, onClose, onSaved }: any) {
  const isEdit = !!expense;
  const user = useAppStore(s => s.user);
  const [form, setForm] = useState({
    category: expense?.category || 'Other',
    description: expense?.description || '',
    amount: expense?.amount || '',
    date: expense?.date || format(new Date(), 'yyyy-MM-dd'),
    payment_method: expense?.payment_method || 'cash',
    reference: expense?.reference || '',
    notes: expense?.notes || '',
  });

  const handleSave = async () => {
    if (!form.description || !form.amount) { toast.error('Description and amount are required'); return; }
    const data = { ...form, amount: Number(form.amount), user_id: user?.id };
    if (isEdit) {
      await window.electronAPI.expenses.update(expense.id, data);
      toast.success('Expense updated');
    } else {
      await window.electronAPI.expenses.create(data);
      toast.success('Expense added');
    }
    onSaved();
    onClose();
  };

  return (
    <Modal title={isEdit ? 'Edit Expense' : 'Add Expense'} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-dark-300 mb-1.5">Category</label>
            <select value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))} className="input-field">
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-dark-300 mb-1.5">Date</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} className="input-field" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm text-dark-300 mb-1.5">Description *</label>
            <input value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} className="input-field" placeholder="What was this expense for?" />
          </div>
          <div>
            <label className="block text-sm text-dark-300 mb-1.5">Amount (Rs.) *</label>
            <input type="number" value={form.amount} onChange={e => setForm(f => ({...f, amount: e.target.value}))} className="input-field" placeholder="0" />
          </div>
          <div>
            <label className="block text-sm text-dark-300 mb-1.5">Payment Method</label>
            <select value={form.payment_method} onChange={e => setForm(f => ({...f, payment_method: e.target.value}))} className="input-field">
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="online">Online</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-sm text-dark-300 mb-1.5">Reference / Receipt</label>
            <input value={form.reference} onChange={e => setForm(f => ({...f, reference: e.target.value}))} className="input-field" placeholder="Invoice #, etc." />
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} className="btn-primary flex-1">{isEdit ? 'Save' : 'Add Expense'}</button>
        </div>
      </div>
    </Modal>
  );
}
