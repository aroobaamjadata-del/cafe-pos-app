import { create } from 'zustand';
import { CartItem } from '../types';

interface POSState {
  cart: CartItem[];
  customerId: number | null;
  customerName: string;
  discountType: 'percent' | 'fixed' | null;
  discountValue: number;
  notes: string;
  paymentMethod: 'cash' | 'card' | 'online' | 'split';
  amountPaid: number;

  // Cart Actions
  addToCart: (item: CartItem) => void;
  removeFromCart: (productId: number) => void;
  updateQuantity: (productId: number, qty: number) => void;
  updateItemDiscount: (productId: number, discountPercent: number) => void;
  clearCart: () => void;

  // Order settings
  setCustomer: (id: number | null, name: string) => void;
  setDiscount: (type: 'percent' | 'fixed' | null, value: number) => void;
  setNotes: (notes: string) => void;
  setPaymentMethod: (method: 'cash' | 'card' | 'online' | 'split') => void;
  setAmountPaid: (amount: number) => void;

  // Computed
  subtotal: () => number;
  discountAmount: () => number;
  taxAmount: () => number;
  total: () => number;
  changeAmount: () => number;
}

export const usePOSStore = create<POSState>((set, get) => ({
  cart: [],
  customerId: null,
  customerName: '',
  discountType: null,
  discountValue: 0,
  notes: '',
  paymentMethod: 'cash',
  amountPaid: 0,

  addToCart: (item) =>
    set((state) => {
      const existing = state.cart.find(i => i.product_id === item.product_id);
      if (existing) {
        return {
          cart: state.cart.map(i =>
            i.product_id === item.product_id
              ? { ...i, quantity: i.quantity + 1, line_total: (i.quantity + 1) * i.unit_price * (1 - i.discount_percent / 100) }
              : i
          ),
        };
      }
      return { cart: [...state.cart, item] };
    }),

  removeFromCart: (productId) =>
    set((state) => ({ cart: state.cart.filter(i => i.product_id !== productId) })),

  updateQuantity: (productId, qty) =>
    set((state) => ({
      cart: qty <= 0
        ? state.cart.filter(i => i.product_id !== productId)
        : state.cart.map(i =>
            i.product_id === productId
              ? { ...i, quantity: qty, line_total: qty * i.unit_price * (1 - i.discount_percent / 100) }
              : i
          ),
    })),

  updateItemDiscount: (productId, discountPercent) =>
    set((state) => ({
      cart: state.cart.map(i =>
        i.product_id === productId
          ? { ...i, discount_percent: discountPercent, line_total: i.quantity * i.unit_price * (1 - discountPercent / 100) }
          : i
      ),
    })),

  clearCart: () =>
    set({
      cart: [],
      customerId: null,
      customerName: '',
      discountType: null,
      discountValue: 0,
      notes: '',
      paymentMethod: 'cash',
      amountPaid: 0,
    }),

  setCustomer: (id, name) => set({ customerId: id, customerName: name }),
  setDiscount: (type, value) => set({ discountType: type, discountValue: value }),
  setNotes: (notes) => set({ notes }),
  setPaymentMethod: (method) => set({ paymentMethod: method }),
  setAmountPaid: (amount) => set({ amountPaid: amount }),

  subtotal: () => get().cart.reduce((sum, i) => sum + i.line_total, 0),

  discountAmount: () => {
    const { discountType, discountValue } = get();
    const subtotal = get().subtotal();
    if (discountType === 'percent') return (subtotal * discountValue) / 100;
    if (discountType === 'fixed') return Math.min(discountValue, subtotal);
    return 0;
  },

  taxAmount: () => {
    const subtotal = get().subtotal() - get().discountAmount();
    const avgTax = get().cart.reduce((sum, i) => sum + i.tax_rate, 0) / Math.max(get().cart.length, 1);
    return (subtotal * avgTax) / 100;
  },

  total: () => {
    const subtotal = get().subtotal();
    const discount = get().discountAmount();
    const tax = get().taxAmount();
    return Math.max(0, subtotal - discount + tax);
  },

  changeAmount: () => {
    return Math.max(0, get().amountPaid - get().total());
  },
}));
