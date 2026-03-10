import { useEffect, useState } from 'react';
import { Plus, Edit2, Users, Star, Phone } from 'lucide-react';
import { Customer } from '../../types';
import toast from 'react-hot-toast';
import Modal from '../../components/ui/Modal';
import { useAppStore } from '../../store/appStore';
import LoyaltyCardModal from './LoyaltyCardModal';

export default function CustomersModule() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; customer?: Customer }>({ open: false });
  const [loyaltyModal, setLoyaltyModal] = useState<{ open: boolean; customer?: Customer }>({ open: false });
  const [search, setSearch] = useState('');
  const settings = useAppStore(s => s.settings);
  const currency = settings?.currency_symbol || '₨';

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const data = await window.electronAPI.customers.getAll();
    setCustomers(data);
    setLoading(false);
  };

  const filtered = customers.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search)
  );

  const fmt = (v: number) => `${currency}${v.toLocaleString()}`;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="page-header">Customers</h1>
        <button onClick={() => setModal({ open: true })} className="btn-primary flex items-center gap-2">
          <Plus size={16} />Add Customer
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center">
          <Users size={24} className="text-blue-400 mx-auto mb-2" />
          <p className="text-3xl font-bold text-white">{customers.length}</p>
          <p className="text-dark-400 text-sm">Total Customers</p>
        </div>
        <div className="card text-center">
          <Star size={24} className="text-amber-400 mx-auto mb-2" />
          <p className="text-3xl font-bold text-white">{customers.reduce((s, c) => s + c.loyalty_points, 0)}</p>
          <p className="text-dark-400 text-sm">Total Loyalty Points</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-brand-400">{fmt(customers.reduce((s, c) => s + c.total_spent, 0))}</p>
          <p className="text-dark-400 text-sm">Total Revenue from Customers</p>
        </div>
      </div>

      {/* Search */}
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone..." className="input-field max-w-sm" />

      {/* Customer grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          Array(6).fill(0).map((_, i) => <div key={i} className="h-32 card shimmer" />)
        ) : filtered.map(c => (
          <div key={c.id} className="card-hover group">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-400 font-bold text-lg">
                  {c.name.charAt(0)}
                </div>
                <div>
                  <h3 className="font-semibold text-white">{c.name}</h3>
                  {c.phone && (
                    <p className="text-xs text-dark-400 flex items-center gap-1">
                      <Phone size={10} />{c.phone}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setLoyaltyModal({ open: true, customer: c })} className="text-dark-400 hover:text-amber-400 opacity-0 group-hover:opacity-100 transition-all p-1">
                  <Star size={14} />
                </button>
                <button onClick={() => setModal({ open: true, customer: c })} className="text-dark-400 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all p-1">
                  <Edit2 size={14} />
                </button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="bg-dark-700/40 rounded-lg p-2 text-center">
                <p className="text-amber-400 font-bold text-sm">{c.loyalty_points}</p>
                <p className="text-dark-500 text-xs">Points</p>
              </div>
              <div className="bg-dark-700/40 rounded-lg p-2 text-center">
                <p className="text-brand-400 font-bold text-sm">{fmt(c.total_spent)}</p>
                <p className="text-dark-500 text-xs">Total Spent</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {modal.open && (
        <CustomerFormModal customer={modal.customer} onClose={() => setModal({ open: false })} onSaved={loadData} />
      )}

      {loyaltyModal.open && loyaltyModal.customer && (
        <LoyaltyCardModal customer={loyaltyModal.customer} onClose={() => setLoyaltyModal({ open: false })} />
      )}
    </div>
  );
}

function CustomerFormModal({ customer, onClose, onSaved }: any) {
  const isEdit = !!customer;
  const [form, setForm] = useState({
    name: customer?.name || '',
    phone: customer?.phone || '',
    email: customer?.email || '',
    address: customer?.address || '',
  });

  const handleSave = async () => {
    if (!form.name) { toast.error('Name is required'); return; }
    if (isEdit) {
      await window.electronAPI.customers.update(customer.id, form);
      toast.success('Customer updated');
    } else {
      await window.electronAPI.customers.create(form);
      toast.success('Customer added');
    }
    onSaved();
    onClose();
  };

  return (
    <Modal title={isEdit ? 'Edit Customer' : 'Add Customer'} onClose={onClose} size="sm">
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-dark-300 mb-1.5">Full Name *</label>
          <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="input-field" autoFocus />
        </div>
        <div>
          <label className="block text-sm text-dark-300 mb-1.5">Phone</label>
          <input value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} className="input-field" placeholder="+92-XXX-XXXXXXX" />
        </div>
        <div>
          <label className="block text-sm text-dark-300 mb-1.5">Email</label>
          <input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} className="input-field" />
        </div>
        <div>
          <label className="block text-sm text-dark-300 mb-1.5">Address</label>
          <input value={form.address} onChange={e => setForm(f => ({...f, address: e.target.value}))} className="input-field" />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} className="btn-primary flex-1">Save</button>
        </div>
      </div>
    </Modal>
  );
}
