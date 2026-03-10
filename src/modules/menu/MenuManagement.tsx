import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Search, Package, Tag } from 'lucide-react';
import { Product, Category } from '../../types';
import toast from 'react-hot-toast';
import Modal from '../../components/ui/Modal';

export default function MenuManagement() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tab, setTab] = useState<'products' | 'categories'>('products');
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<number | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [productModal, setProductModal] = useState<{ open: boolean; product?: Product }>({ open: false });
  const [categoryModal, setCategoryModal] = useState<{ open: boolean; category?: Category }>({ open: false });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [prods, cats] = await Promise.all([
      window.electronAPI.products.getAll(),
      window.electronAPI.categories.getAll(),
    ]);
    setProducts(prods);
    setCategories(cats);
    setLoading(false);
  };

  const deleteProduct = async (id: number) => {
    if (!confirm('Delete this product?')) return;
    await window.electronAPI.products.delete(id);
    toast.success('Product deleted');
    loadData();
  };

  const deleteCategory = async (id: number) => {
    if (!confirm('Delete this category?')) return;
    await window.electronAPI.categories.delete(id);
    toast.success('Category deleted');
    loadData();
  };

  const filteredProducts = products.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku?.includes(search);
    const matchCat = filterCat === 'all' || p.category_id === filterCat;
    return matchSearch && matchCat;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="page-header">Menu Management</h1>
        <div className="flex gap-2">
          {tab === 'products' ? (
            <button onClick={() => setProductModal({ open: true })} className="btn-primary flex items-center gap-2">
              <Plus size={16} /> Add Product
            </button>
          ) : (
            <button onClick={() => setCategoryModal({ open: true })} className="btn-primary flex items-center gap-2">
              <Plus size={16} /> Add Category
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-dark-800 p-1 rounded-xl w-fit border border-dark-700/50">
        <button onClick={() => setTab('products')} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'products' ? 'bg-brand-500 text-white' : 'text-dark-300 hover:text-white'}`}>
          <Package size={14} className="inline mr-1.5" />Products
        </button>
        <button onClick={() => setTab('categories')} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'categories' ? 'bg-brand-500 text-white' : 'text-dark-300 hover:text-white'}`}>
          <Tag size={14} className="inline mr-1.5" />Categories
        </button>
      </div>

      {tab === 'products' && (
        <div className="card">
          {/* Filters */}
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..." className="input-field pl-9" />
            </div>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value === 'all' ? 'all' : Number(e.target.value))} className="input-field w-44">
              <option value="all">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-700/50">
                  <th className="table-header py-2 px-3 text-left">Product</th>
                  <th className="table-header py-2 px-3 text-left">Category</th>
                  <th className="table-header py-2 px-3 text-right">Price</th>
                  <th className="table-header py-2 px-3 text-right">Stock</th>
                  <th className="table-header py-2 px-3 text-center">Status</th>
                  <th className="table-header py-2 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array(6).fill(0).map((_, i) => (
                    <tr key={i}><td colSpan={6} className="py-3 px-3"><div className="h-8 shimmer rounded-lg" /></td></tr>
                  ))
                ) : filteredProducts.length === 0 ? (
                  <tr><td colSpan={6} className="text-center text-dark-400 py-12">No products found</td></tr>
                ) : (
                  filteredProducts.map(p => (
                    <tr key={p.id} className="border-b border-dark-700/30 hover:bg-dark-700/20 transition-colors">
                      <td className="table-cell">
                        <div>
                          <p className="font-medium text-white">{p.name}</p>
                          {p.sku && <p className="text-xs text-dark-400">{p.sku}</p>}
                        </div>
                      </td>
                      <td className="table-cell">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.category_color || '#e25a26' }} />
                          {p.category_name}
                        </span>
                      </td>
                      <td className="table-cell text-right font-semibold text-brand-400">Rs.{p.price}</td>
                      <td className="table-cell text-right">
                        {p.track_inventory ? (
                          <span className={`font-medium ${(p.stock ?? 0) <= (p.min_quantity ?? 5) ? 'text-amber-400' : 'text-white'}`}>
                            {p.stock ?? 0} {p.unit}
                          </span>
                        ) : <span className="text-dark-500">—</span>}
                      </td>
                      <td className="table-cell text-center">
                        <span className={p.is_active ? 'badge-success' : 'badge-danger'}>{p.is_active ? 'Active' : 'Inactive'}</span>
                      </td>
                      <td className="table-cell text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => setProductModal({ open: true, product: p })} className="text-dark-400 hover:text-blue-400 transition-colors p-1">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => deleteProduct(p.id)} className="text-dark-400 hover:text-red-400 transition-colors p-1">
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
      )}

      {tab === 'categories' && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {categories.map(cat => (
            <div key={cat.id} className="card-hover group">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ backgroundColor: cat.color + '20', border: `1px solid ${cat.color}40` }}>
                  ☕
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setCategoryModal({ open: true, category: cat })} className="text-dark-400 hover:text-blue-400 p-1">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => deleteCategory(cat.id)} className="text-dark-400 hover:text-red-400 p-1">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="w-full h-1 rounded-full mb-3" style={{ backgroundColor: cat.color + '60' }} />
              <h3 className="font-semibold text-white">{cat.name}</h3>
              <p className="text-xs text-dark-400 mt-0.5">{cat.product_count} products</p>
            </div>
          ))}
          <button onClick={() => setCategoryModal({ open: true })} className="border-2 border-dashed border-dark-600 rounded-2xl p-5 flex flex-col items-center justify-center gap-2 text-dark-400 hover:border-brand-500/50 hover:text-brand-400 transition-all h-[130px]">
            <Plus size={24} />
            <span className="text-sm font-medium">Add Category</span>
          </button>
        </div>
      )}

      {/* Product Modal */}
      {productModal.open && (
        <ProductFormModal
          product={productModal.product}
          categories={categories}
          onClose={() => setProductModal({ open: false })}
          onSaved={loadData}
        />
      )}

      {/* Category Modal */}
      {categoryModal.open && (
        <CategoryFormModal
          category={categoryModal.category}
          onClose={() => setCategoryModal({ open: false })}
          onSaved={loadData}
        />
      )}
    </div>
  );
}

