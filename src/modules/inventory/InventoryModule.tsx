import { useEffect, useState } from 'react';
import {
  AlertTriangle, Plus, ArrowDown, ArrowUp, RotateCcw, Truck,
  Package, FlaskConical, TrendingDown, Trash2, Edit2
} from 'lucide-react';
import { Ingredient, IngredientMovement, Supplier } from '../../types';
import toast from 'react-hot-toast';
import Modal from '../../components/ui/Modal';
import { format, parseISO } from 'date-fns';
import { useAppStore } from '../../store/appStore';

type InventoryTab = 'ingredients' | 'movements' | 'suppliers';

export default function InventoryModule() {
  const { user, settings } = useAppStore();
  const currency = settings?.currency || 'Rs.';

  const [tab, setTab] = useState<InventoryTab>('ingredients');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [movements, setMovements] = useState<IngredientMovement[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [adjustModal, setAdjustModal] = useState<{ open: boolean; ingredient?: Ingredient }>({ open: false });
  const [ingredientModal, setIngredientModal] = useState<{ open: boolean; ingredient?: Ingredient }>({ open: false });
  const [supplierModal, setSupplierModal] = useState<{ open: boolean; supplier?: Supplier }>({ open: false });

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const [ings, movs, sups] = await Promise.all([
      window.electronAPI.ingredients.getAll(),
      window.electronAPI.ingredients.getMovements(),
      window.electronAPI.suppliers.getAll(),
    ]);
    setIngredients(ings);
    setMovements(movs);
    setSuppliers(sups);
    setLoading(false);
  };

  const deleteIngredient = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this ingredient? This action cannot be undone.')) return;
    try {
      await window.electronAPI.ingredients.delete(id);
      toast.success('Ingredient deleted');
      loadAll();
    } catch (err) {
      toast.error('Failed to delete ingredient');
    }
  };

  const deleteSupplier = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this supplier? Any linked ingredients will remain but will be unlinked.')) return;
    try {
      await window.electronAPI.suppliers.delete(id);
      toast.success('Supplier deleted');
      loadAll();
    } catch (err) {
      toast.error('Failed to delete supplier');
    }
  };

  const lowCount = ingredients.filter(i => i.current_stock <= i.reorder_level).length;

  const TABS: { id: InventoryTab; label: string; icon: any }[] = [
    { id: 'ingredients', label: 'Ingredients', icon: FlaskConical },
    { id: 'movements', label: 'Usage Log', icon: TrendingDown },
    { id: 'suppliers', label: 'Suppliers', icon: Truck },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header flex items-center gap-2">
            <Package size={24} className="text-brand-400" />
            Ingredient Inventory
          </h1>
          <p className="text-dark-400 text-sm mt-0.5">Track raw materials · Recipes auto-deduct on sale</p>
        </div>
        {lowCount > 0 && (
          <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2">
            <AlertTriangle size={16} className="text-amber-400" />
            <span className="text-amber-300 text-sm font-medium">{lowCount} ingredient{lowCount !== 1 ? 's' : ''} low</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-dark-800 p-1 rounded-xl border border-dark-700/50 w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'bg-brand-500 text-white shadow-sm' : 'text-dark-300 hover:text-white'}`}>
            <t.icon size={14} />{t.label}
          </button>
        ))}
      </div>

      {/* Ingredients Tab */}
      {tab === 'ingredients' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title">All Ingredients ({ingredients.length})</h2>
            <button onClick={() => setIngredientModal({ open: true })} className="btn-primary flex items-center gap-2 text-sm">
              <Plus size={14} />Add Ingredient
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-700/50">
                  <th className="table-header text-left pb-3 pl-2">Ingredient</th>
                  <th className="table-header text-right pb-3">Current Stock</th>
                  <th className="table-header text-right pb-3">Reorder Level</th>
                  <th className="table-header text-right pb-3">Cost/Unit</th>
                  <th className="table-header text-right pb-3">Status</th>
                  <th className="table-header text-center pb-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? Array(6).fill(0).map((_, i) => (
                  <tr key={i}><td colSpan={6} className="py-2"><div className="h-10 shimmer rounded-lg" /></td></tr>
                )) : ingredients.map(ing => {
                  const isLow = ing.current_stock <= ing.reorder_level;
                  const isCritical = ing.current_stock <= ing.reorder_level * 0.5;
                  return (
                    <tr key={ing.id} className={`border-b border-dark-700/30 hover:bg-dark-800/40 transition-colors ${isCritical ? 'bg-red-500/3' : isLow ? 'bg-amber-500/3' : ''}`}>
                      <td className="table-cell pl-2">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${isCritical ? 'bg-red-500/15 text-red-400' : isLow ? 'bg-amber-500/15 text-amber-400' : 'bg-brand-500/10 text-brand-400'}`}>
                            <FlaskConical size={14} />
                          </div>
                          <div>
                            <p className="font-medium text-white text-sm">{ing.name}</p>
                            {ing.supplier_name && <p className="text-xs text-dark-400">{ing.supplier_name}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="table-cell text-right">
                        <span className={`font-semibold ${isCritical ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-white'}`}>
                          {ing.current_stock.toFixed(2)} {ing.unit}
                        </span>
                      </td>
                      <td className="table-cell text-right text-dark-300">{ing.reorder_level} {ing.unit}</td>
                      <td className="table-cell text-right text-dark-300">{currency}{ing.cost_per_unit}/unit</td>
                      <td className="table-cell text-right">
                        {isCritical ? (
                          <span className="badge-danger">Critical</span>
                        ) : isLow ? (
                          <span className="badge-warning">Low Stock</span>
                        ) : (
                          <span className="badge-success">OK</span>
                        )}
                      </td>
                      <td className="table-cell text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setAdjustModal({ open: true, ingredient: ing })} className="p-1.5 rounded-lg hover:bg-brand-500/10 hover:text-brand-400 text-dark-400 transition-all" title="Adjust Stock">
                            <RotateCcw size={13} />
                          </button>
                          <button onClick={() => setIngredientModal({ open: true, ingredient: ing })} className="p-1.5 rounded-lg hover:bg-blue-500/10 hover:text-blue-400 text-dark-400 transition-all" title="Edit">
                            <Edit2 size={13} />
                          </button>
                          <button onClick={() => deleteIngredient(ing.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 hover:text-red-400 text-dark-400 transition-all" title="Delete">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Movements Tab */}
      {tab === 'movements' && (
        <div className="card">
          <h2 className="section-title mb-4">Ingredient Usage Log</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-700/50">
                  <th className="table-header text-left pb-3 pl-2">Ingredient</th>
                  <th className="table-header text-center pb-3">Type</th>
                  <th className="table-header text-right pb-3">Qty</th>
                  <th className="table-header text-right pb-3">Before</th>
                  <th className="table-header text-right pb-3">After</th>
                  <th className="table-header text-left pb-3">Reference</th>
                  <th className="table-header text-left pb-3">By</th>
                  <th className="table-header text-right pb-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {loading ? Array(8).fill(0).map((_, i) => (
                  <tr key={i}><td colSpan={8} className="py-2"><div className="h-9 shimmer rounded-lg" /></td></tr>
                )) : movements.map(mv => {
                  const typeStyles: Record<string, string> = {
                    usage: 'badge-danger',
                    purchase: 'badge-success',
                    adjustment: 'badge-info',
                    waste: 'badge-warning',
                    return: 'badge-brand',
                  };
                  return (
                    <tr key={mv.id} className="border-b border-dark-700/30 hover:bg-dark-800/40 transition-colors">
                      <td className="table-cell pl-2 font-medium text-white">{mv.ingredient_name}</td>
                      <td className="table-cell text-center">
                        <span className={`badge ${typeStyles[mv.type] || 'badge-info'} capitalize`}>
                          {mv.type === 'usage' ? <ArrowDown size={10} /> : <ArrowUp size={10} />}
                          {mv.type}
                        </span>
                      </td>
                      <td className="table-cell text-right font-medium">{mv.quantity.toFixed(2)} {mv.unit}</td>
                      <td className="table-cell text-right text-dark-400">{mv.before_qty.toFixed(2)}</td>
                      <td className="table-cell text-right text-dark-400">{mv.after_qty.toFixed(2)}</td>
                      <td className="table-cell text-dark-300 text-xs">{mv.reference || '—'}</td>
                      <td className="table-cell text-dark-400 text-xs">{mv.user_name || '—'}</td>
                      <td className="table-cell text-right text-xs text-dark-400">{format(parseISO(mv.created_at), 'dd MMM, HH:mm')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Suppliers Tab */}
      {tab === 'suppliers' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title">Suppliers</h2>
            <button onClick={() => setSupplierModal({ open: true })} className="btn-primary flex items-center gap-2 text-sm">
              <Plus size={14} />Add Supplier
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {suppliers.map(sup => (
              <div key={sup.id} className="bg-dark-700/40 rounded-xl p-4 border border-dark-600/40 hover:border-dark-500/60 transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-white">{sup.name}</p>
                    {sup.contact_person && <p className="text-sm text-dark-400">{sup.contact_person}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button className="p-1.5 text-dark-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all" onClick={() => setSupplierModal({ open: true, supplier: sup })} title="Edit">
                      <Edit2 size={13} />
                    </button>
                    <button className="p-1.5 text-dark-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all" onClick={() => deleteSupplier(sup.id)} title="Delete">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                {sup.phone && <p className="text-xs text-dark-400 mt-2">📞 {sup.phone}</p>}
                {sup.email && <p className="text-xs text-dark-400">✉ {sup.email}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {adjustModal.open && adjustModal.ingredient && (
        <AdjustStockModal
          ingredient={adjustModal.ingredient}
          userId={user?.id}
          onClose={() => setAdjustModal({ open: false })}
          onSaved={() => { setAdjustModal({ open: false }); loadAll(); }}
        />
      )}

      {ingredientModal.open && (
        <IngredientFormModal
          ingredient={ingredientModal.ingredient}
          suppliers={suppliers}
          onClose={() => setIngredientModal({ open: false })}
          onSaved={() => { setIngredientModal({ open: false }); loadAll(); }}
        />
      )}

      {supplierModal.open && (
        <SupplierFormModal
          supplier={supplierModal.supplier}
          onClose={() => setSupplierModal({ open: false })}
          onSaved={() => { setSupplierModal({ open: false }); loadAll(); }}
        />
      )}
    </div>
  );
}

// ─── Adjust Stock Modal ───────────────────────────────────────────────────────
function AdjustStockModal({ ingredient, userId, onClose, onSaved }: any) {
  const [type, setType] = useState<'purchase' | 'adjustment' | 'waste'>('purchase');
  const [qty, setQty] = useState('');
  const [notes, setNotes] = useState('');

  const handleSave = async () => {
    if (!qty || isNaN(Number(qty))) { toast.error('Enter a valid quantity'); return; }
    await window.electronAPI.ingredients.adjustStock(ingredient.id, Number(qty), type, notes, userId);
    toast.success('Stock updated');
    onSaved();
  };

  return (
    <Modal title={`Adjust Stock — ${ingredient.name}`} onClose={onClose} size="sm">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {(['purchase', 'adjustment', 'waste'] as const).map(t => (
            <button key={t} onClick={() => setType(t)} className={`py-2 rounded-xl text-sm font-medium border transition-all capitalize ${type === t ? 'bg-brand-500 border-brand-500 text-white' : 'bg-dark-700 border-dark-600/50 text-dark-300 hover:text-white'}`}>
              {t === 'purchase' ? '+ Purchase' : t === 'adjustment' ? '= Set' : '- Waste'}
            </button>
          ))}
        </div>
        <div>
          <label className="block text-sm text-dark-300 mb-1.5">
            {type === 'adjustment' ? 'Set stock to' : 'Quantity'} ({ingredient.unit})
          </label>
          <input type="number" value={qty} onChange={e => setQty(e.target.value)} className="input-field" placeholder="0" autoFocus />
          <p className="text-xs text-dark-400 mt-1">Current: {ingredient.current_stock.toFixed(2)} {ingredient.unit}</p>
        </div>
        <div>
          <label className="block text-sm text-dark-300 mb-1.5">Notes</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} className="input-field" placeholder="Optional notes..." />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} className="btn-primary flex-1">Update Stock</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Ingredient Form Modal ────────────────────────────────────────────────────
function IngredientFormModal({ ingredient, suppliers, onClose, onSaved }: any) {
  const isEdit = !!ingredient;
  const [form, setForm] = useState({
    name: ingredient?.name || '',
    unit: ingredient?.unit || 'g',
    current_stock: ingredient?.current_stock || 0,
    reorder_level: ingredient?.reorder_level || 100,
    cost_per_unit: ingredient?.cost_per_unit || 0,
    supplier_id: ingredient?.supplier_id || '',
    notes: ingredient?.notes || '',
  });

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name) { toast.error('Name is required'); return; }
    if (isEdit) {
      await window.electronAPI.ingredients.update(ingredient.id, form);
      toast.success('Ingredient updated');
    } else {
      await window.electronAPI.ingredients.create(form);
      toast.success('Ingredient created');
    }
    onSaved();
  };

  return (
    <Modal title={isEdit ? `Edit — ${ingredient.name}` : 'New Ingredient'} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm text-dark-300 mb-1.5">Name</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} className="input-field" placeholder="e.g. Espresso Beans" autoFocus />
          </div>
          <div>
            <label className="block text-sm text-dark-300 mb-1.5">Unit</label>
            <select value={form.unit} onChange={e => set('unit', e.target.value)} className="input-field">
              {['g', 'kg', 'ml', 'L', 'pcs', 'oz', 'tbsp', 'tsp'].map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-dark-300 mb-1.5">Cost per unit</label>
            <input type="number" value={form.cost_per_unit} onChange={e => set('cost_per_unit', e.target.value)} className="input-field" />
          </div>
          {!isEdit && (
            <div>
              <label className="block text-sm text-dark-300 mb-1.5">Initial Stock</label>
              <input type="number" value={form.current_stock} onChange={e => set('current_stock', e.target.value)} className="input-field" />
            </div>
          )}
          <div>
            <label className="block text-sm text-dark-300 mb-1.5">Reorder Level</label>
            <input type="number" value={form.reorder_level} onChange={e => set('reorder_level', e.target.value)} className="input-field" />
          </div>
          <div className={isEdit ? 'col-span-2' : ''}>
            <label className="block text-sm text-dark-300 mb-1.5">Supplier</label>
            <select value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)} className="input-field">
              <option value="">— None —</option>
              {suppliers.map((s: Supplier) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-sm text-dark-300 mb-1.5">Notes</label>
            <input value={form.notes} onChange={e => set('notes', e.target.value)} className="input-field" placeholder="Optional notes" />
          </div>
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} className="btn-primary flex-1">Save Ingredient</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Supplier Form Modal ──────────────────────────────────────────────────────
function SupplierFormModal({ supplier, onClose, onSaved }: any) {
  const isEdit = !!supplier;
  const [form, setForm] = useState({
    name: supplier?.name || '',
    contact_person: supplier?.contact_person || '',
    phone: supplier?.phone || '',
    email: supplier?.email || '',
    address: supplier?.address || '',
    notes: supplier?.notes || '',
  });

  const handleSave = async () => {
    if (!form.name) { toast.error('Name is required'); return; }
    if (isEdit) {
      await window.electronAPI.suppliers.update(supplier.id, form);
    } else {
      await window.electronAPI.suppliers.create(form);
    }
    toast.success(isEdit ? 'Supplier updated' : 'Supplier created');
    onSaved();
  };

  return (
    <Modal title={isEdit ? 'Edit Supplier' : 'New Supplier'} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm text-dark-300 mb-1.5">Company Name</label>
            <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="input-field" autoFocus />
          </div>
          {(['contact_person', 'phone', 'email', 'address'] as const).map(k => (
            <div key={k} className={k === 'address' ? 'col-span-2' : ''}>
              <label className="block text-sm text-dark-300 mb-1.5 capitalize">{k.replace('_', ' ')}</label>
              <input value={(form as any)[k]} onChange={e => setForm(f => ({...f, [k]: e.target.value}))} className="input-field" />
            </div>
          ))}
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} className="btn-primary flex-1">Save Supplier</button>
        </div>
      </div>
    </Modal>
  );
}
