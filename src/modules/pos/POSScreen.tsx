import { useEffect, useState, useCallback } from 'react';
import { Search, ShoppingCart, Trash2, Plus, Minus, Tag, ChevronRight, X, CreditCard, Banknote, Smartphone } from 'lucide-react';
import { Product, Category } from '../../types';
import { usePOSStore } from '../../store/posStore';
import { useAppStore } from '../../store/appStore';
import toast from 'react-hot-toast';
import ReceiptModal from './ReceiptModal';

export default function POSScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [lastOrder, setLastOrder] = useState<any>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [processing, setProcessing] = useState(false);

  const { user, settings } = useAppStore();
  const currency = settings?.currency_symbol || '₨';

  const {
    cart, addToCart, removeFromCart, updateQuantity,
    updateItemDiscount, clearCart, setDiscount, setPaymentMethod,
    setAmountPaid, subtotal, discountAmount, taxAmount, total,
    changeAmount, discountType, discountValue, paymentMethod, amountPaid,
    notes, setNotes,
  } = usePOSStore();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [prods, cats] = await Promise.all([
      window.electronAPI.products.getAll(),
      window.electronAPI.categories.getAll(),
    ]);
    setProducts(prods.filter((p: Product) => p.is_active === 1));
    setCategories(cats.filter((c: Category) => c.is_active === 1));
    setLoading(false);
  };

  const filteredProducts = useCallback(() => {
    let list = products;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q));
    } else if (selectedCategory !== 'all') {
      list = list.filter(p => p.category_id === selectedCategory);
    }
    return list;
  }, [products, selectedCategory, searchQuery]);

  const handleAddToCart = (product: Product) => {
    addToCart({
      product_id: product.id,
      product_name: product.name,
      unit_price: product.price,
      quantity: 1,
      discount_percent: 0,
      tax_rate: product.tax_rate,
      line_total: product.price,
    });
  };

  const handleCheckout = async () => {
    if (cart.length === 0) { toast.error('Cart is empty'); return; }
    if (paymentMethod === 'cash' && amountPaid < total()) {
      toast.error('Amount paid is less than total'); return;
    }

    setProcessing(true);
    try {
      const orderData = {
        user_id: user!.id,
        items: cart,
        subtotal: subtotal(),
        discount_type: discountType,
        discount_value: discountValue,
        discount_amount: discountAmount(),
        tax_amount: taxAmount(),
        total: total(),
        payment_method: paymentMethod,
        amount_paid: paymentMethod === 'cash' ? amountPaid : total(),
        change_amount: changeAmount(),
        notes,
      };

      const result = await window.electronAPI.orders.create(orderData);
      if (result.success) {
        const fullOrder = await window.electronAPI.orders.getById(result.id);
        setLastOrder({ ...fullOrder, currency_symbol: currency });
        clearCart();
        setCheckoutOpen(false);
        setReceiptOpen(true);
        toast.success(`Order ${result.order_number} completed!`);
        loadData(); // refresh stock
      } else {
        toast.error('Failed to create order');
      }
    } finally {
      setProcessing(false);
    }
  };

  const fmt = (v: number) => `${currency}${v.toFixed(0)}`;

  const inputCls = "bg-dark-600 border border-dark-500/50 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500/50 w-full";

  return (
    <div className="h-full flex bg-dark-900 overflow-hidden">
      {/* ── Left: Product Grid ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-dark-700/50">
        {/* Search + Category bar */}
        <div className="px-4 pt-4 pb-3 space-y-3 border-b border-dark-700/50 bg-dark-800/50">
          {/* Search */}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSelectedCategory('all'); }}
              placeholder="Search products or SKU..."
              className="w-full bg-dark-700 border border-dark-600/50 text-white pl-9 pr-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-brand-500/60 placeholder-dark-400"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Category pills */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => { setSelectedCategory('all'); setSearchQuery(''); }}
              className={`category-pill flex-shrink-0 ${selectedCategory === 'all' && !searchQuery ? 'active' : ''}`}
              style={selectedCategory === 'all' && !searchQuery ? { backgroundColor: '#e25a26' } : {}}
            >
              All Items
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => { setSelectedCategory(cat.id); setSearchQuery(''); }}
                className={`category-pill flex-shrink-0 ${selectedCategory === cat.id && !searchQuery ? 'active' : ''}`}
                style={selectedCategory === cat.id && !searchQuery ? { backgroundColor: cat.color } : {}}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Products Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array(12).fill(0).map((_, i) => (
                <div key={i} className="h-28 rounded-xl bg-dark-700 shimmer" />
              ))}
            </div>
          ) : filteredProducts().length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-dark-400">
              <Search size={40} className="mb-3 opacity-30" />
              <p className="text-sm">No products found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredProducts().map(product => {
                const inCart = cart.find(i => i.product_id === product.id);
                const outOfStock = product.track_inventory && (product.stock ?? 0) <= 0;
                return (
                  <button
                    key={product.id}
                    onClick={() => !outOfStock && handleAddToCart(product)}
                    disabled={outOfStock}
                    className={`pos-product-card text-left relative ${outOfStock ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    {/* Category color strip */}
                    <div
                      className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl opacity-60"
                      style={{ backgroundColor: product.category_color || '#e25a26' }}
                    />
                    {inCart && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-brand-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">
                        {inCart.quantity}
                      </div>
                    )}
                    <div className="pt-1">
                      <p className="text-sm font-semibold text-white leading-tight truncate">{product.name}</p>
                      {product.sku && <p className="text-[10px] text-dark-400 mt-0.5">{product.sku}</p>}
                      <p className="text-xs text-dark-400 mt-1 truncate">{product.category_name}</p>
                      <p className="text-base font-bold text-brand-400 mt-2">{fmt(product.price)}</p>
                      {product.track_inventory && (
                        <p className={`text-[10px] mt-0.5 ${(product.stock ?? 0) <= (product.min_quantity ?? 5) ? 'text-amber-400' : 'text-dark-500'}`}>
                          {outOfStock ? 'Out of stock' : `Stock: ${product.stock}`}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Cart ──────────────────────────────────────────── */}
      <div className="w-96 flex flex-col bg-dark-800">
        {/* Cart header */}
        <div className="px-4 py-3 border-b border-dark-700/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart size={18} className="text-brand-400" />
            <span className="font-semibold text-white">Cart</span>
            {cart.length > 0 && (
              <span className="badge-brand">{cart.reduce((s, i) => s + i.quantity, 0)}</span>
            )}
          </div>
          {cart.length > 0 && (
            <button onClick={() => clearCart()} className="text-red-400 hover:text-red-300 text-xs flex items-center gap-1 transition-colors">
              <Trash2 size={12} />
              Clear
            </button>
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-dark-500">
              <ShoppingCart size={36} className="opacity-20 mb-2" />
              <p className="text-sm">Add items to start order</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.product_id} className="bg-dark-700/60 border border-dark-600/40 rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{item.product_name}</p>
                    <p className="text-xs text-dark-400">{fmt(item.unit_price)} each</p>
                  </div>
                  <button onClick={() => removeFromCart(item.product_id)} className="text-dark-500 hover:text-red-400 transition-colors flex-shrink-0">
                    <X size={14} />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-2">
                  {/* Qty controls */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                      className="w-6 h-6 rounded-lg bg-dark-600 hover:bg-dark-500 flex items-center justify-center text-white transition-colors"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="text-sm font-semibold text-white w-8 text-center">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                      className="w-6 h-6 rounded-lg bg-dark-600 hover:bg-dark-500 flex items-center justify-center text-white transition-colors"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  <p className="text-sm font-bold text-brand-400">{fmt(item.line_total)}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Order totals + Checkout */}
        <div className="border-t border-dark-700/50 px-4 py-4 space-y-3">
          {/* Discount */}
          <div className="flex items-center gap-2">
            <Tag size={14} className="text-dark-400 flex-shrink-0" />
            <select
              value={discountType || ''}
              onChange={e => setDiscount(e.target.value as any || null, discountValue)}
              className="text-xs bg-dark-700 border border-dark-600/50 text-dark-200 rounded-lg px-2 py-1.5 focus:outline-none flex-1"
            >
              <option value="">No Discount</option>
              <option value="percent">% Off</option>
              <option value="fixed">Fixed Off</option>
            </select>
            {discountType && (
              <input
                type="number"
                value={discountValue}
                onChange={e => setDiscount(discountType, Number(e.target.value))}
                className="w-20 text-xs bg-dark-700 border border-dark-600/50 text-white rounded-lg px-2 py-1.5 focus:outline-none"
                placeholder={discountType === 'percent' ? '%' : currency}
                min={0}
              />
            )}
          </div>

          {/* Totals */}
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-dark-300">
              <span>Subtotal</span><span>{fmt(subtotal())}</span>
            </div>
            {discountAmount() > 0 && (
              <div className="flex justify-between text-emerald-400">
                <span>Discount</span><span>-{fmt(discountAmount())}</span>
              </div>
            )}
            {taxAmount() > 0 && (
              <div className="flex justify-between text-dark-300">
                <span>Tax</span><span>{fmt(taxAmount())}</span>
              </div>
            )}
            <div className="flex justify-between text-white font-bold text-lg border-t border-dark-700/50 pt-2 mt-1">
              <span>Total</span><span className="text-brand-400">{fmt(total())}</span>
            </div>
          </div>

          {/* Payment method */}
          <div className="grid grid-cols-3 gap-2">
            {(['cash', 'card', 'online'] as const).map(method => (
              <button
                key={method}
                onClick={() => setPaymentMethod(method)}
                className={`flex flex-col items-center gap-1 py-2 rounded-xl border text-xs font-medium transition-all ${
                  paymentMethod === method
                    ? 'bg-brand-500/20 border-brand-500/40 text-brand-300'
                    : 'bg-dark-700 border-dark-600/40 text-dark-300 hover:border-dark-500'
                }`}
              >
                {method === 'cash' ? <Banknote size={16} /> : method === 'card' ? <CreditCard size={16} /> : <Smartphone size={16} />}
                {method.charAt(0).toUpperCase() + method.slice(1)}
              </button>
            ))}
          </div>

          {/* Cash paid */}
          {paymentMethod === 'cash' && (
            <div className="space-y-1">
              <label className="text-xs text-dark-400">Amount Received</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400 text-sm">{currency}</span>
                <input
                  type="number"
                  value={amountPaid || ''}
                  onChange={e => setAmountPaid(Number(e.target.value))}
                  className="w-full bg-dark-700 border border-dark-600/50 text-white rounded-xl pl-8 pr-3 py-2.5 text-sm focus:outline-none focus:border-brand-500/60"
                  placeholder="0"
                />
              </div>
              {amountPaid >= total() && total() > 0 && (
                <div className="flex justify-between text-emerald-400 text-sm font-semibold bg-emerald-500/10 rounded-lg px-3 py-1.5 border border-emerald-500/20">
                  <span>Change</span>
                  <span>{fmt(changeAmount())}</span>
                </div>
              )}
              {/* Quick amount buttons */}
              <div className="grid grid-cols-4 gap-1.5 mt-1">
                {[500, 1000, 2000, 5000].map(amt => (
                  <button
                    key={amt}
                    onClick={() => setAmountPaid(amt)}
                    className="text-[10px] py-1.5 bg-dark-700 hover:bg-dark-600 border border-dark-600/40 rounded-lg text-dark-200 transition-colors font-medium"
                  >
                    {currency}{amt >= 1000 ? `${amt/1000}k` : amt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Charge button */}
          <button
            onClick={handleCheckout}
            disabled={cart.length === 0 || processing}
            className="btn-primary w-full py-3.5 text-base flex items-center justify-center gap-2 mt-1"
          >
            {processing ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Charge {fmt(total())}
                <ChevronRight size={18} />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Receipt Modal */}
      {receiptOpen && lastOrder && (
        <ReceiptModal order={lastOrder} onClose={() => setReceiptOpen(false)} />
      )}
    </div>
  );
}