function ProductFormModal({ product, categories, onClose, onSaved }: any) {
  const isEdit = !!product;
  const [form, setForm] = useState({
    name: product?.name || '',
    description: product?.description || '',
    sku: product?.sku || '',
    category_id: product?.category_id || (categories[0]?.id || ''),
    price: product?.price || '',
    cost_price: product?.cost_price || '',
    tax_rate: product?.tax_rate || 0,
    is_active: product?.is_active !== 0,
    track_inventory: product?.track_inventory !== 0,
    min_quantity: product?.min_quantity || 5,
    unit: product?.unit || 'pcs',
    initial_stock: '',
    add_stock: 0,
    current_stock: product?.stock || 0,
  });

  const [variants, setVariants] = useState<any[]>(product?.variants || []);

  const handleAddVariant = () => setVariants([...variants, { name: '', price: '', sku: '' }]);
  const updateVariant = (index: number, field: string, value: any) => {
    const newVariants = [...variants];
    newVariants[index][field] = value;
    setVariants(newVariants);
  };
  const removeVariant = (index: number) => {
    setVariants(variants.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!form.name || !form.price) { toast.error('Name and price are required'); return; }
    
    // Ensure all variants have a name and price
    for (const v of variants) {
      if (!v.name || !v.price) { toast.error('All variants must have a name and price'); return; }
      v.price = Number(v.price);
    }

    const data = { 
      ...form, 
      price: Number(form.price), 
      cost_price: Number(form.cost_price), 
      category_id: Number(form.category_id),
      initial_stock: form.initial_stock === '' ? 0 : Number(form.initial_stock),
      add_stock: Number(form.add_stock),
      variants 
    };
    if (isEdit) {
      await window.electronAPI.products.update(product.id, data);
      toast.success('Product updated');
    } else {
      await window.electronAPI.products.create(data);
      toast.success('Product created');
    }
    onSaved();
    onClose();
  };

  return (
    <Modal title={isEdit ? 'Edit Product' : 'Add Product'} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm text-dark-300 mb-1.5">Product Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="input-field" placeholder="e.g. Cappuccino" />
          </div>
          <div>
            <label className="block text-sm text-dark-300 mb-1.5">SKU</label>
            <input value={form.sku} onChange={e => setForm(f => ({...f, sku: e.target.value}))} className="input-field" placeholder="CAP001" />
          </div>
          <div>
            <label className="block text-sm text-dark-300 mb-1.5">Category *</label>
            <select value={form.category_id} onChange={e => setForm(f => ({...f, category_id: Number(e.target.value)}))} className="input-field">
              {categories.map((c: Category) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-dark-300 mb-1.5">Selling Price (Rs.) *</label>
            <input type="number" value={form.price} onChange={e => setForm(f => ({...f, price: e.target.value}))} className="input-field" placeholder="0" />
          </div>
          <div>
            <label className="block text-sm text-dark-300 mb-1.5">Cost Price (Rs.)</label>
            <input type="number" value={form.cost_price} onChange={e => setForm(f => ({...f, cost_price: e.target.value}))} className="input-field" placeholder="0" />
          </div>
          <div>
            <label className="block text-sm text-dark-300 mb-1.5">Tax Rate (%)</label>
            <input type="number" value={form.tax_rate} onChange={e => setForm(f => ({...f, tax_rate: Number(e.target.value)}))} className="input-field" placeholder="0" />
          </div>
          <div>
            <label className="block text-sm text-dark-300 mb-1.5">Unit</label>
            <input value={form.unit} onChange={e => setForm(f => ({...f, unit: e.target.value}))} className="input-field" placeholder="pcs, cup, kg" />
          </div>
          <div>
            <label className="block text-sm text-dark-300 mb-1.5">Min Stock Alert</label>
            <input type="number" value={form.min_quantity} onChange={e => setForm(f => ({...f, min_quantity: Number(e.target.value)}))} className="input-field" />
          </div>
          {!isEdit && (
            <div>
              <label className="block text-sm text-dark-300 mb-1.5">Initial Stock</label>
              <input type="number" value={form.initial_stock} onChange={e => setForm(f => ({...f, initial_stock: e.target.value}))} className="input-field" placeholder="0" />
            </div>
          )}
          {isEdit && form.track_inventory && (
             <div className="flex gap-4 col-span-2 bg-dark-800/50 p-3 rounded-xl border border-dark-600/50">
                <div className="flex-1">
                   <label className="block text-xs font-bold text-dark-400 uppercase tracking-wider mb-1">Current Stock</label>
                   <div className="text-xl font-bold text-white px-1 leading-none">{form.current_stock} <span className="text-[10px] text-dark-400 uppercase tracking-widest">{form.unit}</span></div>
                </div>
                <div className="flex-1">
                   <label className="block text-xs font-bold text-brand-400 uppercase tracking-wider mb-1">Add to Stock (+)</label>
                   <input 
                      type="number" 
                      value={form.add_stock} 
                      onChange={e => setForm(f => ({...f, add_stock: Number(e.target.value)}))} 
                      className="w-full bg-dark-700 border border-brand-500/20 focus:border-brand-500 rounded-lg px-3 py-1.5 outline-none text-white text-sm font-bold" 
                      placeholder="Enter amount to add..." 
                   />
                </div>
             </div>
          )}
        </div>

        <div className="col-span-2">
          <label className="block text-sm text-dark-300 mb-1.5">Description</label>
          <textarea value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} className="input-field h-20 resize-none" placeholder="Product description..." />
        </div>

        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({...f, is_active: e.target.checked}))} className="w-4 h-4 accent-brand-500" />
            <span className="text-sm text-dark-200">Active</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.track_inventory} onChange={e => setForm(f => ({...f, track_inventory: e.target.checked}))} className="w-4 h-4 accent-brand-500" />
            <span className="text-sm text-dark-200">Track Inventory</span>
          </label>
        </div>

        {/* Variants Section */}
        <div className="pt-4 border-t border-dark-700/50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-white text-sm">Product Variants</h3>
            <button onClick={handleAddVariant} className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 font-medium transition-colors">
              <Plus size={14} /> Add Variant
            </button>
          </div>
          
          {variants.length > 0 && (
            <div className="bg-dark-800 border border-dark-600/50 rounded-xl overflow-hidden mb-2">
              <table className="w-full text-left text-sm">
                <thead className="bg-dark-700/50 text-dark-300">
                  <tr>
                    <th className="px-3 py-2 font-medium">Variant Name *</th>
                    <th className="px-3 py-2 font-medium">Price *</th>
                    <th className="px-3 py-2 font-medium">SKU</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-600/50">
                  {variants.map((v, i) => (
                    <tr key={i} className="hover:bg-dark-700/30 transition-colors">
                      <td className="px-2 py-2">
                        <input value={v.name} onChange={e => updateVariant(i, 'name', e.target.value)} className="w-full bg-transparent border border-dark-600 focus:border-brand-500 rounded px-2 py-1 outline-none text-white text-xs placeholder-dark-500" placeholder="e.g. 6 pcs" />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" value={v.price} onChange={e => updateVariant(i, 'price', e.target.value)} className="w-full bg-transparent border border-dark-600 focus:border-brand-500 rounded px-2 py-1 outline-none text-white text-xs placeholder-dark-500" placeholder="0.00" />
                      </td>
                      <td className="px-2 py-2">
                        <input value={v.sku || ''} onChange={e => updateVariant(i, 'sku', e.target.value)} className="w-full bg-transparent border border-dark-600 focus:border-brand-500 rounded px-2 py-1 outline-none text-white text-xs placeholder-dark-500" placeholder="SKU" />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button onClick={() => removeVariant(i)} className="text-dark-500 hover:text-red-400 transition-colors p-1" title="Remove Variant">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {variants.length === 0 && (
             <p className="text-xs text-dark-400 italic">No variants. The main product price will be used.</p>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} className="btn-primary flex-1">
            {isEdit ? 'Save Changes' : 'Add Product'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CategoryFormModal({ category, onClose, onSaved }: any) {
  const isEdit = !!category;
  const [form, setForm] = useState({
    name: category?.name || '',
    description: category?.description || '',
    color: category?.color || '#e25a26',
    icon: category?.icon || 'coffee',
    sort_order: category?.sort_order || 0,
    is_active: category?.is_active !== 0,
  });

  const handleSave = async () => {
    if (!form.name) { toast.error('Name is required'); return; }
    if (isEdit) {
      await window.electronAPI.categories.update(category.id, form);
      toast.success('Category updated');
    } else {
      await window.electronAPI.categories.create(form);
      toast.success('Category created');
    }
    onSaved();
    onClose();
  };

  const colors = ['#e25a26', '#3b82f6', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316'];

  return (
    <Modal title={isEdit ? 'Edit Category' : 'Add Category'} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-dark-300 mb-1.5">Category Name *</label>
          <input 
             type="text"
             autoFocus
             value={form.name} 
             onChange={e => setForm(f => ({...f, name: e.target.value}))} 
             className="input-field" 
             placeholder="e.g. Hot Drinks" 
          />
        </div>
        <div>
          <label className="block text-sm text-dark-300 mb-1.5">Description</label>
          <input 
             type="text"
             value={form.description} 
             onChange={e => setForm(f => ({...f, description: e.target.value}))} 
             className="input-field" 
             placeholder="Brief description..." 
          />
        </div>
        <div>
          <label className="block text-sm text-dark-300 mb-2">Color</label>
          <div className="flex gap-2 flex-wrap">
            {colors.map(c => (
              <button
                key={c}
                onClick={() => setForm(f => ({...f, color: c}))}
                className="w-8 h-8 rounded-lg border-2 transition-all"
                style={{ backgroundColor: c, borderColor: form.color === c ? 'white' : 'transparent' }}
              />
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm text-dark-300 mb-1.5">Sort Order</label>
          <input type="number" value={form.sort_order} onChange={e => setForm(f => ({...f, sort_order: Number(e.target.value)}))} className="input-field" />
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} className="btn-primary flex-1">
            {isEdit ? 'Save Changes' : 'Add Category'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
