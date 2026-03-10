// ─── Core Entities ──────────────────────────────────────────────────────────

export interface User {
  id: number;
  username: string;
  full_name: string;
  email?: string;
  phone?: string;
  role_id: number;
  role_name: string;
  permissions: string[];
  is_active: number;
  last_login?: string;
  created_at: string;
}

export interface Category {
  id: number;
  name: string;
  description?: string;
  color: string;
  icon: string;
  sort_order: number;
  is_active: number;
  product_count?: number;
  created_at: string;
}

export interface Product {
  id: number;
  name: string;
  description?: string;
  sku?: string;
  category_id: number;
  category_name?: string;
  category_color?: string;
  price: number;
  cost_price: number;
  tax_rate: number;
  is_active: number;
  track_inventory: number;
  stock?: number;
  min_quantity?: number;
  unit?: string;
  has_recipe?: boolean;
  recipe_count?: number;
  created_at: string;
  variants?: ProductVariant[];
}

export interface ProductVariant {
  id: number;
  product_id: number;
  name: string;
  sku?: string;
  price: number;
  cost_price: number;
  is_active: number;
  created_at: string;
}

// ─── Ingredient & Recipe Types ────────────────────────────────────────────────

export interface Ingredient {
  id: number;
  name: string;
  unit: string;
  current_stock: number;
  reorder_level: number;
  cost_per_unit: number;
  supplier_id?: number;
  supplier_name?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface RecipeItem {
  id: number;
  product_id: number;
  product_name?: string;
  ingredient_id: number;
  ingredient_name?: string;
  ingredient_unit?: string;
  quantity: number;
  unit?: string;
  current_stock?: number;
  reorder_level?: number;
}

export interface Modifier {
  id: number;
  name: string;
  description?: string;
  is_required: number;
  allow_multiple: number;
  options: ModifierOption[];
}

export interface ModifierOption {
  id: number;
  modifier_id: number;
  name: string;
  price_adjustment: number;
}

// ─── Cart & POS Types ─────────────────────────────────────────────────────────

export interface SelectedModifier {
  modifier_id: number;
  modifier_name: string;
  option_id: number;
  option_name: string;
  price_adjustment: number;
}

export interface CartItem {
  product_id: number;
  variant_id?: number;
  product_name: string;
  variant_name?: string;
  unit_price: number;
  quantity: number;
  discount_percent: number;
  tax_rate: number;
  line_total: number;
  notes?: string;
  modifiers?: SelectedModifier[];
  modifier_option_ids?: number[];
  modifier_label?: string;
}

// ─── Order Types ──────────────────────────────────────────────────────────────

export interface Order {
  id: number;
  order_number: string;
  customer_id?: number;
  customer_name?: string;
  user_id: number;
  cashier_name?: string;
  status: 'pending' | 'completed' | 'voided' | 'refunded';
  subtotal: number;
  discount_type?: 'percent' | 'fixed';
  discount_value: number;
  discount_amount: number;
  tax_amount: number;
  total: number;
  payment_method: 'cash' | 'card' | 'online' | 'split';
  amount_paid: number;
  change_amount: number;
  notes?: string;
  void_reason?: string;
  item_count?: number;
  items?: OrderItem[];
  payments?: Payment[];
  created_at: string;
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  variant_id?: number;
  product_name: string;
  variant_name?: string;
  unit_price: number;
  quantity: number;
  discount_percent: number;
  tax_rate: number;
  line_total: number;
  notes?: string;
}

export interface Payment {
  id: number;
  order_id: number;
  method: 'cash' | 'card' | 'online';
  amount: number;
  reference?: string;
  created_at: string;
}

// ─── Inventory Types ──────────────────────────────────────────────────────────

export interface InventoryItem {
  id: number;
  product_id: number;
  product_name: string;
  sku?: string;
  category_name?: string;
  price: number;
  quantity: number;
  min_quantity: number;
  unit: string;
  supplier_name?: string;
  supplier_id?: number;
  last_restocked?: string;
}

export interface StockMovement {
  id: number;
  product_id: number;
  product_name?: string;
  type: 'in' | 'out' | 'adjustment' | 'waste' | 'return';
  quantity: number;
  before_qty: number;
  after_qty: number;
  reference?: string;
  notes?: string;
  user_name?: string;
  created_at: string;
}

export interface IngredientMovement {
  id: number;
  ingredient_id: number;
  ingredient_name?: string;
  unit?: string;
  type: 'purchase' | 'usage' | 'adjustment' | 'waste' | 'return';
  quantity: number;
  before_qty: number;
  after_qty: number;
  reference?: string;
  notes?: string;
  user_name?: string;
  created_at: string;
}

// ─── Other Entities ───────────────────────────────────────────────────────────

export interface Supplier {
  id: number;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  is_active: number;
  created_at: string;
}

export interface Customer {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  loyalty_points: number;
  total_spent: number;
  created_at: string;
}

export interface Expense {
  id: number;
  category: string;
  description: string;
  amount: number;
  date: string;
  payment_method: string;
  reference?: string;
  user_id?: number;
  user_name?: string;
  notes?: string;
  created_at: string;
}

export interface Settings {
  cafe_name: string;
  cafe_address: string;
  cafe_phone: string;
  cafe_email: string;
  currency: string;
  currency_symbol: string;
  tax_rate: string;
  receipt_footer: string;
  low_stock_threshold: string;
  auto_backup: string;
  backup_frequency_days: string;
  theme: string;
  receipt_print_on_sale: string;
  loyalty_reward_threshold: string;
  loyalty_eligible_categories: string;
  loyalty_eligible_products: string;
}

export interface LoyaltyCard {
  id: number;
  customer_id: number;
  loyalty_code: string;
  stamps: number;
  reward_threshold: number;
  customer_name?: string;
  customer_phone?: string;
  created_at: string;
}

export interface LoyaltyTransaction {
  id: number;
  customer_id: number;
  order_id?: number;
  stamps_added: number;
  reward_redeemed: number;
  created_at: string;
}

// ─── Dashboard & Reports ──────────────────────────────────────────────────────

export interface DashboardData {
  todaySales: { total: number; count: number };
  weeklySales: { total: number; count: number };
  monthlySales: { total: number; count: number };
  lowStock: { count: number };
  recentOrders: Order[];
  topProducts: { name: string; qty_sold: number; revenue: number }[];
}

export interface SalesTrendPoint {
  date: string;
  total: number;
  orders: number;
}

// ─── App Navigation ───────────────────────────────────────────────────────────

export type AppModule =
  | 'dashboard'
  | 'pos'
  | 'menu'
  | 'recipes'
  | 'inventory'
  | 'reports'
  | 'staff'
  | 'expenses'
  | 'customers'
  | 'settings'
  | 'backup';
