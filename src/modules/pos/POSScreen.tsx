import { useEffect, useState, useCallback } from 'react';
import { Search, ShoppingCart, Trash2, Plus, Minus, Tag, ChevronRight, X, CreditCard, Banknote, Smartphone, Coffee } from 'lucide-react';
import { Product, Category } from '../../types';
import { usePOSStore } from '../../store/posStore';
import { useAppStore } from '../../store/appStore';
import toast from 'react-hot-toast';
import ReceiptModal from './ReceiptModal';
import LoyaltyPromptModal from './LoyaltyPromptModal';

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
  const [variantModalProduct, setVariantModalProduct] = useState<Product | null>(null);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [showLoyaltyPrompt, setShowLoyaltyPrompt] = useState(false);
  const [recipes, setRecipes] = useState<any[]>([]);

  const { user, settings } = useAppStore();
  const currency = settings?.currency_symbol || '₨';

  const getRedemptionDiscount = () => {
    if (!isRedeeming || !loyaltyCard) return 0;
    const eligibleCats = JSON.parse(settings?.loyalty_eligible_categories || '[]');
    const eligibleItems = cart.filter(item => {
      const product = products.find(p => p.id === item.product_id);
      return eligibleCats.includes(product?.category_id);
    });
    
    if (eligibleItems.length === 0) return 0;
    // Discount the cheapest eligible item (or should it be most expensive? Usually cafe policy varies, but cheapest is 'safe'. 
    // However, usually it's "Get 1 free" of the same category, often the one in the cart. Let's pick the max for better customer joy.)
    return Math.max(...eligibleItems.map(i => i.unit_price));
  };

  const currentTotal = () => {
    const baseTotal = total();
    return Math.max(0, baseTotal - getRedemptionDiscount());
  };

  const {
    cart, addToCart, removeFromCart, updateQuantity,
    updateItemDiscount, clearCart, setDiscount, setPaymentMethod,
    setAmountPaid, subtotal, discountAmount, taxAmount, total,
    changeAmount, discountType, discountValue, paymentMethod, amountPaid,
    notes, setNotes, setCustomer, loyaltyCard, setLoyaltyCard, customerId
  } = usePOSStore();

  useEffect(() => {
    loadData();

    // Global barcode/QR scanner listener
    let scanBuffer = '';
    let lastKeyTime = Date.now();

    const handleKeyPress = async (e: KeyboardEvent) => {
      // Ignore if in input
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      const currentTime = Date.now();
      if (currentTime - lastKeyTime > 100) scanBuffer = ''; // Reset if slow typing
      lastKeyTime = currentTime;

      if (e.key === 'Enter') {
        if (scanBuffer.startsWith('LOYALTY-')) {
          const code = scanBuffer;
          const card = await window.electronAPI.loyalty.getCardByCode(code);
          if (card) {
            setCustomer(card.customer_id, card.customer_name);
            setLoyaltyCard(card);
            toast.success(`Loyalty Account: ${card.customer_name}`, { icon: '☕' });
          } else {
            toast.error('Invalid Loyalty QR');
          }
        }
        scanBuffer = '';
      } else if (e.key.length === 1) {
        scanBuffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [setCustomer, setLoyaltyCard]);

  const loadData = async () => {
    const [prods, cats, recs] = await Promise.all([
      window.electronAPI.products.getAll(),
      window.electronAPI.categories.getAll(),
      window.electronAPI.recipes.getAll(),
    ]);
    // Note: We no longer filter out inactive products so they can show 'Unavailable'
    setProducts(prods);
    setCategories(cats.filter((c: Category) => c.is_active === 1));
    setRecipes(recs);
    setLoading(false);
  };

  const getProductStatus = (product: Product) => {
    // 1. Check Master Switch
    if (!product.is_active) return { label: 'Unavailable', color: 'text-red-400', disabled: true };
    
    // 2. Check Recipes (Ingredient Tracking)
    const productRecipes = recipes.filter(r => r.product_id === product.id);
    
    if (productRecipes.length > 0) {
      // First, check for CRITICAL shortages (not enough for even 1 sale)
      const outOf = productRecipes.find(r => r.current_stock < r.quantity);
      if (outOf) {
        return { label: `Out of ${outOf.ingredient_name}`, color: 'text-amber-500', disabled: false };
      }

      // Second, check for warnings (below reorder level but still available)
      const lowOn = productRecipes.find(r => r.current_stock < (r.reorder_level || 10));
      if (lowOn) {
        return { label: `Low ${lowOn.ingredient_name}`, color: 'text-amber-400', disabled: false };
      }
    }
    
    // 3. Simple product (No recipe or full stock) -> Available
    return { label: 'Available', color: 'text-emerald-400', disabled: false };
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

  const handleAddToCart = (product: Product, variant?: any) => {
    if (product.variants && product.variants.length > 0 && !variant) {
      setVariantModalProduct(product);
      return;
    }

    const price = variant ? variant.price : product.price;
    const status = getProductStatus(product);

    if (status.label === 'Unavailable') {
      toast.error('Product is currently inactive');
      return;
    }

    if (status.label.startsWith('Out of')) {
      toast.error(status.label);
      return;
    }

    addToCart({
      product_id: product.id,
      variant_id: variant?.id,
      product_name: product.name,
      variant_name: variant?.name,
      unit_price: price,
      quantity: 1,
      discount_percent: 0,
      tax_rate: product.tax_rate,
      line_total: price,
    });
    
    setVariantModalProduct(null);
  };

  const handleCheckout = async (arg: any = false) => {
    const skipPrompt = typeof arg === 'boolean' ? arg : false;

    if (cart.length === 0) { toast.error('Cart is empty'); return; }
    if (paymentMethod === 'cash' && amountPaid < total()) {
      toast.error('Amount paid is less than total'); return;
    }

    const getFinalItems = () => {
      if (!isRedeeming || !loyaltyCard) return cart;
      const eligibleCats = JSON.parse(settings?.loyalty_eligible_categories || '[]');
      const items = [...cart];
      // Find the most expensive eligible item to discount
      let bestIndex = -1;
      let maxPrice = -1;
      items.forEach((item, idx) => {
        const product = products.find(p => p.id === item.product_id);
        if (eligibleCats.includes(product?.category_id) && item.unit_price > maxPrice) {
          maxPrice = item.unit_price;
          bestIndex = idx;
        }
      });
      
      if (bestIndex !== -1) {
        // If they have multiple quantity, we only discount ONE.
        if (items[bestIndex].quantity > 1) {
           const origItem = items[bestIndex];
           // Split it into two lines: one free, others paid. 
           // Or just subtract one price from line_total.
           // Cleaner: subtract one unit price from line_total.
           items[bestIndex] = { ...origItem, line_total: Math.max(0, origItem.line_total - origItem.unit_price) };
        } else {
           items[bestIndex] = { ...items[bestIndex], line_total: 0 };
        }
      }
      return items;
    };

    const orderData = {
      user_id: user!.id,
      items: getFinalItems(),
      subtotal: subtotal(),
      discount_type: discountType,
      discount_value: discountValue,
      discount_amount: discountAmount(),
      tax_amount: taxAmount(),
      total: currentTotal(),
      payment_method: paymentMethod,
      amount_paid: paymentMethod === 'cash' ? amountPaid : currentTotal(),
      change_amount: Math.max(0, amountPaid - currentTotal()),
      notes,
      customer_id: customerId,
      loyalty_redeemed: !!loyaltyCard && loyaltyCard.stamps >= loyaltyCard.reward_threshold && isRedeeming,
      loyalty_discount_amount: getRedemptionDiscount(),
    };

    // Check if we should prompt for loyalty
    if (!customerId && !skipPrompt) {
      const eligibleCats = JSON.parse(settings?.loyalty_eligible_categories || '[]');
      const eligibleItems = cart.filter(item => {
        const product = products.find(p => p.id === item.product_id);
        return eligibleCats.includes(product?.category_id);
      });

      if (eligibleItems.length > 0) {
        setShowLoyaltyPrompt(true);
        return;
      }
    }

    setProcessing(true);
    try {
      const result = await window.electronAPI.orders.create(orderData);
      if (result.success) {
        // Loyalty Stamp Logic
        if (loyaltyCard) {
          if (isRedeeming) {
            await window.electronAPI.loyalty.redeemReward(loyaltyCard.customer_id, result.id);
            toast.success('Reward Redeemed! ☕');
            setIsRedeeming(false);
          } else {
            const eligibleCats = JSON.parse(settings?.loyalty_eligible_categories || '[]');
            const coffeeItems = cart.filter(item => {
              const product = products.find(p => p.id === item.product_id);
              return eligibleCats.includes(product?.category_id);
            });

            if (coffeeItems.length > 0) {
              const stampsToAdd = coffeeItems.reduce((sum, item) => sum + item.quantity, 0);
              await window.electronAPI.loyalty.addStamps(loyaltyCard.customer_id, stampsToAdd, result.id);
              toast.success(`+${stampsToAdd} Stamps added!`);
            }
          }
        }

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
                const status = getProductStatus(product);
                
                return (
                  <button
                    key={product.id}
                    onClick={() => !status.disabled && handleAddToCart(product)}
                    disabled={status.disabled}
                    className={`pos-product-card text-left relative ${status.disabled ? 'opacity-40 cursor-not-allowed grayscale-[0.8]' : ''}`}
                  >
                    {/* Category color strip */}
                    <div
                      className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl opacity-60"
                      style={{ backgroundColor: product.category_color || '#e25a26' }}
                    />
                    {inCart && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-brand-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-lg">
                        {inCart.quantity}
                      </div>
                    )}
                    <div className="pt-1 flex flex-col h-full">
                      <p className="text-sm font-semibold text-white leading-tight truncate">{product.name}</p>
                      {product.sku && <p className="text-[10px] text-dark-400 mt-0.5">{product.sku}</p>}
                      <p className="text-xs text-dark-400 mt-1 truncate">{product.category_name}</p>
                      
                      <div className="mt-auto pt-2">
                        <p className="text-base font-bold text-brand-400">{fmt(product.price)}</p>
                        
                        {/* Smart Status Label */}
                        <div className={`text-[10px] mt-0.5 font-medium flex items-center gap-1 ${status.color}`}>
                           <span className={`w-1.5 h-1.5 rounded-full ${status.label === 'Available' ? 'bg-emerald-500 animate-pulse' : (status.label === 'Unavailable' ? 'bg-red-500' : 'bg-amber-500')}`} />
                           {status.label}
                        </div>
                      </div>
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
                    <p className="text-sm font-medium text-white truncate">
                      {item.product_name}
                      {item.variant_name && <span className="text-brand-400 ml-1">({item.variant_name})</span>}
                    </p>
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
          {/* Loyalty Status */}
          {loyaltyCard && (
            <div className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
              loyaltyCard.stamps >= loyaltyCard.reward_threshold 
                ? 'bg-amber-500/10 border-amber-500/30' 
                : 'bg-dark-700/50 border-white/5'
            }`}>
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                   loyaltyCard.stamps >= loyaltyCard.reward_threshold ? 'bg-amber-500 text-white' : 'bg-dark-600 text-dark-400'
                }`}>
                  <Coffee size={16} />
                </div>
                <div>
                  <p className="text-[10px] text-dark-400 font-bold uppercase tracking-wider">{loyaltyCard.customer_name}</p>
                  <p className="text-xs font-bold text-white">
                    {loyaltyCard.stamps} / {loyaltyCard.reward_threshold} Stamps
                  </p>
                </div>
              </div>
              
              {loyaltyCard.stamps >= loyaltyCard.reward_threshold ? (
                <button 
                  onClick={() => setIsRedeeming(!isRedeeming)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${
                    isRedeeming 
                      ? 'bg-green-500 text-white shadow-lg shadow-green-500/20' 
                      : 'bg-amber-500 hover:bg-amber-400 text-white shadow-lg shadow-amber-500/20'
                  }`}
                >
                  {isRedeeming ? 'Applied' : 'Redeem Free'}
                </button>
              ) : (
                <div className="text-[10px] text-dark-500 font-bold">
                  {loyaltyCard.reward_threshold - loyaltyCard.stamps} to go
                </div>
              )}
            </div>
          )}
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
            {getRedemptionDiscount() > 0 && (
              <div className="flex justify-between text-brand-400">
                <span>Loyalty Reward</span><span>- {fmt(getRedemptionDiscount())}</span>
              </div>
            )}
            <div className="flex justify-between text-white font-bold text-lg border-t border-dark-700/50 pt-2 mt-1">
              <span>Total</span><span className="text-brand-400">{fmt(currentTotal())}</span>
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

      {/* Loyalty Referral Prompt */}
      {showLoyaltyPrompt && (
        <LoyaltyPromptModal
          stampsToEarn={cart.reduce((sum, item) => {
            const product = products.find(p => p.id === item.product_id);
            const eligibleCats = JSON.parse(settings?.loyalty_eligible_categories || '[]');
            return sum + (eligibleCats.includes(product?.category_id) ? item.quantity : 0);
          }, 0)}
          onClose={() => setShowLoyaltyPrompt(false)}
          onCustomerSelected={async (c) => {
             setCustomer(c.id, c.name);
             const card = await window.electronAPI.loyalty.getCardByCustomerId(c.id);
             setLoyaltyCard(card);
             setShowLoyaltyPrompt(false);
          }}
          onContinueAsGuest={() => {
            setShowLoyaltyPrompt(false);
            setTimeout(() => handleCheckout(true), 100);
          }}
        />
      )}

      {/* Variant Selection Modal */}
      {variantModalProduct && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-fade-in">
          <div className="bg-dark-800 rounded-2xl w-full max-w-sm border border-dark-700/50 shadow-2xl overflow-hidden scale-in">
            <div className="px-5 py-4 border-b border-dark-700/50 flex items-center justify-between bg-dark-800/80">
              <div>
                <h3 className="text-lg font-bold text-white">{variantModalProduct.name}</h3>
                <p className="text-xs text-dark-400">Select a size/variant</p>
              </div>
              <button onClick={() => setVariantModalProduct(null)} className="text-dark-400 hover:text-white transition-colors bg-dark-700 p-1.5 rounded-lg">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-4 space-y-2">
              {variantModalProduct.variants?.map((v) => (
                <button
                  key={v.id}
                  onClick={() => handleAddToCart(variantModalProduct, v)}
                  className="w-full flex items-center justify-between p-4 bg-dark-700/50 hover:bg-brand-500/10 border border-dark-600/50 hover:border-brand-500/30 rounded-xl transition-all group"
                >
                  <span className="font-medium text-white group-hover:text-brand-300">
                    {v.name}
                  </span>
                  <span className="font-bold text-brand-400">{fmt(v.price)}</span>
                </button>
              ))}
            </div>
            <div className="p-4 pt-2 border-t border-dark-700/50">
               <button onClick={() => setVariantModalProduct(null)} className="btn-secondary w-full">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
