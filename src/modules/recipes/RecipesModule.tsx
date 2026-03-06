import { useEffect, useState, useCallback } from 'react';
import { FlaskConical, Plus, Trash2, Edit2, Search, ChefHat, AlertTriangle, CheckCircle2, Sliders } from 'lucide-react';
import { Product, Ingredient, RecipeItem, Modifier } from '../../types';
import toast from 'react-hot-toast';
import Modal from '../../components/ui/Modal';

export default function RecipesModule() {
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [recipe, setRecipe] = useState<RecipeItem[]>([]);
  const [productModifiers, setProductModifiers] = useState<Modifier[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'recipes' | 'modifiers'>('recipes');
  const [addIngModal, setAddIngModal] = useState(false);
  const [modifierModal, setModifierModal] = useState<{ open: boolean; modifier?: Modifier }>({ open: false });

  useEffect(() => { loadInitial(); }, []);

  const loadInitial = async () => {
    setLoading(true);
    const [prods, ings, mods] = await Promise.all([
      window.electronAPI.products.getAll(),
      window.electronAPI.ingredients.getAll(),
      window.electronAPI.modifiers.getAll(),
    ]);
    setProducts(prods.filter((p: Product) => p.is_active));
    setIngredients(ings);
    setModifiers(mods);
    setLoading(false);
  };

  const selectProduct = useCallback(async (product: Product) => {
    setSelectedProduct(product);
    const [rec, mods] = await Promise.all([
      window.electronAPI.recipes.getForProduct(product.id),
      window.electronAPI.modifiers.getForProduct(product.id),
    ]);
    setRecipe(rec);
    setProductModifiers(mods);
  }, []);

  const removeIngredient = async (ingredientId: number) => {
    if (!selectedProduct) return;
    await window.electronAPI.recipes.removeIngredient(selectedProduct.id, ingredientId);
    toast.success('Ingredient removed');
    selectProduct(selectedProduct);
  };

  const toggleModifier = async (modifierId: number) => {
    if (!selectedProduct) return;
    const isLinked = productModifiers.some(m => m.id === modifierId);
    if (isLinked) {
      await window.electronAPI.modifiers.unlinkFromProduct(selectedProduct.id, modifierId);
      toast.success('Modifier unlinked');
    } else {
      await window.electronAPI.modifiers.linkToProduct(selectedProduct.id, modifierId);
      toast.success('Modifier linked');
    }
    const updated = await window.electronAPI.modifiers.getForProduct(selectedProduct.id);
    setProductModifiers(updated);
  };

  const filtered = products.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-full gap-0 animate-fade-in overflow-hidden w-full">
      {/* Product List Panel */}
      <div className="w-72 flex-shrink-0 bg-dark-800 border-r border-dark-700/50 flex flex-col">
        <div className="p-4 border-b border-dark-700/50">
          <h1 className="text-lg font-bold text-white font-display flex items-center gap-2">
            <ChefHat size={20} className="text-brand-400" />
            Recipes & Modifiers
          </h1>
          <div className="relative mt-3">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search menu items…" className="input-field pl-8 text-sm py-2" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            Array(8).fill(0).map((_, i) => <div key={i} className="h-12 shimmer rounded-xl mb-2" />)
          ) : filtered.map(product => {
            const recipeCount = 0; // placeholder
            return (
              <button
                key={product.id}
                onClick={() => selectProduct(product)}
                className={`w-full text-left px-3 py-3 rounded-xl mb-1 transition-all text-sm ${
                  selectedProduct?.id === product.id
                    ? 'bg-brand-500/20 border border-brand-500/40 text-white'
                    : 'hover:bg-dark-700/60 text-dark-200 border border-transparent'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{product.name}</p>
                    <p className="text-xs text-dark-400">{product.category_name}</p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                    <span className="text-xs text-brand-400 font-semibold">Rs.{product.price}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail Panel */}
      <div className="flex-1 flex flex-col overflow-hidden bg-dark-900">
        {!selectedProduct ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-dark-400">
              <FlaskConical size={48} className="opacity-20 mx-auto mb-3" />
              <p className="font-medium">Select a menu item</p>
              <p className="text-sm mt-1">to view or edit its recipe & modifiers</p>
            </div>
          </div>
        ) : (
          <>
            {/* Product Header */}
            <div className="px-6 py-4 border-b border-dark-700/50 bg-dark-800/50 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white font-display">{selectedProduct.name}</h2>
                <p className="text-sm text-dark-400">{selectedProduct.category_name} · Rs.{selectedProduct.price}</p>
              </div>
              <div className="flex gap-1 bg-dark-700 p-1 rounded-xl border border-dark-600/50">
                <button onClick={() => setTab('recipes')} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${tab === 'recipes' ? 'bg-brand-500 text-white' : 'text-dark-300'}`}>
                  <FlaskConical size={13} />Recipe
                </button>
                <button onClick={() => setTab('modifiers')} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${tab === 'modifiers' ? 'bg-brand-500 text-white' : 'text-dark-300'}`}>
                  <Sliders size={13} />Modifiers
                </button>
              </div>
            </div>

            {/* Recipe Tab */}
            {tab === 'recipes' && (
              <div className="flex-1 overflow-y-auto p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-white">Recipe Ingredients</h3>
                    <p className="text-sm text-dark-400">Ingredients automatically deducted when this item is sold</p>
                  </div>
                  <button onClick={() => setAddIngModal(true)} className="btn-primary flex items-center gap-2 text-sm">
                    <Plus size={14} />Add Ingredient
                  </button>
                </div>

                {recipe.length === 0 ? (
                  <div className="text-center py-16 text-dark-400 border-2 border-dashed border-dark-700 rounded-2xl">
                    <FlaskConical size={36} className="opacity-20 mx-auto mb-3" />
                    <p>No recipe defined yet</p>
                    <p className="text-xs mt-1">Add ingredients to track consumption automatically</p>
                    <button onClick={() => setAddIngModal(true)} className="btn-primary mt-4 text-sm">
                      + Add First Ingredient
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recipe.map(item => {
                      const isLow = (item.current_stock ?? 0) <= (item.reorder_level ?? 0);
                      return (
                        <div key={item.ingredient_id} className={`flex items-center gap-4 px-4 py-3 rounded-xl border transition-colors ${isLow ? 'bg-amber-500/5 border-amber-500/20' : 'bg-dark-800 border-dark-700/40 hover:border-dark-600/60'}`}>
                          <div className="w-9 h-9 rounded-lg bg-brand-500/10 flex items-center justify-center flex-shrink-0">
                            <FlaskConical size={16} className="text-brand-400" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-white">{item.ingredient_name}</p>
                            {isLow && (
                              <p className="text-xs text-amber-400 flex items-center gap-1 mt-0.5">
                                <AlertTriangle size={10} />
                                Low stock: {item.current_stock?.toFixed(1)} {item.ingredient_unit} available
                              </p>
                            )}
                          </div>
                          <div className="text-right mr-2">
                            <p className="font-bold text-white">{item.quantity}</p>
                            <p className="text-xs text-dark-400">{item.unit || item.ingredient_unit}</p>
                          </div>
                          <RecipeQtyEditor
                            item={item}
                            productId={selectedProduct.id}
                            onUpdated={() => selectProduct(selectedProduct)}
                          />
                          <button
                            onClick={() => removeIngredient(item.ingredient_id)}
                            className="w-8 h-8 rounded-lg text-dark-400 hover:text-red-400 hover:bg-red-500/10 transition-all flex items-center justify-center"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {recipe.length > 0 && (
                  <div className="mt-4 px-4 py-3 bg-dark-800/60 rounded-xl border border-dark-700/40">
                    <p className="text-sm font-medium text-dark-300">Estimated Cost per Unit</p>
                    <p className="text-2xl font-bold text-brand-400 mt-0.5">
                      Rs.{recipe.reduce((sum, r) => {
                        const ing = ingredients.find(i => i.id === r.ingredient_id);
                        return sum + (ing?.cost_per_unit ?? 0) * r.quantity;
                      }, 0).toFixed(2)}
                    </p>
                    <p className="text-xs text-dark-500 mt-0.5">
                      Margin: Rs.{(selectedProduct.price - recipe.reduce((sum, r) => {
                        const ing = ingredients.find(i => i.id === r.ingredient_id);
                        return sum + (ing?.cost_per_unit ?? 0) * r.quantity;
                      }, 0)).toFixed(2)}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Modifiers Tab */}
            {tab === 'modifiers' && (
              <div className="flex-1 overflow-y-auto p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-white">Product Modifiers</h3>
                    <p className="text-sm text-dark-400">Options shown to cashier when this item is added to cart</p>
                  </div>
                  <button onClick={() => setModifierModal({ open: true })} className="btn-secondary text-sm flex items-center gap-1.5">
                    <Plus size={13} />New Modifier
                  </button>
                </div>

                <div className="space-y-3">
                  {modifiers.map(mod => {
                    const isLinked = productModifiers.some(m => m.id === mod.id);
                    return (
                      <div key={mod.id} className={`rounded-xl border p-4 transition-all ${isLinked ? 'bg-brand-500/5 border-brand-500/30' : 'bg-dark-800 border-dark-700/40'}`}>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => toggleModifier(mod.id)}
                              className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${isLinked ? 'bg-brand-500' : 'bg-dark-600'}`}
                            >
                              <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${isLinked ? 'translate-x-4' : ''}`} />
                            </button>
                            <div>
                              <p className="font-semibold text-white">{mod.name}</p>
                              {mod.description && <p className="text-xs text-dark-400">{mod.description}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {mod.is_required ? <span className="badge-warning text-xs">Required</span> : <span className="badge-info text-xs">Optional</span>}
                            {isLinked && <CheckCircle2 size={16} className="text-brand-400" />}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-3">
                          {mod.options.map(opt => (
                            <span key={opt.id} className="px-2.5 py-1 bg-dark-700 rounded-lg text-xs text-dark-200 border border-dark-600/50">
                              {opt.name}
                              {opt.price_adjustment !== 0 && (
                                <span className={opt.price_adjustment > 0 ? 'text-brand-400 ml-1' : 'text-red-400 ml-1'}>
                                  {opt.price_adjustment > 0 ? '+' : ''}Rs.{opt.price_adjustment}
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add Ingredient Modal */}
      {addIngModal && selectedProduct && (
        <AddIngredientModal
          productId={selectedProduct.id}
          ingredients={ingredients}
          existingIds={recipe.map(r => r.ingredient_id)}
          onClose={() => setAddIngModal(false)}
          onSaved={() => { setAddIngModal(false); selectProduct(selectedProduct); }}
        />
      )}

      {/* Modifier Modal */}
      {modifierModal.open && (
        <ModifierFormModal
          modifier={modifierModal.modifier}
          onClose={() => setModifierModal({ open: false })}
          onSaved={loadInitial}
        />
      )}
    </div>
  );
}

// ─── Recipe Qty Editor ─────────────────────────────────────────────────────────
function RecipeQtyEditor({ item, productId, onUpdated }: { item: RecipeItem; productId: number; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(item.quantity));

  const save = async () => {
    const qty = parseFloat(val);
    if (isNaN(qty) || qty <= 0) { toast.error('Invalid quantity'); return; }
    await window.electronAPI.recipes.upsert(productId, item.ingredient_id, qty, item.unit);
    toast.success('Updated');
    setEditing(false);
    onUpdated();
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          value={val}
          onChange={e => setVal(e.target.value)}
          className="w-20 input-field py-1 text-sm text-center"
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
        />
        <button onClick={save} className="text-brand-400 hover:text-brand-300 p-1">✓</button>
      </div>
    );
  }
  return (
    <button onClick={() => setEditing(true)} className="text-dark-400 hover:text-blue-400 p-1.5 rounded-lg hover:bg-blue-500/10 transition-all">
      <Edit2 size={13} />
    </button>
  );
}

// ─── Add Ingredient Modal ─────────────────────────────────────────────────────
function AddIngredientModal({ productId, ingredients, existingIds, onClose, onSaved }: any) {
  const [selectedId, setSelectedId] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('');
  const available = ingredients.filter((i: Ingredient) => !existingIds.includes(i.id));

  const handleSave = async () => {
    if (!selectedId || !qty) { toast.error('Select an ingredient and enter quantity'); return; }
    const ing = ingredients.find((i: Ingredient) => i.id === Number(selectedId));
    await window.electronAPI.recipes.upsert(productId, Number(selectedId), Number(qty), unit || ing?.unit);
    toast.success('Ingredient added to recipe');
    onSaved();
  };

  return (
    <Modal title="Add Ingredient to Recipe" onClose={onClose} size="sm">
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-dark-300 mb-1.5">Ingredient</label>
          <select
            value={selectedId}
            onChange={e => {
              setSelectedId(e.target.value);
              const ing = ingredients.find((i: Ingredient) => i.id === Number(e.target.value));
              if (ing) setUnit(ing.unit);
            }}
            className="input-field"
          >
            <option value="">— Select ingredient —</option>
            {available.map((i: Ingredient) => (
              <option key={i.id} value={i.id}>{i.name} (Stock: {i.current_stock} {i.unit})</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-dark-300 mb-1.5">Quantity per unit</label>
            <input type="number" value={qty} onChange={e => setQty(e.target.value)} className="input-field" placeholder="e.g. 200" autoFocus />
          </div>
          <div>
            <label className="block text-sm text-dark-300 mb-1.5">Unit</label>
            <input value={unit} onChange={e => setUnit(e.target.value)} className="input-field" placeholder="ml, g, pcs" />
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} className="btn-primary flex-1">Add to Recipe</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Modifier Form Modal ──────────────────────────────────────────────────────
function ModifierFormModal({ modifier, onClose, onSaved }: any) {
  const isEdit = !!modifier;
  const [form, setForm] = useState({
    name: modifier?.name || '',
    description: modifier?.description || '',
    is_required: modifier?.is_required || 0,
    allow_multiple: modifier?.allow_multiple || 0,
  });
  const [options, setOptions] = useState<{ name: string; price_adjustment: number }[]>(
    modifier?.options?.map((o: any) => ({ name: o.name, price_adjustment: o.price_adjustment })) || [{ name: '', price_adjustment: 0 }]
  );

  const handleSave = async () => {
    if (!form.name) { toast.error('Name is required'); return; }
    if (isEdit) {
      await window.electronAPI.modifiers.updateModifier(modifier.id, form);
      toast.success('Modifier updated');
    } else {
      const result = await window.electronAPI.modifiers.createModifier(form);
      const modId = result.id;
      for (const opt of options.filter(o => o.name)) {
        await window.electronAPI.modifiers.addOption(modId, opt);
      }
      toast.success('Modifier created');
    }
    onSaved();
    onClose();
  };

  return (
    <Modal title={isEdit ? 'Edit Modifier' : 'New Modifier'} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-dark-300 mb-1.5">Name</label>
          <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="input-field" placeholder="e.g. Size, Milk Type" autoFocus />
        </div>
        <div>
          <label className="block text-sm text-dark-300 mb-1.5">Description</label>
          <input value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} className="input-field" placeholder="Optional description" />
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!form.is_required} onChange={e => setForm(f => ({...f, is_required: e.target.checked ? 1 : 0}))} className="w-4 h-4 accent-brand-500" />
            <span className="text-sm text-dark-200">Required</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!form.allow_multiple} onChange={e => setForm(f => ({...f, allow_multiple: e.target.checked ? 1 : 0}))} className="w-4 h-4 accent-brand-500" />
            <span className="text-sm text-dark-200">Allow Multiple</span>
          </label>
        </div>
        {!isEdit && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-dark-300">Options</label>
              <button onClick={() => setOptions(o => [...o, { name: '', price_adjustment: 0 }])} className="text-brand-400 text-xs hover:text-brand-300">+ Add Option</button>
            </div>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="grid grid-cols-5 gap-2">
                  <input value={opt.name} onChange={e => { const o = [...options]; o[i].name = e.target.value; setOptions(o); }} className="input-field col-span-3 py-2 text-sm" placeholder={`Option ${i+1}`} />
                  <input type="number" value={opt.price_adjustment} onChange={e => { const o = [...options]; o[i].price_adjustment = Number(e.target.value); setOptions(o); }} className="input-field col-span-1 py-2 text-sm" placeholder="±Rs." />
                  <button onClick={() => setOptions(o => o.filter((_, j) => j !== i))} className="text-dark-400 hover:text-red-400 transition-colors">✕</button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} className="btn-primary flex-1">Save Modifier</button>
        </div>
      </div>
    </Modal>
  );
}
