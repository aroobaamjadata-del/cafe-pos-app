import { useEffect, useState } from 'react';
import { Plus, Edit2, UserCheck, Key, Trash2, RefreshCw } from 'lucide-react';
import { User } from '../../types';
import toast from 'react-hot-toast';
import Modal from '../../components/ui/Modal';
import { format, parseISO } from 'date-fns';

export default function StaffModule() {
  const [staff, setStaff] = useState<User[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userModal, setUserModal] = useState<{ open: boolean; user?: User }>({ open: false });
  const [pwModal, setPwModal] = useState<{ open: boolean; userId?: number; name?: string }>({ open: false });

  useEffect(() => {
    loadData();
    // Listen for real-time remote updates to refresh staff list
    window.electronAPI?.sync?.onRemoteUpdate?.((table: string) => {
      if (table === 'staff' || table === 'users') loadData();
    });
    return () => { window.electronAPI?.sync?.removeRemoteUpdateListener?.(); };
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const users = await window.electronAPI.users.getAll();
      setStaff(Array.isArray(users) ? users : []);
    } catch (err: any) {
      console.error('Failed to load staff:', err);
      setStaff([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (user: User) => {
    if (!window.confirm(`Are you sure you want to delete ${user.full_name}?`)) return;
    try {
      await window.electronAPI.users.delete(user.id);
      toast.success('Staff member deleted');
      loadData();
    } catch (err: any) {
      toast.error('Failed to delete staff: ' + err.message);
    }
  };

  const fmtDate = (d?: string) => {
    if (!d) return 'Never';
    try { return format(parseISO(d), 'MMM dd, h:mm a'); } catch { return d; }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="page-header">Staff Management</h1>
        <div className="flex items-center gap-2">
          <button onClick={loadData} className="btn-secondary flex items-center gap-2 px-3 py-2 text-sm" title="Refresh">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setUserModal({ open: true })} className="btn-primary flex items-center gap-2">
            <Plus size={16} />Add Staff
          </button>
        </div>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-700/50">
                <th className="table-header py-2 px-4 text-left">Name</th>
                <th className="table-header py-2 px-4 text-left">Username</th>
                <th className="table-header py-2 px-4 text-left">Role</th>
                <th className="table-header py-2 px-4 text-left">Last Login</th>
                <th className="table-header py-2 px-4 text-center">Status</th>
                <th className="table-header py-2 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array(4).fill(0).map((_, i) => (
                  <tr key={i}><td colSpan={6} className="py-2 px-4"><div className="h-10 shimmer rounded" /></td></tr>
                ))
              ) : staff.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-dark-400">
                    <p className="text-sm">No staff members found.</p>
                    <p className="text-xs mt-1 text-dark-500">Click "+ Add Staff" to create one, or wait for sync to complete.</p>
                  </td>
                </tr>
              ) : staff.map(user => (
                <tr key={user.id} className="border-b border-dark-700/30 hover:bg-dark-700/20 transition-colors">
                  <td className="table-cell">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-400 font-bold text-sm uppercase">
                        {(user.full_name || 'U').charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-white">{user.full_name || 'Unknown User'}</p>
                        {user.email && <p className="text-xs text-dark-400">{user.email}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="table-cell font-mono text-sm text-dark-200">{user.username}</td>
                  <td className="table-cell">
                    <span className={`badge ${
                      user.role_name === 'Admin' ? 'badge-danger' :
                      user.role_name === 'Manager' ? 'badge-warning' : 'badge-info'
                    }`}>
                      {user.role_name}
                    </span>
                  </td>
                  <td className="table-cell text-dark-400 text-sm">{fmtDate(user.last_login)}</td>
                  <td className="table-cell text-center">
                    <span className={user.is_active ? 'badge-success' : 'badge-danger'}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => setUserModal({ open: true, user })} className="text-dark-400 hover:text-blue-400 transition-colors p-1.5 rounded-lg hover:bg-blue-500/10" title="Edit">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => setPwModal({ open: true, userId: user.id, name: user.full_name })} className="text-dark-400 hover:text-amber-400 transition-colors p-1.5 rounded-lg hover:bg-amber-500/10" title="Change Password">
                        <Key size={14} />
                      </button>
                      <button onClick={() => handleDelete(user)} className="text-dark-400 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10" title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Role legend */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { role: 'Admin', desc: 'Full system access', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
          { role: 'Manager', desc: 'All modules except security', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
          { role: 'Cashier', desc: 'POS and dashboard only', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
        ].map(r => (
          <div key={r.role} className={`card border ${r.border} ${r.bg}`}>
            <div className="flex items-center gap-2 mb-1">
              <UserCheck size={16} className={r.color} />
              <span className={`font-semibold ${r.color}`}>{r.role}</span>
            </div>
            <p className="text-dark-400 text-sm">{r.desc}</p>
          </div>
        ))}
      </div>

      {/* Modals */}
      {userModal.open && (
        <UserFormModal user={userModal.user} onClose={() => setUserModal({ open: false })} onSaved={loadData} />
      )}
      {pwModal.open && (
        <PasswordModal userId={pwModal.userId!} name={pwModal.name!} onClose={() => setPwModal({ open: false })} />
      )}
    </div>
  );
}

function UserFormModal({ user, onClose, onSaved }: any) {
  const isEdit = !!user;
  const [form, setForm] = useState({
    username: user?.username || '',
    full_name: user?.full_name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    role_id: user?.role_id || 3,
    is_active: user?.is_active !== 0,
    password: '',
  });

  const rolesMap = [
    { id: 1, name: 'Admin' }, { id: 2, name: 'Manager' }, { id: 3, name: 'Cashier' }
  ];

  const handleSave = async () => {
    if (!form.full_name || !form.username) { toast.error('Name and username are required'); return; }
    if (!isEdit && !form.password) { toast.error('Password is required for new user'); return; }
    if (isEdit) {
      await window.electronAPI.users.update(user.id, form);
      toast.success('User updated');
    } else {
      await window.electronAPI.users.create(form);
      toast.success('User created');
    }
    onSaved();
    onClose();
  };

  return (
    <Modal title={isEdit ? 'Edit Staff' : 'Add Staff'} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm text-dark-300 mb-1.5">Full Name *</label>
            <input value={form.full_name} onChange={e => setForm(f => ({...f, full_name: e.target.value}))} className="input-field" placeholder="John Doe" />
          </div>
          <div>
            <label className="block text-sm text-dark-300 mb-1.5">Username *</label>
            <input value={form.username} onChange={e => setForm(f => ({...f, username: e.target.value}))} className="input-field" placeholder="johndoe" disabled={isEdit} />
          </div>
          <div>
            <label className="block text-sm text-dark-300 mb-1.5">Role *</label>
            <select value={form.role_id} onChange={e => setForm(f => ({...f, role_id: Number(e.target.value)}))} className="input-field">
              {rolesMap.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-dark-300 mb-1.5">Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} className="input-field" />
          </div>
          <div>
            <label className="block text-sm text-dark-300 mb-1.5">Phone</label>
            <input value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} className="input-field" />
          </div>
          {!isEdit && (
            <div className="col-span-2">
              <label className="block text-sm text-dark-300 mb-1.5">Password *</label>
              <input type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} className="input-field" placeholder="Min 6 characters" />
            </div>
          )}
        </div>
        {isEdit && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({...f, is_active: e.target.checked}))} className="w-4 h-4 accent-brand-500" />
            <span className="text-sm text-dark-200">Account Active</span>
          </label>
        )}
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} className="btn-primary flex-1">
            {isEdit ? 'Save Changes' : 'Add Staff'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function PasswordModal({ userId, name, onClose }: any) {
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');

  const handleSave = async () => {
    if (!newPw || newPw.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    if (newPw !== confirm) { toast.error('Passwords do not match'); return; }
    await window.electronAPI.users.changePassword(userId, newPw);
    toast.success('Password changed successfully');
    onClose();
  };

  return (
    <Modal title={`Change Password — ${name}`} onClose={onClose} size="sm">
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-dark-300 mb-1.5">New Password</label>
          <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} className="input-field" placeholder="Min 6 characters" autoFocus />
        </div>
        <div>
          <label className="block text-sm text-dark-300 mb-1.5">Confirm Password</label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className="input-field" />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} className="btn-primary flex-1">Change Password</button>
        </div>
      </div>
    </Modal>
  );
}
