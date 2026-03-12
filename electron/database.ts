import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { enqueueSyncOperation, getCachedTenant, cacheTenantLocal, cacheDeviceLocal, getCachedDevice } from './sqliteDatabase';

const ENCRYPTION_KEY = crypto.scryptSync('cloud-n-cream-super-secure-key', 'salt', 32);
const IV_LENGTH = 16;

function encryptText(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptText(text: string): string | null {
  try {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  } catch (e) {
    return null;
  }
}

const DB_DIR = path.join(app.getPath('userData'), 'data');
const DB_PATH = path.join(DB_DIR, 'pos.db');

export class DatabaseService {
  private db!: Database.Database;
  public auth!: AuthService;
  public users!: UsersService;
  public categories!: CategoriesService;
  public products!: ProductsService;
  public orders!: OrdersService;
  public inventory!: InventoryService;
  public ingredients!: IngredientsService;
  public recipes!: RecipesService;
  public modifiers!: ModifiersService;
  public suppliers!: SuppliersService;
  public customers!: CustomersService;
  public expenses!: ExpensesService;
  public reports!: ReportsService;
  public settings!: SettingsService;
  public license!: LicenseService;
  public loyalty!: LoyaltyService;
  public roles!: RolesService;

  initialize(): void {
    console.log('[DATABASE] User Data Path:', app.getPath('userData'));
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    // MIGRATIONS - Ensure multi-tenant columns exist for upgrade scenarios
    const tables = [
      'roles', 'users', 'categories', 'suppliers', 'products', 'product_variants',
      'inventory', 'stock_movements', 'customers', 'orders', 'order_items',
      'payments', 'expenses', 'ingredients', 'recipes', 'modifiers',
      'modifier_options', 'product_modifiers', 'ingredient_movements',
      'loyalty_cards', 'loyalty_transactions', 'settings'
    ];
    for (const t of tables) {
      try { this.db.exec(`ALTER TABLE ${t} ADD COLUMN tenant_id TEXT`); } catch(e) {}
    }

    try { this.db.exec('ALTER TABLE orders ADD COLUMN loyalty_redeemed INTEGER DEFAULT 0'); } catch(e){}
    try { this.db.exec('ALTER TABLE orders ADD COLUMN loyalty_discount_amount REAL DEFAULT 0'); } catch(e){}
    try { this.db.exec('ALTER TABLE orders ADD COLUMN customer_id INTEGER REFERENCES customers(id)'); } catch(e){}
    try { this.db.exec('ALTER TABLE products ADD COLUMN track_inventory INTEGER DEFAULT 1'); } catch(e){}
    try { this.db.exec('ALTER TABLE ingredients ADD COLUMN deleted_at DATETIME'); } catch(e){}
    
    this.createSchema();
    
    // ─── ROBUST MIGRATIONS SYSTEM ───
    const migrateColumn = (table: string, column: string, type: string) => {
      try {
        const info = this.db.prepare(`PRAGMA table_info(${table})`).all() as any[];
        if (!info.some(c => c.name === column)) {
          this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
          console.log(`[MIGRATE] Added ${column} to ${table}`);
        }
      } catch (err) {
        console.error(`[MIGRATE] Error adding ${column} to ${table}:`, err);
      }
    };

    const cloudTables = [
      'customers', 'loyalty_cards', 'loyalty_transactions', 'users', 'products', 
      'categories', 'suppliers', 'orders', 'expenses', 'order_items', 'payments',
      'ingredients', 'inventory', 'stock_movements', 'ingredient_movements', 
      'product_variants', 'product_modifiers', 'recipes', 'modifiers', 'modifier_options'
    ];
    
    for (const t of cloudTables) {
      migrateColumn(t, 'cloud_id', 'TEXT');
      try { this.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${t}_cloud_id ON ${t}(cloud_id)`); } catch(e){}
    }

    migrateColumn('order_items', 'variant_id', 'INTEGER');
    migrateColumn('order_items', 'variant_name', 'TEXT');
    migrateColumn('products', 'track_inventory', 'INTEGER DEFAULT 1');
    migrateColumn('ingredients', 'deleted_at', 'DATETIME');
    migrateColumn('inventory', 'min_quantity', 'REAL DEFAULT 5');
    migrateColumn('inventory', 'unit', 'TEXT DEFAULT \'pcs\'');
    migrateColumn('orders', 'loyalty_redeemed', 'INTEGER DEFAULT 0');
    migrateColumn('orders', 'loyalty_discount_amount', 'REAL DEFAULT 0');
    migrateColumn('orders', 'void_reason', 'TEXT');
    migrateColumn('orders', 'void_at', 'DATETIME');
    migrateColumn('orders', 'receipt_printed', 'INTEGER DEFAULT 0');
    migrateColumn('suppliers', 'is_active', 'INTEGER DEFAULT 1');
    migrateColumn('categories', 'sort_order', 'INTEGER DEFAULT 0');
    try { this.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_tenant_name ON categories(tenant_id, name)`); } catch(e){}
    try { this.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_tenant_name ON suppliers(tenant_id, name)`); } catch(e){}
    migrateColumn('users', 'tenant_id', 'TEXT'); 
    migrateColumn('users', 'cloud_id', 'TEXT'); 
    try { this.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_cloud_id ON users(cloud_id)`); } catch(e){}

    // Diagnostic Log
    try {
      const tables = ['products', 'categories', 'orders', 'ingredients', 'inventory', 'customers'];
      const stats: any = {};
      for (const t of tables) {
        const row = this.db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get() as any;
        stats[t] = row?.c;
      }
      console.log('[DIAGNOSTIC] Table counts:', JSON.stringify(stats));
    } catch(e) { console.error('[DIAGNOSTIC] Failed to get stats:', e); }

    // Backfill: If we have an active tenant, ensure all local records are tagged with their tenant_id
    // This fixes issues where data was created before the multi-tenant migration
    const activeTenant = getCachedTenant();
    if (activeTenant?.tenant_id) {
      console.log(`[STARTUP] Active Tenant detected: ${activeTenant.tenant_name} (${activeTenant.tenant_id})`);
      const allTables = [
        'roles', 'users', 'categories', 'suppliers', 'products', 'product_variants',
        'inventory', 'stock_movements', 'customers', 'orders', 'order_items',
        'payments', 'expenses', 'ingredients', 'recipes', 'modifiers',
        'modifier_options', 'product_modifiers', 'ingredient_movements',
        'loyalty_cards', 'loyalty_transactions', 'settings'
      ];
      for (const t of allTables) {
        try {
          // Tag NULLs, empty strings, 'null', 'undefined', or 'Cloud n Cream' (legacy name)
          const legacyIds = ['null', 'undefined', 'Cloud n Cream', 'undefined-id'];
          const placeHolders = legacyIds.map(() => '?').join(',');
          
          let res = this.db.prepare(`
            UPDATE ${t} SET tenant_id = ? 
            WHERE tenant_id IS NULL 
               OR tenant_id = '' 
               OR LOWER(tenant_id) IN (${placeHolders})
          `).run(activeTenant.tenant_id, ...legacyIds.map(id => id.toLowerCase()));
          
          if (res.changes > 0) console.log(`[BACKFILL] Tagged ${res.changes} legacy/empty records in ${t} with ${activeTenant.tenant_id}`);
          
          // Emergency: If table has data but ZERO match current tenant AND we only have records with NO dashes (non-UUID),
          // it means they are legacy records that didn't get caught above.
          const total = this.db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get() as any;
          const matched = this.db.prepare(`SELECT COUNT(*) as c FROM ${t} WHERE tenant_id = ?`).get(activeTenant.tenant_id) as any;
          
          if (total.c > 0 && matched.c === 0) {
             console.log(`[BACKFILL] Emergency: Table ${t} has ${total.c} records but 0 match tenant. Force tagging all.`);
             const res2 = this.db.prepare(`UPDATE ${t} SET tenant_id = ?`).run(activeTenant.tenant_id);
             if (res2.changes > 0) console.log(`[BACKFILL] Force-tagged ${res2.changes} records in ${t}`);
          }
        } catch(e: any) {
          console.error(`[BACKFILL] Failed for ${t}:`, e.message);
        }
      }
    } else {
      console.log('[STARTUP] No active tenant detected in cache.');
    }

    // DEBUG: Log raw data state
    try {
      const sample = this.db.prepare('SELECT id, name, tenant_id FROM categories LIMIT 3').all();
      console.log('[DEBUG] Category Samples:', JSON.stringify(sample));
    } catch(e) {}

    // Schema Fix for variant support in order_items
    try { this.db.exec('ALTER TABLE order_items ADD COLUMN variant_id INTEGER REFERENCES product_variants(id)'); } catch(e) {}
    try { this.db.exec('ALTER TABLE order_items ADD COLUMN variant_name TEXT'); } catch(e) {}

    this.seedDefaults();
    this.initServices();
  }

  getDb(): Database.Database { return this.db; }
  getDbPath(): string { return DB_PATH; }

  private initServices(): void {
    this.auth = new AuthService(this.db);
    this.users = new UsersService(this.db);
    this.categories = new CategoriesService(this.db);
    this.products = new ProductsService(this.db);
    this.ingredients = new IngredientsService(this.db);
    this.recipes = new RecipesService(this.db);
    this.modifiers = new ModifiersService(this.db);
    this.orders = new OrdersService(this.db);
    this.inventory = new InventoryService(this.db);
    this.suppliers = new SuppliersService(this.db);
    this.customers = new CustomersService(this.db);
    this.expenses = new ExpensesService(this.db);
    this.reports = new ReportsService(this.db);
    this.settings = new SettingsService(this.db);
    this.license = new LicenseService(this.db);
    this.roles = new RolesService(this.db);
    this.loyalty = new LoyaltyService(this.db);
  }

  public logAppError(level: string, module: string, message: string, context?: any): void {
    const tenant = getCachedTenant();
    const device = getCachedDevice();
    this.db.prepare(`
      INSERT INTO app_logs (tenant_id, device_id, level, module, message, context)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(tenant?.tenant_id || null, device?.device_id || null, level, module, message, context ? JSON.stringify(context) : null);
  }

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT, -- Optional for system roles, required for custom
        name TEXT NOT NULL,
        permissions TEXT NOT NULL DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, name)
      );

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        role_id INTEGER REFERENCES roles(id),
        is_active INTEGER NOT NULL DEFAULT 1,
        last_login DATETIME,
        cloud_id TEXT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        UNIQUE(tenant_id, username)
      );

      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#3b82f6',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        contact_person TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        notes TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        sku TEXT,
        category_id INTEGER REFERENCES categories(id),
        price REAL NOT NULL DEFAULT 0,
        cost_price REAL DEFAULT 0,
        tax_rate REAL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        track_inventory INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        UNIQUE(tenant_id, sku)
      );

      CREATE TABLE IF NOT EXISTS product_variants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        product_id INTEGER NOT NULL REFERENCES products(id),
        name TEXT NOT NULL,
        sku TEXT,
        price REAL NOT NULL,
        cost_price REAL DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        UNIQUE(tenant_id, sku)
      );

      CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        product_id INTEGER NOT NULL REFERENCES products(id),
        quantity REAL NOT NULL DEFAULT 0,
        min_quantity REAL DEFAULT 5,
        unit TEXT DEFAULT 'pcs',
        supplier_id INTEGER REFERENCES suppliers(id),
        last_restocked DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, product_id)
      );

      CREATE TABLE IF NOT EXISTS stock_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        product_id INTEGER NOT NULL REFERENCES products(id),
        type TEXT NOT NULL CHECK(type IN ('in','out','adjustment','waste','return')),
        quantity REAL NOT NULL,
        before_qty REAL NOT NULL,
        after_qty REAL NOT NULL,
        reference TEXT,
        notes TEXT,
        user_id INTEGER REFERENCES users(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        address TEXT,
        loyalty_points INTEGER DEFAULT 0,
        total_spent REAL DEFAULT 0,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        UNIQUE(tenant_id, phone)
      );

      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        order_number TEXT NOT NULL,
        customer_id INTEGER REFERENCES customers(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        status TEXT NOT NULL DEFAULT 'completed',
        subtotal REAL NOT NULL DEFAULT 0,
        discount_type TEXT,
        discount_value REAL DEFAULT 0,
        discount_amount REAL DEFAULT 0,
        tax_amount REAL DEFAULT 0,
        total REAL NOT NULL DEFAULT 0,
        payment_method TEXT NOT NULL DEFAULT 'cash',
        amount_paid REAL DEFAULT 0,
        change_amount REAL DEFAULT 0,
        notes TEXT,
        void_reason TEXT,
        void_at DATETIME,
        receipt_printed INTEGER DEFAULT 0,
        loyalty_redeemed INTEGER DEFAULT 0,
        loyalty_discount_amount REAL DEFAULT 0,
        cloud_id TEXT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, order_number)
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        variant_id INTEGER REFERENCES product_variants(id),
        product_name TEXT NOT NULL,
        variant_name TEXT,
        unit_price REAL NOT NULL,
        quantity REAL NOT NULL,
        discount_percent REAL DEFAULT 0,
        tax_rate REAL DEFAULT 0,
        line_total REAL NOT NULL,
        notes TEXT,
        cloud_id TEXT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        method TEXT NOT NULL,
        amount REAL NOT NULL,
        reference TEXT,
        cloud_id TEXT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        date DATE NOT NULL,
        payment_method TEXT DEFAULT 'cash',
        reference TEXT,
        user_id INTEGER REFERENCES users(id),
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS settings (
        tenant_id TEXT,
        key TEXT NOT NULL,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(tenant_id, key)
      );

      -- ── Recipe & Ingredient System ─────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS ingredients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        unit TEXT NOT NULL DEFAULT 'g',
        current_stock REAL NOT NULL DEFAULT 0,
        reorder_level REAL NOT NULL DEFAULT 100,
        cost_per_unit REAL DEFAULT 0,
        supplier_id INTEGER REFERENCES suppliers(id),
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS recipes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
        quantity REAL NOT NULL,
        unit TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, product_id, ingredient_id)
      );

      CREATE TABLE IF NOT EXISTS modifiers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT DEFAULT 'optional',
        min_selection INTEGER DEFAULT 0,
        max_selection INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS modifier_options (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        modifier_id INTEGER NOT NULL REFERENCES modifiers(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        price REAL DEFAULT 0,
        cost_price REAL DEFAULT 0,
        price_adjustment REAL DEFAULT 0,
        is_default INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS product_modifiers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        modifier_id INTEGER NOT NULL REFERENCES modifiers(id) ON DELETE CASCADE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, product_id, modifier_id)
      );

      CREATE TABLE IF NOT EXISTS recipe_modifier_adjustments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        modifier_option_id INTEGER NOT NULL REFERENCES modifier_options(id) ON DELETE CASCADE,
        ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
        quantity_adjustment REAL NOT NULL DEFAULT 0,
        UNIQUE(modifier_option_id, ingredient_id)
      );

      CREATE TABLE IF NOT EXISTS ingredient_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
        type TEXT NOT NULL CHECK(type IN ('purchase','usage','adjustment','waste','return')),
        quantity REAL NOT NULL,
        before_qty REAL NOT NULL,
        after_qty REAL NOT NULL,
        reference TEXT,
        notes TEXT,
        user_id INTEGER REFERENCES users(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
      CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active, deleted_at);
      CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(created_at);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
      CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);
      CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);
      CREATE INDEX IF NOT EXISTS idx_recipes_product ON recipes(product_id);
      CREATE INDEX IF NOT EXISTS idx_recipes_ingredient ON recipes(ingredient_id);
      CREATE INDEX IF NOT EXISTS idx_ingredient_movements ON ingredient_movements(ingredient_id);

      -- ─── Supabase Sync Cache Infrastructure ──────────────────────────────────────────────

      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS app_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT,
        device_id TEXT,
        level TEXT DEFAULT 'error',
        module TEXT,
        message TEXT,
        context TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS license_cache (
        id INTEGER PRIMARY KEY DEFAULT 1,
        license_key_hash TEXT NOT NULL,
        license_id TEXT,
        status TEXT NOT NULL DEFAULT 'unknown',
        expires_at TEXT,
        features TEXT,
        tenant_id TEXT,
        last_validated_at TEXT,
        encrypted_payload TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tenant_cache (
        id INTEGER PRIMARY KEY DEFAULT 1,
        tenant_id TEXT NOT NULL,
        business_name TEXT,
        tenant_code TEXT,
        status TEXT NOT NULL DEFAULT 'unknown',
        subscription_plan TEXT,
        last_synced_at TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS pos_devices_local (
        id INTEGER PRIMARY KEY DEFAULT 1,
        hardware_id TEXT NOT NULL UNIQUE,
        device_name TEXT,
        status TEXT DEFAULT 'online',
        last_seen_at TEXT,
        registered_at TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ── Loyalty System ──────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS loyalty_cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        customer_id INTEGER NOT NULL UNIQUE REFERENCES customers(id),
        loyalty_code TEXT NOT NULL UNIQUE,
        stamps INTEGER DEFAULT 0,
        points_balance INTEGER DEFAULT 0,
        reward_threshold INTEGER DEFAULT 10,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS loyalty_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        customer_id INTEGER REFERENCES customers(id),
        order_id INTEGER REFERENCES orders(id),
        stamps_added INTEGER DEFAULT 0,
        reward_redeemed INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_tenant ON inventory(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_ingredients_tenant ON ingredients(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_loyalty_tenant ON loyalty_cards(tenant_id);
    `);
  }

  private seedDefaults(): void {
    // Roles - Always ensure the 3 system roles exist with stable integer IDs
    const adminPerms = JSON.stringify(['*']);
    const managerPerms = JSON.stringify(['dashboard','pos','menu','recipes','inventory','reports','customers','expenses','staff','backup']);
    const cashierPerms = JSON.stringify(['pos','dashboard','customers']);
    this.db.prepare(`INSERT OR IGNORE INTO roles (id, name, permissions) VALUES (1, 'Admin', ?)`).run(adminPerms);
    this.db.prepare(`INSERT OR IGNORE INTO roles (id, name, permissions) VALUES (2, 'Manager', ?)`).run(managerPerms);
    this.db.prepare(`INSERT OR IGNORE INTO roles (id, name, permissions) VALUES (3, 'Cashier', ?)`).run(cashierPerms);

    // Default admin user - REMOVED (Handled via Owner Activation logic)

    // Default categories & products - REMOVED for clean slate

    // Default settings
    const settingsExist = this.db.prepare('SELECT COUNT(*) as c FROM settings').get() as any;
    if (settingsExist.c === 0) {
      const defaults = [
        ['cafe_name', 'Cloud n Cream'],
        ['cafe_address', '123 Main Street, City'],
        ['cafe_phone', '+92-XXX-XXXXXXX'],
        ['cafe_email', 'info@cloudncream.com'],
        ['currency', 'Rs.'],
        ['currency_symbol', '₨'],
        ['tax_rate', '0'],
        ['receipt_footer', 'Thank you for visiting Cloud n Cream!'],
        ['low_stock_threshold', '10'],
        ['auto_backup', '1'],
        ['backup_frequency_days', '1'],
        ['theme', 'dark'],
        ['receipt_print_on_sale', '1'],
        ['loyalty_reward_threshold', '10'],
        ['loyalty_eligible_categories', '[]'],
        ['loyalty_eligible_products', '[]'],
      ];
      for (const [key, value] of defaults) {
        this.db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?,?)').run(key, value);
      }
    }

    // Default ingredients, recipes, and modifiers - REMOVED for clean slate
  }
}

// ─── Auth Service ──────────────────────────────────────────────────────────────
class AuthService {
  constructor(private db: Database.Database) {}

  login(username: string, password: string): any {
    const tenant = getCachedTenant();
    if (!tenant) return { success: false, message: 'Terminal not activated' };

    const user = this.db.prepare(`
      SELECT u.*, r.name as role_name, r.permissions
      FROM users u LEFT JOIN roles r ON u.role_id = r.id
      WHERE (LOWER(u.username) = LOWER(?) OR LOWER(u.email) = LOWER(?)) 
        AND u.tenant_id = ? 
        AND u.is_active = 1 
        AND u.deleted_at IS NULL
    `).get(username, username, tenant.tenant_id) as any;

    if (!user) return { success: false, message: 'Invalid credentials' };
    if (!user.password_hash || user.password_hash === '') {
      return { success: false, message: 'needs_setup' };
    }
    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) return { success: false, message: 'Invalid credentials' };

    // Fill in defaults if role lookup failed
    const roleName = user.role_name || 'Admin';
    const permissions = user.permissions ? JSON.parse(user.permissions) : ['*'];

    this.db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
    const { password_hash, ...safeUser } = user;
    return { success: true, user: { ...safeUser, role_name: roleName, permissions } };
  }

  logout(): { success: boolean } { return { success: true }; }
}

// ─── Roles Service ─────────────────────────────────────────────────────────────
// ─── Roles Service ─────────────────────────────────────────────────────────────
class RolesService {
  constructor(private db: Database.Database) {}

  getAll(): any[] {
    const tenant = getCachedTenant();
    // Return global roles (tenant_id is null) OR roles for the specific tenant
    return this.db.prepare('SELECT * FROM roles WHERE tenant_id IS NULL OR tenant_id = ?').all(tenant?.tenant_id || '-1');
  }

  syncDown(payload: any[]): void {
     const stmt = this.db.prepare(`
       INSERT OR REPLACE INTO roles (id, tenant_id, name, permissions, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
     `);
     const trans = this.db.transaction((items) => {
       for (const r of items) {
         stmt.run(r.id, r.tenant_id || null, r.name, typeof r.permissions === 'string' ? r.permissions : JSON.stringify(r.permissions), r.created_at, r.updated_at);
       }
     });
     trans(payload);
  }
}

// ─── Users Service ─────────────────────────────────────────────────────────────
class UsersService {
  constructor(private db: Database.Database) {}

  getAll(): any[] {
    const tenant = getCachedTenant();
    if (!tenant) return [];
    try {
      return this.db.prepare(`
        SELECT u.id, u.username, u.full_name, u.email, u.phone, u.tenant_id,
               u.role_id, r.name as role_name, u.is_active, u.last_login, u.created_at
        FROM users u LEFT JOIN roles r ON u.role_id = r.id
        WHERE u.deleted_at IS NULL AND LOWER(u.tenant_id) = LOWER(?)
        ORDER BY u.full_name
      `).all(tenant.tenant_id);
    } catch (err) {
      console.error('[USERS] getAll failed:', err);
      return [];
    }
  }

  getById(id: number): any {
    const tenant = getCachedTenant();
    if (!tenant) return null;
    return this.db.prepare('SELECT * FROM users WHERE id = ? AND tenant_id = ?').get(id, tenant.tenant_id);
  }

  getByEmail(email: string): any {
    const tenant = getCachedTenant();
    if (!tenant) return null;
    return this.db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND tenant_id = ? AND deleted_at IS NULL').get(email, tenant.tenant_id);
  }

  create(data: any): any {
    const tenant = getCachedTenant();
    if (!tenant) return { success: false, message: 'Terminal not activated' };

    const hash = bcrypt.hashSync(data.password, 10);
    const result = this.db.prepare(`
      INSERT INTO users (tenant_id, username, password_hash, full_name, email, phone, role_id, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(tenant.tenant_id, data.username, hash, data.full_name, data.email || null, data.phone || null, data.role_id, data.is_active ? 1 : 0);
    
    try {
      const fullRow = this.db.prepare('SELECT * FROM users WHERE id=?').get(result.lastInsertRowid);
      enqueueSyncOperation('staff', 'INSERT', fullRow);
    } catch(err) { console.error('Staff sync error:', err); }

    return { success: true, id: result.lastInsertRowid };
  }

  update(id: number, data: any): any {
    this.db.prepare(`
      UPDATE users SET full_name=?, email=?, phone=?, role_id=?, is_active=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(data.full_name, data.email || null, data.phone || null, data.role_id, data.is_active ? 1 : 0, id);
    
    try {
      const fullRow = this.db.prepare('SELECT * FROM users WHERE id=?').get(id);
      enqueueSyncOperation('staff', 'UPDATE', fullRow);
    } catch(err) { console.error('Staff sync error:', err); }

    return { success: true };
  }

  delete(id: number): any {
    this.db.prepare('UPDATE users SET deleted_at=CURRENT_TIMESTAMP WHERE id=?').run(id);

    try {
      const fullRow = this.db.prepare('SELECT * FROM users WHERE id=?').get(id);
      enqueueSyncOperation('staff', 'UPDATE', fullRow); // Soft delete is an update
    } catch(err) { console.error('Staff sync error:', err); }

    return { success: true };
  }

  changePassword(id: number, newPassword: string): any {
    const hash = bcrypt.hashSync(newPassword, 10);
    this.db.prepare('UPDATE users SET password_hash=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(hash, id);

    try {
      const fullRow = this.db.prepare('SELECT * FROM users WHERE id=?').get(id);
      enqueueSyncOperation('staff', 'UPDATE', fullRow);
    } catch(err) { console.error('Staff sync error:', err); }

    return { success: true };
  }

  syncDown(payload: any[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO users (tenant_id, username, password_hash, full_name, email, phone, role_id, is_active, last_login, cloud_id, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, username) DO UPDATE SET
        cloud_id = excluded.cloud_id,
        password_hash = excluded.password_hash,
        full_name = excluded.full_name,
        email = excluded.email,
        role_id = excluded.role_id,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
    `);
    const trans = this.db.transaction((items) => {
      for (const u of items) {
        stmt.run(u.tenant_id, u.username, u.password_hash, u.full_name, u.email || null, u.phone || null, u.role_id, u.is_active ? 1 : 0, u.last_login, u.id, u.created_at, u.updated_at, u.deleted_at);
      }
    });
    trans(payload);
  }
}

// ─── Categories Service ────────────────────────────────────────────────────────
class CategoriesService {
  constructor(private db: Database.Database) {}

  getAll(): any[] {
    const tenant = getCachedTenant();
    if (!tenant) {
      console.log('[CATEGORIES] No active tenant found in cache.');
      return [];
    }
    const cats = this.db.prepare(`
      SELECT c.*, COUNT(p.id) as product_count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id AND p.deleted_at IS NULL
      WHERE LOWER(c.tenant_id) = LOWER(?) AND c.deleted_at IS NULL
      GROUP BY c.id ORDER BY c.sort_order, c.name
    `).all(tenant.tenant_id);

    if (cats.length === 0) {
      console.log('[CATEGORIES] Zero categories found for this tenant after case-insensitive check.');
    }

    console.log(`[CATEGORIES] Found ${cats.length} categories for tenant: ${tenant.tenant_id}`);
    return cats;
  }

  getById(id: number): any {
    const tenant = getCachedTenant();
    if (!tenant) return null;
    return this.db.prepare('SELECT * FROM categories WHERE id = ? AND tenant_id = ?').get(id, tenant.tenant_id);
  }

  resolveLocalIdByCloudId(cloudId: string): number | null {
    if (!cloudId) return null;
    const row = this.db.prepare('SELECT id FROM categories WHERE cloud_id = ?').get(cloudId) as any;
    return row ? row.id : null;
  }

  create(data: any): any {
    const tenant = getCachedTenant();
    if (!tenant) return { success: false, message: 'Terminal not activated' };

    const result = this.db.prepare(`
      INSERT INTO categories (tenant_id, name, description, color, icon, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(tenant.tenant_id, data.name, data.description || null, data.color, data.icon, data.sort_order || 0, data.is_active ? 1 : 0);
    
    try {
      const fullRow = this.db.prepare('SELECT * FROM categories WHERE id=?').get(result.lastInsertRowid);
      enqueueSyncOperation('categories', 'INSERT', fullRow);
    } catch (err) { console.error('Category sync error:', err); }

    return { success: true, id: result.lastInsertRowid };
  }

  update(id: number, data: any): any {
    this.db.prepare(`
      UPDATE categories SET name=?, description=?, color=?, icon=?, sort_order=?, is_active=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(data.name, data.description || null, data.color, data.icon, data.sort_order || 0, data.is_active ? 1 : 0, id);

    try {
      const fullRow = this.db.prepare('SELECT * FROM categories WHERE id=?').get(id);
      enqueueSyncOperation('categories', 'UPDATE', fullRow);
    } catch (err) { console.error('Category sync error:', err); }

    return { success: true };
  }

  delete(id: number): any {
    this.db.prepare('UPDATE categories SET deleted_at=CURRENT_TIMESTAMP WHERE id=?').run(id);
    
    try {
      const fullRow = this.db.prepare('SELECT * FROM categories WHERE id=?').get(id);
      enqueueSyncOperation('categories', 'UPDATE', fullRow);
    } catch (err) { console.error('Category sync error:', err); }

    return { success: true };
  }

  syncDown(payload: any[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO categories (tenant_id, name, description, color, icon, sort_order, is_active, cloud_id, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, name) DO UPDATE SET
        cloud_id = excluded.cloud_id,
        description = excluded.description,
        color = excluded.color,
        icon = excluded.icon,
        sort_order = excluded.sort_order,
        is_active = excluded.is_active,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
    `);
    this.db.transaction((items) => {
      for (const item of items) {
        stmt.run(item.tenant_id, item.name, item.description || null, item.color || '#e25a26', item.icon || 'coffee', item.sort_order || 0, item.is_active ? 1 : 0, item.id, item.created_at, item.updated_at, item.deleted_at);
      }
    })(payload);
  }
}

// ─── Products Service ──────────────────────────────────────────────────────────
class ProductsService {
  constructor(private db: Database.Database) {}

  getAll(): any[] {
    const tenant = getCachedTenant();
    if (!tenant) {
      console.log('[PRODUCTS] No active tenant found in cache.');
      return [];
    }

    const products = this.db.prepare(`
      SELECT p.*, c.name as category_name, c.color as category_color,
             i.quantity as stock, i.min_quantity, i.unit
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN inventory i ON i.product_id = p.id
      WHERE LOWER(p.tenant_id) = LOWER(?) AND p.deleted_at IS NULL
      ORDER BY c.sort_order, p.name
    `).all(tenant.tenant_id);

    console.log(`[PRODUCTS] Found ${products.length} products for tenant: ${tenant.tenant_id}`);

    const variants = this.db.prepare('SELECT * FROM product_variants WHERE tenant_id = ? AND deleted_at IS NULL').all(tenant.tenant_id) as any[];
    for (const p of products as any[]) {
      p.variants = variants.filter(v => v.product_id === p.id);
    }
    return products;
  }

  getByCategory(categoryId: number): any[] {
    const tenant = getCachedTenant();
    if (!tenant) return [];

    const products = this.db.prepare(`
      SELECT p.*, c.name as category_name, i.quantity as stock, i.min_quantity, i.unit
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN inventory i ON i.product_id = p.id
      WHERE p.tenant_id = ? AND p.category_id = ? AND p.is_active = 1 AND p.deleted_at IS NULL
      ORDER BY p.name
    `).all(tenant.tenant_id, categoryId);

    const variants = this.db.prepare('SELECT * FROM product_variants WHERE tenant_id = ? AND deleted_at IS NULL AND is_active = 1').all(tenant.tenant_id) as any[];
    for (const p of products as any[]) {
      p.variants = variants.filter(v => v.product_id === p.id);
    }
    return products;
  }

  search(query: string): any[] {
    const tenant = getCachedTenant();
    if (!tenant) return [];

    const q = `%${query}%`;
    const products = this.db.prepare(`
      SELECT p.*, c.name as category_name, i.quantity as stock
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN inventory i ON i.product_id = p.id
      WHERE p.tenant_id = ? AND (p.name LIKE ? OR p.sku LIKE ? OR p.description LIKE ?)
        AND p.is_active = 1 AND p.deleted_at IS NULL
      LIMIT 20
    `).all(tenant.tenant_id, q, q, q);

    const variants = this.db.prepare('SELECT * FROM product_variants WHERE tenant_id = ? AND deleted_at IS NULL AND is_active = 1').all(tenant.tenant_id) as any[];
    for (const p of products as any[]) {
      p.variants = variants.filter(v => v.product_id === p.id);
    }
    return products;
  }

  getById(id: number): any {
    const tenant = getCachedTenant();
    if (!tenant) return null;
    return this.db.prepare('SELECT * FROM products WHERE id=? AND tenant_id=?').get(id, tenant.tenant_id);
  }

  resolveLocalIdByCloudId(cloudId: string): number | null {
    if (!cloudId) return null;
    const row = this.db.prepare('SELECT id FROM products WHERE cloud_id = ?').get(cloudId) as any;
    return row ? row.id : null;
  }

  create(data: any): any {
    const tenant = getCachedTenant();
    if (!tenant) return { success: false, message: 'Terminal not activated' };

    let resultId: number = 0;
    this.db.transaction(() => {
      const result = this.db.prepare(`
        INSERT INTO products (tenant_id, name, description, sku, category_id, price, cost_price, tax_rate, is_active, track_inventory)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(tenant.tenant_id, data.name, data.description || null, data.sku || null, data.category_id, data.price || 0, data.cost_price || 0, data.tax_rate || 0, data.is_active ? 1 : 0, data.track_inventory ? 1 : 0);
      resultId = result.lastInsertRowid as number;

      if (data.track_inventory) {
        const invResult = this.db.prepare(`
          INSERT INTO inventory (tenant_id, product_id, quantity, min_quantity, unit)
          VALUES (?, ?, ?, ?, ?)
        `).run(tenant.tenant_id, resultId, data.initial_stock || 0, data.min_quantity || 5, data.unit || 'pcs');

        try {
          const fullInv = this.db.prepare('SELECT * FROM inventory WHERE id=?').get(invResult.lastInsertRowid);
          enqueueSyncOperation('inventory', 'INSERT', fullInv);
        } catch (e) { console.error('Inventory sync error:', e); }
      }

      // Handle variants
      if (data.variants && data.variants.length > 0) {
        const insertVariant = this.db.prepare(
          'INSERT INTO product_variants (tenant_id, product_id, name, sku, price, cost_price) VALUES (?, ?, ?, ?, ?, ?)'
        );
        for (const v of data.variants) {
          const vRes = insertVariant.run(tenant.tenant_id, resultId, v.name, v.sku || null, v.price, v.cost_price || 0);
          try {
            const vFull = this.db.prepare('SELECT * FROM product_variants WHERE id=?').get(vRes.lastInsertRowid);
            enqueueSyncOperation('product_variants', 'INSERT', vFull);
          } catch (e) { console.error('Variant sync error:', e); }
        }
      }

      try {
        const fullRow = this.db.prepare('SELECT * FROM products WHERE id=?').get(resultId);
        enqueueSyncOperation('products', 'INSERT', fullRow);
      } catch (err) {
        console.error('Local sync queue failed:', err);
      }
    })();

    return { success: true, id: resultId };
  }

  update(id: number, data: any): any {
    this.db.transaction(() => {
      this.db.prepare(`
        UPDATE products SET name=?, description=?, sku=?, category_id=?, price=?, cost_price=?,
               tax_rate=?, is_active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
      `).run(data.name, data.description || null, data.sku || null, data.category_id, data.price, data.cost_price || 0, data.tax_rate || 0, data.is_active ? 1 : 0, id);

      if (data.min_quantity !== undefined) {
        this.db.prepare('UPDATE inventory SET min_quantity=?, unit=?, updated_at=CURRENT_TIMESTAMP WHERE product_id=?').run(data.min_quantity, data.unit || 'pcs', id);
        
        if (data.add_stock && data.add_stock !== 0) {
          const inv = this.db.prepare('SELECT quantity, tenant_id FROM inventory WHERE product_id = ?').get(id) as any;
          if (inv) {
            const beforeQty = inv.quantity;
            const afterQty = beforeQty + data.add_stock;
            this.db.prepare('UPDATE inventory SET quantity=?, last_restocked=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE product_id=?').run(afterQty, id);
            
            this.db.prepare(`
              INSERT INTO stock_movements (tenant_id, product_id, type, quantity, before_qty, after_qty, notes)
              VALUES (?,?,?,?,?,?,?)
            `).run(inv.tenant_id, id, 'in', data.add_stock, beforeQty, afterQty, 'Stock added via Product Edit');
          }
        }

        try {
          const fullInv = this.db.prepare('SELECT * FROM inventory WHERE product_id=?').get(id);
          enqueueSyncOperation('inventory', 'UPDATE', fullInv);
        } catch (e) { console.error('Inventory sync error:', e); }
      }

      try {
        const fullRow = this.db.prepare('SELECT * FROM products WHERE id=?').get(id);
        enqueueSyncOperation('products', 'UPDATE', fullRow);
      } catch (err) { console.error('Local sync error:', err); }
    })();

    return { success: true };
  }

  delete(id: number): any {
    this.db.prepare('UPDATE products SET deleted_at=CURRENT_TIMESTAMP WHERE id=?').run(id);
    this.db.prepare('UPDATE product_variants SET deleted_at=CURRENT_TIMESTAMP WHERE product_id=?').run(id);
    
    try {
      const fullRow = this.db.prepare('SELECT * FROM products WHERE id=?').get(id);
      enqueueSyncOperation('products', 'UPDATE', fullRow);
    } catch (err) { console.error('Product sync error:', err); }

    return { success: true };
  }

  syncDown(payload: any[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO products (tenant_id, name, description, sku, category_id, price, cost_price, tax_rate, is_active, track_inventory, cloud_id, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, sku) DO UPDATE SET
        cloud_id = excluded.cloud_id,
        name = excluded.name,
        description = excluded.description,
        category_id = excluded.category_id,
        price = excluded.price,
        cost_price = excluded.cost_price,
        tax_rate = excluded.tax_rate,
        is_active = excluded.is_active,
        track_inventory = excluded.track_inventory,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
    `);
    const resolveCat = this.db.prepare('SELECT id FROM categories WHERE cloud_id = ?');

    this.db.transaction((items) => {
      for (const item of items) {
        const localCat = resolveCat.get(item.category_id) as any;
        stmt.run(item.tenant_id, item.name, item.description || null, item.sku || null, localCat ? localCat.id : null, item.price || 0, item.cost_price || 0, item.tax_rate || 0, item.is_active ? 1 : 0, item.track_inventory ? 1 : 0, item.id, item.created_at, item.updated_at, item.deleted_at);
      }
    })(payload);
  }

  syncDownVariants(payload: any[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO product_variants (tenant_id, product_id, name, sku, price, cost_price, is_active, cloud_id, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, sku) DO UPDATE SET
        cloud_id = excluded.cloud_id,
        name = excluded.name,
        price = excluded.price,
        cost_price = excluded.cost_price,
        is_active = excluded.is_active,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
    `);
    const resolveProd = this.db.prepare('SELECT id FROM products WHERE cloud_id = ?');

    this.db.transaction((items) => {
      for (const item of items) {
        const localProd = resolveProd.get(item.product_id) as any;
        if (localProd) {
          stmt.run(item.tenant_id, localProd.id, item.name, item.sku || null, item.price || 0, item.cost_price || 0, item.is_active ? 1 : 0, item.id, item.created_at, item.updated_at, item.deleted_at);
        }
      }
    })(payload);
  }
}

// ─── Orders Service ────────────────────────────────────────────────────────────
class OrdersService {
  constructor(private db: Database.Database) {}

  create(data: any): any {
    const tenant = getCachedTenant();
    if (!tenant) return { success: false, message: 'Terminal not activated or session expired' };

    const device = getCachedDevice();
    if (!device) return { success: false, message: 'This terminal device is not registered/authorized.' };

    // 1. Pipeline: Validate Context
    if (!data.items || data.items.length === 0) return { success: false, message: 'Cannot process empty order.' };
    if (!data.user_id) return { success: false, message: 'Cashier session missing. Please re-login.' };

    const now = new Date();
    const orderNumber = `ORD-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(Date.now()).slice(-6)}`;

    // 2. Pipeline: Atomic Transaction
    const createOrder = this.db.transaction((order: any) => {
      try {
        const result = this.db.prepare(`
          INSERT INTO orders (tenant_id, order_number, customer_id, user_id, status, subtotal, 
            discount_type, discount_value, discount_amount, tax_amount, total, 
            payment_method, amount_paid, change_amount, notes)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(
          tenant.tenant_id, orderNumber, order.customer_id || null, order.user_id, 'completed',
          order.subtotal, order.discount_type || null, order.discount_value || 0,
          order.discount_amount || 0, order.tax_amount || 0, order.total,
          order.payment_method, order.amount_paid, order.change_amount || 0, order.notes || null
        );

        const orderId = result.lastInsertRowid as number;

        // Loop items & adjust stock
        for (const item of order.items) {
          this.db.prepare(`
            INSERT INTO order_items (tenant_id, order_id, product_id, variant_id, product_name, variant_name, unit_price, quantity, discount_percent, tax_rate, line_total, notes)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
          `).run(tenant.tenant_id, orderId, item.product_id, item.variant_id || null, item.product_name, item.variant_name || null, item.unit_price, item.quantity,
                 item.discount_percent || 0, item.tax_rate || 0, item.line_total, item.notes || null);

          // Inventory Deduction
          const inv = this.db.prepare('SELECT quantity FROM inventory WHERE product_id = ? AND tenant_id = ?').get(item.product_id, tenant.tenant_id) as any;
          if (inv) {
            const newQty = Math.max(0, inv.quantity - item.quantity);
            this.db.prepare('UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND tenant_id = ?').run(newQty, item.product_id, tenant.tenant_id);
            this.db.prepare(`
              INSERT INTO stock_movements (tenant_id, product_id, type, quantity, before_qty, after_qty, reference, user_id)
              VALUES (?,?,?,?,?,?,?,?)
            `).run(tenant.tenant_id, item.product_id, 'out', item.quantity, inv.quantity, newQty, orderNumber, order.user_id);
          }

          // Recipe Check
          const ingredients = this.db.prepare('SELECT * FROM recipes WHERE product_id = ? AND tenant_id = ?').all(item.product_id, tenant.tenant_id) as any[];
          for (const recipe of ingredients) {
            const deduct = recipe.quantity * item.quantity;
            const ing = this.db.prepare('SELECT current_stock FROM ingredients WHERE id = ? AND tenant_id = ?').get(recipe.ingredient_id, tenant.tenant_id) as any;
            if (ing) {
              const newStk = Math.max(0, ing.current_stock - deduct);
              this.db.prepare('UPDATE ingredients SET current_stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?').run(newStk, recipe.ingredient_id, tenant.tenant_id);
              this.db.prepare(`
                INSERT INTO ingredient_movements (tenant_id, ingredient_id, type, quantity, before_qty, after_qty, reference, user_id)
                VALUES (?,?,?,?,?,?,?,?)
              `).run(tenant.tenant_id, recipe.ingredient_id, 'usage', deduct, ing.current_stock, newStk, `ORDER: ${orderNumber}`, order.user_id);
            }
          }
        }

        // Payments
        this.db.prepare('INSERT INTO payments (tenant_id, order_id, method, amount) VALUES (?,?,?,?)').run(tenant.tenant_id, orderId, order.payment_method, order.amount_paid);

        // Loyalty
        if (order.customer_id) {
          this.db.prepare('UPDATE customers SET total_spent = total_spent + ?, updated_at=CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?').run(order.total, order.customer_id, tenant.tenant_id);
        }

        // 3. Pipeline: Sync Notifications
        // Trigger background sync enqueuing (handled after transaction return for speed)
        return { success: true, id: orderId, order_number: orderNumber };

      } catch (err: any) {
        throw new Error(`Transaction failed: ${err.message}`);
      }
    });

    try {
      const result = createOrder(data);
      // Post-Transaction: Queue for background sync immediately
      this.reconcileSyncQueue(result.id, tenant.tenant_id);
      return result;
    } catch (checkoutErr: any) {
      // 4. Pipeline: Logging
      console.error('[CHECKOUT] Final Pipeline Failure:', checkoutErr.message);
      // Note: DatabaseService instance is needed for logAppError if called from here,
      // but OrdersService is a child. We'll assume the caller handles or we use global log.
      return { success: false, message: checkoutErr.message };
    }
  }

  private reconcileSyncQueue(orderId: number, tenant_id: string) {
    // Helper to ensure all parts of the order are queued for cloud
    try {
      const order = this.db.prepare('SELECT * FROM orders WHERE id=?').get(orderId) as any;
      enqueueSyncOperation('orders', 'INSERT', order);

      const items = this.db.prepare('SELECT * FROM order_items WHERE order_id=?').all(orderId);
      items.forEach(i => enqueueSyncOperation('order_items', 'INSERT', i));

      const payments = this.db.prepare('SELECT * FROM payments WHERE order_id=?').all(orderId);
      payments.forEach(p => enqueueSyncOperation('payments', 'INSERT', p));
      
      if (order.customer_id) {
         const cust = this.db.prepare('SELECT * FROM customers WHERE id=?').get(order.customer_id);
         enqueueSyncOperation('customers', 'UPDATE', cust);
      }

      // Sync Inventory changes resulting from this order
      const stockMoves = this.db.prepare('SELECT * FROM stock_movements WHERE reference = ?').all(order.order_number) as any[];
      stockMoves.forEach((m: any) => {
          enqueueSyncOperation('stock_movements', 'INSERT', m);
          const inv = this.db.prepare('SELECT * FROM inventory WHERE product_id = ?').get(m.product_id);
          enqueueSyncOperation('inventory', 'UPDATE', inv);
      });

      // Sync Ingredient changes resulting from this order
      const ingMoves = this.db.prepare("SELECT * FROM ingredient_movements WHERE reference = ?").all(`ORDER: ${order.order_number}`) as any[];
      ingMoves.forEach((m: any) => {
          enqueueSyncOperation('ingredient_movements', 'INSERT', m);
          const ing = this.db.prepare('SELECT * FROM ingredients WHERE id = ?').get(m.ingredient_id);
          enqueueSyncOperation('ingredients', 'UPDATE', ing);
      });

    } catch(e) { console.error('Sync reconciliation failed:', e); }
  }

  getAll(): any[] {
    const tenant = getCachedTenant();
    if (!tenant) return [];
    
    return this.db.prepare(`
      SELECT o.*, u.full_name as cashier_name, c.name as customer_name,
             COUNT(oi.id) as item_count
      FROM orders o
      JOIN users u ON o.user_id = u.id
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE LOWER(o.tenant_id) = LOWER(?)
      GROUP BY o.id
      ORDER BY o.created_at DESC LIMIT 200
    `).all(tenant.tenant_id);
  }

  getById(id: number): any {
    const tenant = getCachedTenant();
    if (!tenant) return null;

    const order = this.db.prepare(`
      SELECT o.*, u.full_name as cashier_name, c.name as customer_name
      FROM orders o JOIN users u ON o.user_id = u.id
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.id = ? AND o.tenant_id = ?
    `).get(id, tenant.tenant_id) as any;

    if (!order) return null;
    order.items = this.db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
    order.payments = this.db.prepare('SELECT * FROM payments WHERE order_id = ?').all(id);
    return order;
  }

  getByDateRange(start: string, end: string): any[] {
    const tenant = getCachedTenant();
    if (!tenant) return [];
    
    return this.db.prepare(`
      SELECT o.*, u.full_name as cashier_name
      FROM orders o JOIN users u ON o.user_id = u.id
      WHERE DATE(o.created_at) BETWEEN ? AND ? AND o.status = 'completed' AND o.tenant_id = ?
      ORDER BY o.created_at DESC
    `).all(start, end, tenant.tenant_id);
  }

  void(id: number, reason: string): any {
    const tenant = getCachedTenant();
    if (!tenant) return { success: false };

    const items = this.db.prepare('SELECT * FROM order_items WHERE order_id = ? AND tenant_id = ?').all(id, tenant.tenant_id) as any[];
    for (const item of items) {
      const inv = this.db.prepare('SELECT quantity FROM inventory WHERE product_id = ? AND tenant_id = ?').get(item.product_id, tenant.tenant_id) as any;
      if (inv) {
        const newQty = inv.quantity + item.quantity;
        this.db.prepare('UPDATE inventory SET quantity = ?, updated_at=CURRENT_TIMESTAMP WHERE product_id = ? AND tenant_id = ?').run(newQty, item.product_id, tenant.tenant_id);
        try {
          const fullInv = this.db.prepare('SELECT * FROM inventory WHERE product_id=?').get(item.product_id);
          enqueueSyncOperation('inventory', 'UPDATE', fullInv);
        } catch (e) { console.error('Inventory sync error:', e); }
      }
    }
    this.db.prepare(`UPDATE orders SET status='voided', void_reason=?, void_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id = ?`).run(reason, id, tenant.tenant_id);
    try {
      const fullOrder = this.db.prepare('SELECT * FROM orders WHERE id=?').get(id);
      enqueueSyncOperation('orders', 'UPDATE', fullOrder);
    } catch (err) { console.error('Order sync error:', err); }
    return { success: true };
  }

  syncDown(payload: any[]): void {
    const insertStmt = this.db.prepare(`
      INSERT INTO orders (
        tenant_id, order_number, customer_id, user_id, status, subtotal, 
        discount_type, discount_value, discount_amount, tax_amount, total, 
        payment_method, amount_paid, change_amount, notes, loyalty_redeemed, 
        loyalty_discount_amount, cloud_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const updateStmt = this.db.prepare(`
      UPDATE orders SET 
        status=?, subtotal=?, total=?, payment_method=?, 
        amount_paid=?, cloud_id=?, updated_at=?
      WHERE tenant_id=? AND order_number=?
    `);
    const checkStmt = this.db.prepare('SELECT id FROM orders WHERE tenant_id=? AND order_number=?');

    this.db.transaction((items) => {
      for (const item of items) {
        const orderNumber = item.order_number || item.local_order_id;
        const existing = checkStmt.get(item.tenant_id, orderNumber) as any;
        if (existing) {
          updateStmt.run(
            item.status, item.subtotal, item.total, item.payment_method,
            item.amount_paid, item.id, item.updated_at, item.tenant_id, orderNumber
          );
        } else {
          insertStmt.run(
            item.tenant_id, orderNumber, item.customer_id || null, item.user_id || null, item.status, item.subtotal || 0,
            item.discount_type || null, item.discount_value || 0, item.discount_amount || 0,
            item.tax_amount || 0, item.total || 0, item.payment_method || 'cash',
            item.amount_paid || 0, item.change_amount || 0, item.notes || null,
            item.loyalty_redeemed ? 1 : 0, item.loyalty_discount_amount || 0,
            item.id, item.created_at, item.updated_at
          );
        }
      }
    })(payload);
  }

  syncDownItems(payload: any[]): void {
    const insertStmt = this.db.prepare(`
        INSERT INTO order_items (
          tenant_id, order_id, product_id, variant_id, product_name, 
          variant_name, unit_price, quantity, discount_percent, tax_rate, 
          line_total, notes, cloud_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(cloud_id) DO UPDATE SET
          quantity = excluded.quantity,
          line_total = excluded.line_total
    `);
    const checkOrder = this.db.prepare('SELECT id FROM orders WHERE order_number = ?');

    this.db.transaction((items: any[]) => {
      for (const item of items) {
        const order = checkOrder.get(item.local_order_id) as any;
        if (order) {
          insertStmt.run(
            item.tenant_id, order.id, item.product_id, 
            item.variant_id || null, item.product_name, item.variant_name || null,
            item.unit_price || 0, item.quantity || 0, item.discount_percent || 0,
            item.tax_rate || 0, item.total_price || item.line_total || 0, 
            item.notes || null, item.id, item.created_at
          );
        }
      }
    })(payload);
  }

  syncDownPayments(payload: any[]): void {
    const insertStmt = this.db.prepare(`
        INSERT INTO payments (tenant_id, order_id, method, amount, reference, cloud_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(cloud_id) DO UPDATE SET amount = excluded.amount
    `);
    const checkOrder = this.db.prepare('SELECT id FROM orders WHERE order_number = ?');

    this.db.transaction((items: any[]) => {
      for (const item of items) {
        const order = checkOrder.get(item.local_order_id) as any;
        if (order) {
          insertStmt.run(item.tenant_id, order.id, item.method, item.amount, item.reference || null, item.id, item.created_at);
        }
      }
    })(payload);
  }
}

// ─── Inventory Service ────────────────────────────────────────────────────────
class InventoryService {
  constructor(private db: Database.Database) {}

  getAll(): any[] {
    const tenant = getCachedTenant();
    if (!tenant) return [];
    return this.db.prepare(`
      SELECT i.*, p.name as product_name, p.sku, c.name as category_name
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE LOWER(i.tenant_id) = LOWER(?) AND p.deleted_at IS NULL
      ORDER BY p.name
    `).all(tenant.tenant_id);
  }

  getLowStock(): any[] {
    const tenant = getCachedTenant();
    if (!tenant) return [];
    return this.db.prepare(`
      SELECT i.*, p.name as product_name
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      WHERE i.tenant_id = ? AND i.quantity <= i.min_quantity AND p.deleted_at IS NULL
    `).all(tenant.tenant_id);
  }

  adjustStock(productId: number, qty: number, type: string, notes?: string): any {
    const tenant = getCachedTenant();
    if (!tenant) return { success: false };

    const inv = this.db.prepare('SELECT * FROM inventory WHERE product_id = ? AND tenant_id = ?').get(productId, tenant.tenant_id) as any;
    const beforeQty = inv ? inv.quantity : 0;
    const afterQty = type === 'in' ? beforeQty + qty : (type === 'out' ? beforeQty - qty : qty);

    if (inv) {
      this.db.prepare('UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND tenant_id = ?').run(afterQty, productId, tenant.tenant_id);
    } else {
      this.db.prepare('INSERT INTO inventory (tenant_id, product_id, quantity) VALUES (?, ?, ?)').run(tenant.tenant_id, productId, afterQty);
    }

    const movResult = this.db.prepare(`
      INSERT INTO stock_movements (tenant_id, product_id, type, quantity, before_qty, after_qty, notes)
      VALUES (?,?,?,?,?,?,?)
    `).run(tenant.tenant_id, productId, type, Math.abs(qty), beforeQty, afterQty, notes || null);

    try {
      const fullInv = this.db.prepare('SELECT * FROM inventory WHERE product_id=? AND tenant_id=?').get(productId, tenant.tenant_id);
      enqueueSyncOperation('inventory', 'UPDATE', fullInv);

      const fullMov = this.db.prepare('SELECT * FROM stock_movements WHERE id=? AND tenant_id=?').get(movResult.lastInsertRowid, tenant.tenant_id);
      enqueueSyncOperation('stock_movements', 'INSERT', fullMov);
    } catch (e) { console.error('Inventory sync error:', e); }

    return { success: true };
  }

  getMovements(productId?: number): any[] {
    const tenant = getCachedTenant();
    if (!tenant) return [];

    const base = `
      SELECT sm.*, p.name as product_name, u.full_name as user_name
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.id
      LEFT JOIN users u ON sm.user_id = u.id
      WHERE sm.tenant_id = ?
    `;
    if (productId) {
      return this.db.prepare(base + ' AND sm.product_id = ? ORDER BY sm.created_at DESC LIMIT 100').all(tenant.tenant_id, productId);
    }
    return this.db.prepare(base + ' ORDER BY sm.created_at DESC LIMIT 500').all(tenant.tenant_id);
  }

  /**
   * syncDown: Receives inventory rows from Supabase and writes them to local SQLite.
   * Uses INSERT OR UPDATE so new devices immediately reflect current stock quantities.
   */
  syncDown(payload: any[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO inventory (tenant_id, product_id, quantity, min_quantity, unit, cloud_id, last_restocked, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, product_id) DO UPDATE SET
        quantity = excluded.quantity,
        min_quantity = excluded.min_quantity,
        cloud_id = excluded.cloud_id,
        updated_at = excluded.updated_at
    `);
    const resolveProd = this.db.prepare('SELECT id FROM products WHERE cloud_id = ?');

    this.db.transaction((items) => {
      for (const item of items) {
        const localProd = resolveProd.get(item.product_id) as any;
        if (localProd) {
          stmt.run(
            item.tenant_id,
            localProd.id,
            item.quantity ?? 0,
            item.min_quantity ?? 5,
            item.unit || 'pcs',
            item.id,
            item.last_restocked || null,
            item.created_at,
            item.updated_at
          );
        }
      }
    })(payload);
  }

  syncDownStockMovements(payload: any[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO stock_movements (tenant_id, product_id, type, quantity, before_qty, after_qty, reference, notes, user_id, cloud_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cloud_id) DO NOTHING
    `);
    const resolveProd = this.db.prepare('SELECT id FROM products WHERE cloud_id = ?');
    const resolveUser = this.db.prepare('SELECT id FROM users WHERE cloud_id = ?');

    this.db.transaction((items) => {
      for (const item of items) {
        const localProd = resolveProd.get(item.product_id) as any;
        const localUser = resolveUser.get(item.user_id) as any;
        if (localProd) {
          stmt.run(
            item.tenant_id,
            localProd.id,
            item.type,
            item.quantity,
            item.before_qty,
            item.after_qty,
            item.reference,
            item.notes,
            localUser ? localUser.id : null,
            item.id,
            item.created_at
          );
        }
      }
    })(payload);
  }
}

// ─── Ingredients Service ──────────────────────────────────────────────────────
class IngredientsService {
  constructor(private db: Database.Database) {}

  getAll(): any[] {
    const tenant = getCachedTenant();
    if (!tenant) return [];
    return this.db.prepare(`
      SELECT ing.*, s.name as supplier_name
      FROM ingredients ing
      LEFT JOIN suppliers s ON ing.supplier_id = s.id
      WHERE ing.tenant_id = ? AND ing.deleted_at IS NULL
      ORDER BY ing.name
    `).all(tenant.tenant_id);
  }

  getById(id: number): any {
    const tenant = getCachedTenant();
    if (!tenant) return null;
    return this.db.prepare('SELECT * FROM ingredients WHERE id=? AND tenant_id=?').get(id, tenant.tenant_id);
  }

  getLowStock(): any[] {
    const tenant = getCachedTenant();
    if (!tenant) return [];
    return this.db.prepare(`
      SELECT * FROM ingredients
      WHERE tenant_id = ? AND current_stock <= reorder_level AND deleted_at IS NULL
      ORDER BY (current_stock / reorder_level) ASC
    `).all(tenant.tenant_id);
  }

  create(data: any): any {
    const tenant = getCachedTenant();
    if (!tenant) return { success: false };

    const r = this.db.prepare(`
      INSERT INTO ingredients (tenant_id, name, unit, current_stock, reorder_level, cost_per_unit, supplier_id, notes)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(tenant.tenant_id, data.name, data.unit || 'g', data.current_stock || 0, data.reorder_level || 100,
           data.cost_per_unit || 0, data.supplier_id || null, data.notes || null);
    
    try {
      const fullRow = this.db.prepare('SELECT * FROM ingredients WHERE id=?').get(r.lastInsertRowid);
      enqueueSyncOperation('ingredients', 'INSERT', fullRow);
    } catch (err) { console.error('Ingredient sync error:', err); }

    return { success: true, id: r.lastInsertRowid };
  }

  update(id: number, data: any): any {
    this.db.prepare(`
      UPDATE ingredients SET name=?, unit=?, reorder_level=?, cost_per_unit=?, supplier_id=?, notes=?,
             updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).run(data.name, data.unit, data.reorder_level, data.cost_per_unit || 0,
           data.supplier_id || null, data.notes || null, id);
    
    try {
      const fullRow = this.db.prepare('SELECT * FROM ingredients WHERE id=?').get(id);
      enqueueSyncOperation('ingredients', 'UPDATE', fullRow);
    } catch (err) { console.error('Ingredient sync error:', err); }

    return { success: true };
  }

  delete(id: number): any {
    this.db.prepare('UPDATE ingredients SET deleted_at=CURRENT_TIMESTAMP WHERE id=?').run(id);
    
    try {
      const fullRow = this.db.prepare('SELECT * FROM ingredients WHERE id=?').get(id);
      enqueueSyncOperation('ingredients', 'UPDATE', fullRow);
    } catch (err) { console.error('Ingredient sync error:', err); }

    return { success: true };
  }

  adjustStock(id: number, qty: number, type: string, notes: string, userId?: number): any {
    const tenant = getCachedTenant();
    if (!tenant) return { success: false };

    const ing = this.db.prepare('SELECT current_stock, tenant_id FROM ingredients WHERE id=?').get(id) as any;
    if (!ing) return { success: false, message: 'Ingredient not found' };
    const before = ing.current_stock;
    let after: number;
    if (type === 'adjustment') after = qty;
    else if (type === 'purchase') after = before + qty;
    else after = Math.max(0, before - qty);
    this.db.prepare('UPDATE ingredients SET current_stock=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(after, id);
    this.db.prepare(`
      INSERT INTO ingredient_movements (tenant_id, ingredient_id, type, quantity, before_qty, after_qty, notes, user_id)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(tenant.tenant_id, id, type, Math.abs(qty - (type === 'adjustment' ? before : 0) || qty), before, after, notes || null, userId || null);
    
    try {
      const fullRow = this.db.prepare('SELECT * FROM ingredients WHERE id=?').get(id);
      enqueueSyncOperation('ingredients', 'UPDATE', fullRow);
    } catch (err) { console.error('Ingredient sync error:', err); }

    return { success: true };
  }

  getMovements(ingredientId?: number): any[] {
    const tenant = getCachedTenant();
    if (!tenant) return [];

    const base = `
      SELECT im.*, ing.name as ingredient_name, ing.unit, u.full_name as user_name
      FROM ingredient_movements im
      JOIN ingredients ing ON im.ingredient_id = ing.id
      LEFT JOIN users u ON im.user_id = u.id
      WHERE im.tenant_id = ?
    `;
    if (ingredientId) {
      return this.db.prepare(base + ' AND im.ingredient_id = ? ORDER BY im.created_at DESC LIMIT 200').all(tenant.tenant_id, ingredientId);
    }
    return this.db.prepare(base + ' ORDER BY im.created_at DESC LIMIT 500').all(tenant.tenant_id);
  }

  syncDown(payload: any[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO ingredients (tenant_id, name, unit, current_stock, reorder_level, cost_per_unit, cloud_id, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, name) DO UPDATE SET
        current_stock = excluded.current_stock,
        reorder_level = excluded.reorder_level,
        cost_per_unit = excluded.cost_per_unit,
        cloud_id = excluded.cloud_id,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
    `);
    this.db.transaction((items) => {
      for (const item of items) {
        stmt.run(item.tenant_id, item.name, item.unit || 'g', item.current_stock || 0, item.reorder_level || 100, item.cost_per_unit || 0, item.id, item.created_at, item.updated_at, item.deleted_at);
      }
    })(payload);
  }

  syncDownIngredientMovements(payload: any[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO ingredient_movements (tenant_id, ingredient_id, type, quantity, before_qty, after_qty, notes, user_id, cloud_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cloud_id) DO NOTHING
    `);
    const resolveIng = this.db.prepare('SELECT id FROM ingredients WHERE cloud_id = ?');
    const resolveUser = this.db.prepare('SELECT id FROM users WHERE cloud_id = ?');

    this.db.transaction((items) => {
      for (const item of items) {
        const localIng = resolveIng.get(item.ingredient_id) as any;
        const localUser = resolveUser.get(item.user_id) as any;
        if (localIng) {
          stmt.run(
            item.tenant_id,
            localIng.id,
            item.type,
            item.quantity,
            item.before_qty,
            item.after_qty,
            item.notes || null,
            localUser ? localUser.id : null,
            item.id,
            item.created_at
          );
        }
      }
    })(payload);
  }
}

// ─── Recipes Service ──────────────────────────────────────────────────────────
class RecipesService {
  constructor(private db: Database.Database) {}

  getForProduct(productId: number): any[] {
    return this.db.prepare(`
      SELECT r.*, ing.name as ingredient_name, ing.unit as ingredient_unit,
             ing.current_stock, ing.reorder_level
      FROM recipes r
      JOIN ingredients ing ON r.ingredient_id = ing.id
      WHERE r.product_id = ?
      ORDER BY ing.name
    `).all(productId);
  }

  getAll(): any[] {
    const tenant = getCachedTenant();
    if (!tenant) return [];
    return this.db.prepare(`
      SELECT r.*, p.name as product_name, p.sku, 
             ing.name as ingredient_name, ing.unit as ingredient_unit,
             ing.current_stock, ing.reorder_level
      FROM recipes r
      JOIN products p ON r.product_id = p.id
      JOIN ingredients ing ON r.ingredient_id = ing.id
      WHERE r.tenant_id = ? AND p.deleted_at IS NULL
      ORDER BY p.name, ing.name
    `).all(tenant.tenant_id);
  }

  upsert(productId: number, ingredientId: number, quantity: number, unit?: string): any {
    const tenant = getCachedTenant();
    if (!tenant) return { success: false };

    const result = this.db.prepare(`
      INSERT INTO recipes (tenant_id, product_id, ingredient_id, quantity, unit)
      VALUES (?,?,?,?,?)
      ON CONFLICT(product_id, ingredient_id) DO UPDATE SET quantity=excluded.quantity, unit=excluded.unit, updated_at=CURRENT_TIMESTAMP
    `).run(tenant.tenant_id, productId, ingredientId, quantity, unit || null);

    try {
      const fullRow = this.db.prepare('SELECT * FROM recipes WHERE product_id=? AND ingredient_id=?').get(productId, ingredientId);
      enqueueSyncOperation('recipes', result.changes > 0 && result.lastInsertRowid ? 'INSERT' : 'UPDATE', fullRow);
    } catch (err) { console.error('Recipe sync error:', err); }

    return { success: true };
  }

  removeIngredient(productId: number, ingredientId: number): any {
    this.db.prepare('DELETE FROM recipes WHERE product_id=? AND ingredient_id=?').run(productId, ingredientId);
    
    try {
      enqueueSyncOperation('recipes', 'DELETE', { product_id: productId, ingredient_id: ingredientId });
    } catch (err) { console.error('Recipe sync error:', err); }

    return { success: true };
  }

  setRecipe(productId: number, items: { ingredient_id: number; quantity: number; unit?: string }[]): any {
    const tenant = getCachedTenant();
    if (!tenant) return { success: false };

    const setAll = this.db.transaction(() => {
      const existingRecipes = this.db.prepare('SELECT product_id, ingredient_id FROM recipes WHERE product_id=?').all(productId) as any[];
      this.db.prepare('DELETE FROM recipes WHERE product_id=?').run(productId);
      for (const { product_id, ingredient_id } of existingRecipes) {
        try {
          enqueueSyncOperation('recipes', 'DELETE', { product_id, ingredient_id });
        } catch (err) { console.error('Recipe sync error (batch delete):', err); }
      }

      for (const item of items) {
        this.db.prepare(
          'INSERT INTO recipes (tenant_id, product_id, ingredient_id, quantity, unit) VALUES (?,?,?,?,?)'
        ).run(tenant.tenant_id, productId, item.ingredient_id, item.quantity, item.unit || null);
        try {
          const fullRow = this.db.prepare('SELECT * FROM recipes WHERE product_id=? AND ingredient_id=?').get(productId, item.ingredient_id);
          enqueueSyncOperation('recipes', 'INSERT', fullRow);
        } catch (err) { console.error('Recipe sync error (batch insert):', err); }
      }
    });
    setAll();
    return { success: true };
  }

  checkAvailability(productId: number, qty: number = 1): any {
    const recipe = this.getForProduct(productId);
    if (recipe.length === 0) return { available: true, shortage: [] };
    const shortage: any[] = [];
    for (const row of recipe) {
      const needed = row.quantity * qty;
      if (row.current_stock < needed) {
        shortage.push({
          ingredient_name: row.ingredient_name,
          needed,
          available: row.current_stock,
          unit: row.ingredient_unit,
        });
      }
    }
    return { available: shortage.length === 0, shortage };
  }

  syncDown(payload: any[]): void {
     const stmt = this.db.prepare(`
       INSERT OR REPLACE INTO recipes (id, tenant_id, product_id, ingredient_id, quantity, unit, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     `);
     this.db.transaction((items) => {
       for (const item of items) {
         stmt.run(item.id, item.tenant_id, item.product_id, item.ingredient_id, item.quantity, item.unit || null, item.created_at, item.updated_at, item.deleted_at);
       }
     })(payload);
  }
}

// ─── Modifiers Service ────────────────────────────────────────────────────────
class ModifiersService {
  constructor(private db: Database.Database) {}

  getAll(): any[] {
    const tenant = getCachedTenant();
    if (!tenant) return [];
    const mods = this.db.prepare('SELECT * FROM modifiers WHERE tenant_id = ? ORDER BY name').all(tenant.tenant_id) as any[];
    for (const m of mods) {
      m.options = this.db.prepare('SELECT * FROM modifier_options WHERE modifier_id=? ORDER BY name').all(m.id);
    }
    return mods;
  }

  getForProduct(productId: number): any[] {
    const mods = this.db.prepare(`
      SELECT m.* FROM modifiers m
      JOIN product_modifiers pm ON pm.modifier_id = m.id
      WHERE pm.product_id = ?
      ORDER BY m.name
    `).all(productId) as any[];
    for (const m of mods) {
      m.options = this.db.prepare('SELECT * FROM modifier_options WHERE modifier_id=? ORDER BY rowid').all(m.id);
    }
    return mods;
  }

  createModifier(data: any): any {
    const tenant = getCachedTenant();
    if (!tenant) return { success: false };

    const r = this.db.prepare(
      'INSERT INTO modifiers (tenant_id, name, description, is_required, allow_multiple) VALUES (?,?,?,?,?)'
    ).run(tenant.tenant_id, data.name, data.description || null, data.is_required ? 1 : 0, data.allow_multiple ? 1 : 0);
    
    try {
      const fullRow = this.db.prepare('SELECT * FROM modifiers WHERE id=?').get(r.lastInsertRowid);
      enqueueSyncOperation('modifiers', 'INSERT', fullRow);
    } catch (err) { console.error('Modifier sync error:', err); }

    return { success: true, id: r.lastInsertRowid };
  }

  updateModifier(id: number, data: any): any {
    this.db.prepare(
      'UPDATE modifiers SET name=?, description=?, is_required=?, allow_multiple=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'
    ).run(data.name, data.description || null, data.is_required ? 1 : 0, data.allow_multiple ? 1 : 0, id);
    
    try {
      const fullRow = this.db.prepare('SELECT * FROM modifiers WHERE id=?').get(id);
      enqueueSyncOperation('modifiers', 'UPDATE', fullRow);
    } catch (err) { console.error('Modifier sync error:', err); }

    return { success: true };
  }

  deleteModifier(id: number): any {
    this.db.prepare('DELETE FROM modifiers WHERE id=?').run(id);
    
    try {
      enqueueSyncOperation('modifiers', 'DELETE', { id });
    } catch (err) { console.error('Modifier sync error:', err); }

    return { success: true };
  }

  addOption(modifierId: number, data: any): any {
    const tenant = getCachedTenant();
    if (!tenant) return { success: false };

    const r = this.db.prepare(
      'INSERT INTO modifier_options (tenant_id, modifier_id, name, price_adjustment) VALUES (?,?,?,?)'
    ).run(tenant.tenant_id, modifierId, data.name, data.price_adjustment || 0);
    
    try {
      const fullRow = this.db.prepare('SELECT * FROM modifier_options WHERE id=?').get(r.lastInsertRowid);
      enqueueSyncOperation('modifier_options', 'INSERT', fullRow);
    } catch (err) { console.error('Modifier option sync error:', err); }

    return { success: true, id: r.lastInsertRowid };
  }

  updateOption(id: number, data: any): any {
    this.db.prepare(
      'UPDATE modifier_options SET name=?, price_adjustment=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'
    ).run(data.name, data.price_adjustment || 0, id);
    
    try {
      const fullRow = this.db.prepare('SELECT * FROM modifier_options WHERE id=?').get(id);
      enqueueSyncOperation('modifier_options', 'UPDATE', fullRow);
    } catch (err) { console.error('Modifier option sync error:', err); }

    return { success: true };
  }

  deleteOption(id: number): any {
    this.db.prepare('DELETE FROM modifier_options WHERE id=?').run(id);
    
    try {
      enqueueSyncOperation('modifier_options', 'DELETE', { id });
    } catch (err) { console.error('Modifier option sync error:', err); }

    return { success: true };
  }

  linkToProduct(productId: number, modifierId: number): any {
    const tenant = getCachedTenant();
    if (!tenant) return { success: false };

    const r = this.db.prepare(
      'INSERT OR IGNORE INTO product_modifiers (tenant_id, product_id, modifier_id) VALUES (?,?,?)'
    ).run(tenant.tenant_id, productId, modifierId);
    
    if (r.changes > 0) {
      try {
        const fullRow = this.db.prepare('SELECT * FROM product_modifiers WHERE product_id=? AND modifier_id=?').get(productId, modifierId);
        enqueueSyncOperation('product_modifiers', 'INSERT', fullRow);
      } catch (err) { console.error('Product modifier link sync error:', err); }
    }

    return { success: true };
  }

  unlinkFromProduct(productId: number, modifierId: number): any {
    this.db.prepare(
      'DELETE FROM product_modifiers WHERE product_id=? AND modifier_id=?'
    ).run(productId, modifierId);
    
    try {
      enqueueSyncOperation('product_modifiers', 'DELETE', { product_id: productId, modifier_id: modifierId });
    } catch (err) { console.error('Product modifier unlink sync error:', err); }

    return { success: true };
  }

  syncDown(payload: any[]): void {
     const stmt = this.db.prepare(`
       INSERT OR REPLACE INTO modifiers (id, tenant_id, name, type, required, min_selection, max_selection, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     `);
     this.db.transaction((items) => {
       for (const item of items) {
         stmt.run(item.id, item.tenant_id, item.name, item.type || 'optional', item.required ? 1 : 0, item.min_selection || 0, item.max_selection || 1, item.created_at, item.updated_at, item.deleted_at);
       }
     })(payload);
  }

  syncDownOptions(payload: any[]): void {
     const stmt = this.db.prepare(`
       INSERT OR REPLACE INTO modifier_options (id, tenant_id, modifier_id, name, price, cost_price, is_default, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     `);
     this.db.transaction((items) => {
       for (const item of items) {
         stmt.run(item.id, item.tenant_id, item.modifier_id, item.name, item.price || 0, item.cost_price || 0, item.is_default ? 1 : 0, item.created_at, item.updated_at, item.deleted_at);
       }
     })(payload);
  }

  syncDownLinks(payload: any[]): void {
     const stmt = this.db.prepare(`
       INSERT OR REPLACE INTO product_modifiers (id, tenant_id, product_id, modifier_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
     `);
     this.db.transaction((items) => {
       for (const item of items) {
         stmt.run(item.id, item.tenant_id, item.product_id, item.modifier_id, item.created_at, item.updated_at);
       }
     })(payload);
  }
}

// ─── Suppliers Service ─────────────────────────────────────────────────────────
class SuppliersService {
  constructor(private db: Database.Database) {}
  getAll(): any[] {
    const tenant = getCachedTenant();
    if (!tenant) return [];
    return this.db.prepare('SELECT * FROM suppliers WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY name').all(tenant.tenant_id);
  }
  getById(id: number): any {
    const tenant = getCachedTenant();
    if (!tenant) return null;
    return this.db.prepare('SELECT * FROM suppliers WHERE id = ? AND tenant_id = ?').get(id, tenant.tenant_id);
  }
  create(data: any): any {
    const tenant = getCachedTenant();
    if (!tenant) return { success: false };

    const r = this.db.prepare('INSERT INTO suppliers (tenant_id, name, contact_person, phone, email, address, notes) VALUES (?,?,?,?,?,?,?)')
      .run(tenant.tenant_id, data.name, data.contact_person || null, data.phone || null, data.email || null, data.address || null, data.notes || null);
    
    try {
      const fullRow = this.db.prepare('SELECT * FROM suppliers WHERE id=?').get(r.lastInsertRowid);
      enqueueSyncOperation('suppliers', 'INSERT', fullRow);
    } catch (err) { console.error('Supplier sync error:', err); }

    return { success: true, id: r.lastInsertRowid };
  }
  update(id: number, data: any): any {
    this.db.prepare('UPDATE suppliers SET name=?, contact_person=?, phone=?, email=?, address=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .run(data.name, data.contact_person || null, data.phone || null, data.email || null, data.address || null, data.notes || null, id);
    
    try {
      const fullRow = this.db.prepare('SELECT * FROM suppliers WHERE id=?').get(id);
      enqueueSyncOperation('suppliers', 'UPDATE', fullRow);
    } catch (err) { console.error('Supplier sync error:', err); }

    return { success: true };
  }
  delete(id: number): any {
    this.db.prepare('UPDATE suppliers SET deleted_at=CURRENT_TIMESTAMP WHERE id=?').run(id);
    
    try {
      const fullRow = this.db.prepare('SELECT * FROM suppliers WHERE id=?').get(id);
      enqueueSyncOperation('suppliers', 'UPDATE', fullRow);
    } catch (err) { console.error('Supplier sync error:', err); }

    return { success: true };
  }

  syncDown(payload: any[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO suppliers (tenant_id, name, contact_person, phone, email, address, notes, is_active, cloud_id, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, name) DO UPDATE SET
        cloud_id = excluded.cloud_id,
        contact_person = excluded.contact_person,
        phone = excluded.phone,
        email = excluded.email,
        address = excluded.address,
        notes = excluded.notes,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
    `);
    this.db.transaction((items) => {
      for (const item of items) {
        stmt.run(item.tenant_id, item.name, item.contact_person || null, item.phone || null, item.email || null, item.address || null, item.notes || null, item.is_active ? 1 : 0, item.id, item.created_at, item.updated_at, item.deleted_at);
      }
    })(payload);
  }
}

// ─── Customers Service ─────────────────────────────────────────────────────────
class CustomersService {
  constructor(private db: Database.Database) {}
  getAll(): any[] {
    const tenant = getCachedTenant();
    if (!tenant) return [];
    return this.db.prepare('SELECT * FROM customers WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY name').all(tenant.tenant_id);
  }
  getById(id: number): any {
    const tenant = getCachedTenant();
    if (!tenant) return null;
    return this.db.prepare('SELECT * FROM customers WHERE id = ? AND tenant_id = ?').get(id, tenant.tenant_id);
  }
  create(data: any): any {
    const tenant = getCachedTenant();
    if (!tenant) return { success: false };

    const r = this.db.prepare('INSERT INTO customers (tenant_id, name, phone, email, address, notes) VALUES (?,?,?,?,?,?)')
      .run(tenant.tenant_id, data.name, data.phone || null, data.email || null, data.address || null, data.notes || null);
    
    // Auto-create Loyalty Card
    const customerId = r.lastInsertRowid;
    const loyaltyCode = 'LOYALTY-LC' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const thresholdSetting = this.db.prepare("SELECT value FROM settings WHERE key='loyalty_reward_threshold' AND tenant_id = ?").get(tenant.tenant_id) as any;
    const threshold = thresholdSetting ? parseInt(thresholdSetting.value) : 10;

    const lr = this.db.prepare('INSERT INTO loyalty_cards (tenant_id, customer_id, loyalty_code, reward_threshold) VALUES (?,?,?,?)')
      .run(tenant.tenant_id, customerId, loyaltyCode, threshold);

    try {
      const fullRow = this.db.prepare('SELECT * FROM customers WHERE id=?').get(customerId);
      enqueueSyncOperation('customers', 'INSERT', fullRow);
      
      const cardRow = this.db.prepare('SELECT * FROM loyalty_cards WHERE id=?').get(lr.lastInsertRowid);
      enqueueSyncOperation('loyalty_cards', 'INSERT', cardRow);
    } catch (err) { console.error('Customer/Loyalty sync error:', err); }

    return { success: true, id: customerId };
  }
  update(id: number, data: any): any {
    this.db.prepare('UPDATE customers SET name=?, phone=?, email=?, address=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .run(data.name, data.phone || null, data.email || null, data.address || null, data.notes || null, id);
    
    try {
      const fullRow = this.db.prepare('SELECT * FROM customers WHERE id=?').get(id);
      enqueueSyncOperation('customers', 'UPDATE', fullRow);
    } catch (err) { console.error('Customer sync error:', err); }

    return { success: true };
  }
  delete(id: number): any {
    this.db.prepare('UPDATE customers SET deleted_at=CURRENT_TIMESTAMP WHERE id=?').run(id);
    
    try {
      const fullRow = this.db.prepare('SELECT * FROM customers WHERE id=?').get(id);
      enqueueSyncOperation('customers', 'UPDATE', fullRow);
    } catch (err) { console.error('Customer sync error:', err); }

    return { success: true };
  }

  syncDown(payload: any[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO customers (tenant_id, name, email, phone, address, notes, cloud_id, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, phone) DO UPDATE SET
        cloud_id = excluded.cloud_id,
        name = excluded.name,
        email = excluded.email,
        address = excluded.address,
        notes = excluded.notes,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
    `);
    this.db.transaction((items) => {
      for (const item of items) {
        stmt.run(item.tenant_id, item.name, item.email || null, item.phone || null, item.address || null, item.notes || null, item.id, item.created_at, item.updated_at, item.deleted_at);
      }
    })(payload);
  }

  resolveLocalIdByCloudId(cloudId: string): number | null {
    if (!cloudId) return null;
    const row = this.db.prepare('SELECT id FROM customers WHERE cloud_id = ?').get(cloudId) as any;
    return row ? row.id : null;
  }
}

// ─── Expenses Service ──────────────────────────────────────────────────────────
class ExpensesService {
  constructor(private db: Database.Database) {}
  getAll(): any[] {
    const tenant = getCachedTenant();
    if (!tenant) return [];
    return this.db.prepare('SELECT e.*, u.full_name as user_name FROM expenses e LEFT JOIN users u ON e.user_id = u.id WHERE e.tenant_id = ? AND e.deleted_at IS NULL ORDER BY e.date DESC').all(tenant.tenant_id);
  }
  create(data: any): any {
    const tenant = getCachedTenant();
    if (!tenant) return { success: false };

    const r = this.db.prepare('INSERT INTO expenses (tenant_id, category, description, amount, date, payment_method, reference, user_id, notes) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(tenant.tenant_id, data.category, data.description, data.amount, data.date, data.payment_method || 'cash', data.reference || null, data.user_id || null, data.notes || null);
    
    try {
      const fullRow = this.db.prepare('SELECT * FROM expenses WHERE id=?').get(r.lastInsertRowid);
      enqueueSyncOperation('expenses', 'INSERT', fullRow);
    } catch (err) { console.error('Expense sync error:', err); }

    return { success: true, id: r.lastInsertRowid };
  }
  update(id: number, data: any): any {
    this.db.prepare('UPDATE expenses SET category=?, description=?, amount=?, date=?, payment_method=?, reference=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .run(data.category, data.description, data.amount, data.date, data.payment_method || 'cash', data.reference || null, data.notes || null, id);
    
    try {
      const fullRow = this.db.prepare('SELECT * FROM expenses WHERE id=?').get(id);
      enqueueSyncOperation('expenses', 'UPDATE', fullRow);
    } catch (err) { console.error('Expense sync error:', err); }

    return { success: true };
  }
  delete(id: number): any {
    this.db.prepare('UPDATE expenses SET deleted_at=CURRENT_TIMESTAMP WHERE id=?').run(id);
    
    try {
      const fullRow = this.db.prepare('SELECT * FROM expenses WHERE id=?').get(id);
      enqueueSyncOperation('expenses', 'UPDATE', fullRow);
    } catch (err) { console.error('Expense sync error:', err); }

    return { success: true };
  }

  syncDown(payload: any[]): void {
    // FIX: Was 9 columns but had 10 ? placeholders — caused crash on every expense sync
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO expenses (id, tenant_id, category, amount, description, date, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.db.transaction((items) => {
      for (const item of items) {
        stmt.run(
          item.id,
          item.tenant_id,
          item.category,
          item.amount,
          item.description || null,
          item.date,
          item.created_at,
          item.updated_at,
          item.deleted_at
        );
      }
    })(payload);
  }
}

// ─── Reports Service ───────────────────────────────────────────────────────────
class ReportsService {
  constructor(private db: Database.Database) {}

  getDashboard(): any {
    const tenant = getCachedTenant();
    if (!tenant) return {};

    const today = new Date().toISOString().split('T')[0];
    const weekStart = new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0];
    const monthStart = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-01`;

    const todaySales = this.db.prepare(`SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count FROM orders WHERE tenant_id = ? AND DATE(created_at) = ? AND status='completed'`).get(tenant.tenant_id, today) as any;
    const weeklySales = this.db.prepare(`SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count FROM orders WHERE tenant_id = ? AND DATE(created_at) BETWEEN ? AND ? AND status='completed'`).get(tenant.tenant_id, weekStart, today) as any;
    const monthlySales = this.db.prepare(`SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count FROM orders WHERE tenant_id = ? AND DATE(created_at) >= ? AND status='completed'`).get(tenant.tenant_id, monthStart) as any;
    const lowStock = this.db.prepare('SELECT COUNT(*) as count FROM inventory i JOIN products p ON i.product_id=p.id WHERE i.tenant_id = ? AND i.quantity <= i.min_quantity AND p.deleted_at IS NULL').get(tenant.tenant_id) as any;
    const recentOrders = this.db.prepare(`SELECT o.*, u.full_name as cashier FROM orders o JOIN users u ON o.user_id=u.id WHERE o.tenant_id = ? ORDER BY o.created_at DESC LIMIT 10`).all(tenant.tenant_id);
    const topProducts = this.db.prepare(`
      SELECT p.name, SUM(oi.quantity) as qty_sold, SUM(oi.line_total) as revenue
      FROM order_items oi JOIN products p ON oi.product_id=p.id
      JOIN orders o ON oi.order_id=o.id
      WHERE o.tenant_id = ? AND DATE(o.created_at) >= ? AND o.status='completed'
      GROUP BY p.id ORDER BY revenue DESC LIMIT 5
    `).all(tenant.tenant_id, monthStart);

    const loyaltySummary = this.db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(loyalty_discount_amount),0) as saved FROM orders WHERE tenant_id = ? AND DATE(created_at) >= ? AND loyalty_redeemed = 1`).get(tenant.tenant_id, monthStart) as any;

    return { 
      todaySales, weeklySales, monthlySales, lowStock, recentOrders, topProducts,
      loyaltySummary 
    };
  }

  getSalesTrend(days: number): any[] {
    const tenant = getCachedTenant();
    if (!tenant) return [];

    const results = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
      const row = this.db.prepare(`SELECT COALESCE(SUM(total),0) as total, COUNT(*) as orders FROM orders WHERE tenant_id = ? AND DATE(created_at)=? AND status='completed'`).get(tenant.tenant_id, date) as any;
      results.push({ date, total: row.total, orders: row.orders });
    }
    return results;
  }

  getDailySales(date: string): any {
    const tenant = getCachedTenant();
    if (!tenant) return {};

    const orders = this.db.prepare(`SELECT o.*, u.full_name as cashier FROM orders o JOIN users u ON o.user_id=u.id WHERE o.tenant_id = ? AND DATE(o.created_at)=? ORDER BY o.created_at DESC`).all(tenant.tenant_id, date) as any[];
    const summary = this.db.prepare(`SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count, COALESCE(SUM(discount_amount),0) as discounts, COALESCE(SUM(tax_amount),0) as taxes FROM orders WHERE tenant_id = ? AND DATE(created_at)=? AND status='completed'`).get(tenant.tenant_id, date) as any;
    const byPayment = this.db.prepare(`SELECT payment_method, COUNT(*) as count, SUM(total) as total FROM orders WHERE tenant_id = ? AND DATE(created_at)=? AND status='completed' GROUP BY payment_method`).all(tenant.tenant_id, date);
    return { orders, summary, byPayment };
  }

  getWeeklySales(startDate: string): any[] {
    const tenant = getCachedTenant();
    if (!tenant) return [];
    return this.db.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as orders, SUM(total) as total
      FROM orders WHERE tenant_id = ? AND DATE(created_at) >= ? AND status='completed'
      GROUP BY DATE(created_at) ORDER BY date
    `).all(tenant.tenant_id, startDate);
  }

  getMonthlySales(year: number, month: number): any[] {
    const tenant = getCachedTenant();
    if (!tenant) return [];
    const m = String(month).padStart(2, '0');
    return this.db.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as orders, SUM(total) as total
      FROM orders WHERE tenant_id = ? AND strftime('%Y-%m', created_at)=? AND status='completed'
      GROUP BY DATE(created_at) ORDER BY date
    `).all(tenant.tenant_id, `${year}-${m}`);
  }

  getProductPerformance(start: string, end: string): any[] {
    const tenant = getCachedTenant();
    if (!tenant) return [];
    return this.db.prepare(`
      SELECT p.name, p.sku, c.name as category, SUM(oi.quantity) as qty_sold,
             AVG(oi.unit_price) as avg_price, SUM(oi.line_total) as revenue
      FROM order_items oi JOIN products p ON oi.product_id=p.id
      LEFT JOIN categories c ON p.category_id=c.id
      JOIN orders o ON oi.order_id=o.id
      WHERE o.tenant_id = ? AND DATE(o.created_at) BETWEEN ? AND ? AND o.status='completed'
      GROUP BY p.id ORDER BY revenue DESC
    `).all(tenant.tenant_id, start, end);
  }

  getCategoryPerformance(start: string, end: string): any[] {
    const tenant = getCachedTenant();
    if (!tenant) return [];
    return this.db.prepare(`
      SELECT c.name as category, c.color, COUNT(DISTINCT o.id) as orders,
             SUM(oi.quantity) as qty_sold, SUM(oi.line_total) as revenue
      FROM order_items oi JOIN products p ON oi.product_id=p.id
      JOIN categories c ON p.category_id=c.id
      JOIN orders o ON oi.order_id=o.id
      WHERE o.tenant_id = ? AND DATE(o.created_at) BETWEEN ? AND ? AND o.status='completed'
      GROUP BY c.id ORDER BY revenue DESC
    `).all(tenant.tenant_id, start, end);
  }

  getIngredientConsumption(start: string, end: string): any[] {
    const tenant = getCachedTenant();
    if (!tenant) return [];
    return this.db.prepare(`
      SELECT ing.name as ingredient_name, ing.unit,
             SUM(im.quantity) as total_consumed,
             COUNT(im.id) as usage_count,
             SUM(im.quantity * ing.cost_per_unit) as total_cost
      FROM ingredient_movements im
      JOIN ingredients ing ON im.ingredient_id = ing.id
      WHERE im.tenant_id = ? AND im.type = 'usage' AND DATE(im.created_at) BETWEEN ? AND ?
      GROUP BY ing.id ORDER BY total_consumed DESC
    `).all(tenant.tenant_id, start, end);
  }

  getProfitSummary(start: string, end: string): any {
    const tenant = getCachedTenant();
    if (!tenant) return {};

    const revenue = this.db.prepare(`
      SELECT COALESCE(SUM(total),0) as total, COUNT(*) as orders
      FROM orders WHERE tenant_id = ? AND DATE(created_at) BETWEEN ? AND ? AND status='completed'
    `).get(tenant.tenant_id, start, end) as any;

    const ingredientCost = this.db.prepare(`
      SELECT COALESCE(SUM(im.quantity * ing.cost_per_unit), 0) as total_cost
      FROM ingredient_movements im
      JOIN ingredients ing ON im.ingredient_id = ing.id
      WHERE im.tenant_id = ? AND im.type = 'usage' AND DATE(im.created_at) BETWEEN ? AND ?
    `).get(tenant.tenant_id, start, end) as any;

    const expenses = this.db.prepare(`
      SELECT COALESCE(SUM(amount),0) as total FROM expenses
      WHERE tenant_id = ? AND DATE(date) BETWEEN ? AND ? AND deleted_at IS NULL
    `).get(tenant.tenant_id, start, end) as any;

    return {
      revenue: revenue.total,
      orders: revenue.orders,
      ingredient_cost: ingredientCost.total_cost,
      expenses: expenses.total,
      gross_profit: revenue.total - ingredientCost.total_cost,
      net_profit: revenue.total - ingredientCost.total_cost - expenses.total,
    };
  }
}

// ─── Settings Service ──────────────────────────────────────────────────────────
class SettingsService {
  constructor(private db: Database.Database) {}

  get(): Record<string, string> {
    const tenant = getCachedTenant();
    const rows = this.db.prepare('SELECT key, value FROM settings WHERE tenant_id = ? OR tenant_id IS NULL').all(tenant?.tenant_id || null) as any[];
    const settings: Record<string, string> = {};
    for (const r of rows) {
      // If we have both a tenant-specific and a default setting, the tenant-specific one should ideally win.
      // Since we loop through all rows, and usually tenant-specific ones would be inserted later or we could sort.
      // For now, simpler:
      if (!settings[r.key] || r.tenant_id !== null) {
          settings[r.key] = r.value;
      }
    }
    return settings;
  }

  update(data: Record<string, string>): any {
    const tenant = getCachedTenant();
    if (!tenant) return { success: false };

    const stmt = this.db.prepare('INSERT OR REPLACE INTO settings (tenant_id, key, value, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)');
    for (const key of Object.keys(data)) {
      stmt.run(tenant.tenant_id, key, data[key]);
    }
    
    try {
      for (const key of Object.keys(data)) {
        const row = this.db.prepare('SELECT * FROM settings WHERE key=? AND tenant_id=?').get(key, tenant.tenant_id);
        enqueueSyncOperation('settings', 'UPDATE', row);
        
        // If loyalty threshold changed, update all existing cards instantly
        if (key === 'loyalty_reward_threshold') {
          const newThreshold = parseInt(data[key]);
          if (!isNaN(newThreshold)) {
            this.db.prepare('UPDATE loyalty_cards SET reward_threshold = ?, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ?')
              .run(newThreshold, tenant.tenant_id);
            
            // Note: We don't enqueue sync for every card here to avoid flooding the queue.
            // Other devices will sync this when they receive the same settings update.
          }
        }
      }
    } catch (err) { console.error('Settings sync error:', err); }

    return { success: true };
  }

  syncDown(payload: any[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO settings (tenant_id, key, value, updated_at)
      VALUES (?, ?, ?, ?)
    `);
    this.db.transaction((items: any[]) => {
      for (const item of items) {
        stmt.run(item.tenant_id, item.key, item.value, item.updated_at);
        
        // Apply loyalty threshold changes pulled from cloud
        if (item.key === 'loyalty_reward_threshold') {
          const newThreshold = parseInt(item.value);
          if (!isNaN(newThreshold)) {
            this.db.prepare('UPDATE loyalty_cards SET reward_threshold = ?, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ?')
              .run(newThreshold, item.tenant_id);
          }
        }
      }
    })(payload);
  }
}

// ─── License Service (Supabase + Offline Cache) ──────────────────────────────
import * as os from 'os';
import { supabase, isSupabaseConfigured } from './supabase';

function generateHardwareId(): string {
  // Generate a stable unique ID from hostname + first non-internal MAC address
  const interfaces = os.networkInterfaces();
  let mac = '';
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const info of iface) {
      if (!info.internal && info.mac && info.mac !== '00:00:00:00:00:00') {
        mac = info.mac;
        break;
      }
    }
    if (mac) break;
  }
  const raw = `${os.hostname()}-${mac}-${os.platform()}-${os.arch()}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

export class LicenseService {
  constructor(private db: Database.Database) {}

  // ─── Validate via Supabase (online) ────────────────────────────────────────
  private async validateViaSupabase(licenseKey: string): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Supabase not configured' };
    }

    try {
      const hardwareId = generateHardwareId();
      // 1a. Try licenses table first (proper license_key lookup)
      const { data: license, error: licErr } = await supabase
        .from('licenses')
        .select(`id, license_key, status, expires_at, features, current_activations, max_activations, tenant:tenants(id, business_name, tenant_code, status, subscription_plan)`)
        .eq('license_key', licenseKey)
        .maybeSingle();

      if (!licErr && license) {
        // Validate the license
        if (license.status !== 'active') return { success: false, error: `License is ${license.status}` };
        if (license.expires_at && new Date(license.expires_at) < new Date()) return { success: false, error: 'License has expired' };

        const tenant = Array.isArray(license.tenant) ? license.tenant[0] : license.tenant;
        if (!tenant) return { success: false, error: 'Tenant not found for this license' };
        if (tenant.status !== 'active') return { success: false, error: `Tenant account is ${tenant.status}` };
        if (license.max_activations && license.current_activations >= license.max_activations) {
          return { success: false, error: 'Maximum number of devices reached for this license' };
        }
        return { success: true, data: { license, tenant } };
      }

      // 1b. Fallback: try treating the input as a tenant_code (e.g. TEN-RYFZKZ)
      const { data: tenantByCode, error: tenErr } = await supabase
        .from('tenants')
        .select(`id, business_name, tenant_code, status, subscription_plan`)
        .eq('tenant_code', licenseKey)
        .maybeSingle();

      if (!tenErr && tenantByCode) {
        if (tenantByCode.status !== 'active') {
          return { success: false, error: `Tenant account is ${tenantByCode.status}` };
        }

        // Synthesize a license-like object from tenant data
        const syntheticLicense = {
          id: tenantByCode.id,
          license_key: licenseKey,
          status: 'active',
          expires_at: null,
          features: ['pos', 'inventory', 'reports', 'expenses'],
          current_activations: 0,
          max_activations: null,
        };
        return { success: true, data: { license: syntheticLicense, tenant: tenantByCode } };
      }

      return { success: false, error: 'Invalid license key or tenant code' };
    } catch (err: any) {
      return { success: false, error: 'Network error: ' + err.message };
    }
  }

  // ─── Device Check-In (pos_devices table in Supabase) ────────────────────────
  private async checkInDevice(hardwareId: string, licenseId: string): Promise<void> {
    if (!isSupabaseConfigured()) return;
    try {
      await supabase
        .from('pos_devices')
        .upsert({
          hardware_id: hardwareId,
          device_name: os.hostname(),
          license_id: licenseId,
          status: 'online',
          last_seen_at: new Date().toISOString(),
          registered_at: new Date().toISOString(), // Only set on first upsert
        }, { onConflict: 'hardware_id', ignoreDuplicates: false });
    } catch (_) {
      // Non-critical — don't block POS
    }
  }

  // ─── Save to local cache ────────────────────────────────────────────────────
  public saveToCache(licenseKey: string, payload: any): void {
    const keyHash = crypto.createHash('sha256').update(licenseKey).digest('hex');
    const encrypted = encryptText(JSON.stringify(payload));
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT OR REPLACE INTO license_cache (id, license_key_hash, license_id, status, expires_at, features, tenant_id, last_validated_at, encrypted_payload, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      keyHash,
      payload.licenseId,
      payload.status,
      payload.expiresAt,
      JSON.stringify(payload.features),
      payload.tenantId,
      now,
      encrypted
    );

    this.db.prepare(`
      INSERT OR REPLACE INTO tenant_cache (id, tenant_id, business_name, tenant_code, status, subscription_plan, last_synced_at, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      payload.tenantId,
      payload.cafeName,
      payload.tenantCode,
      payload.tenantStatus,
      payload.subscriptionPlan,
      now
    );

    const hardwareId = generateHardwareId();
    this.db.prepare(`
      INSERT OR REPLACE INTO pos_devices_local (id, hardware_id, device_name, status, last_seen_at, registered_at)
      VALUES (1, ?, ?, 'online', ?, ?)
    `).run(hardwareId, os.hostname(), now, now);

    // Also keep old settings for backward compatibility
    const stmt = this.db.prepare('INSERT OR REPLACE INTO settings (tenant_id, key, value, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)');
    stmt.run(payload.tenantId, 'license_status', 'active');
    stmt.run(payload.tenantId, 'license_data', encryptText(JSON.stringify({ licenseKey, tenantId: payload.tenantId, cafeName: payload.cafeName })));
    if (payload.cafeName) stmt.run(payload.tenantId, 'store_name', payload.cafeName);

    // CRITICAL: Synonimize with pos_offline_cache.db for global tenant visibility
    cacheTenantLocal({
      id: payload.tenantId,
      name: payload.cafeName,
      tenant_code: payload.tenantCode,
      status: payload.tenantStatus || 'active'
    });
    cacheDeviceLocal(hardwareId, os.hostname());
  }

  // ─── Read from local cache ──────────────────────────────────────────────────
  private readFromCache(licenseKey: string): { valid: boolean; data?: any; reason?: string } {
    try {
      const keyHash = crypto.createHash('sha256').update(licenseKey).digest('hex');
      const row = this.db.prepare('SELECT * FROM license_cache WHERE id = 1 AND license_key_hash = ?').get(keyHash) as any;
      if (!row) return { valid: false, reason: 'No cached license found' };

      // Check if cached license is expired
      if (row.expires_at && new Date(row.expires_at) < new Date()) {
        return { valid: false, reason: 'Cached license has expired' };
      }

      const decrypted = decryptText(row.encrypted_payload);
      if (!decrypted) return { valid: false, reason: 'Cache data is corrupted' };

      const tenant = this.db.prepare('SELECT * FROM tenant_cache WHERE id = 1').get() as any;

      return {
        valid: row.status === 'active',
        data: { ...JSON.parse(decrypted), tenantStatus: tenant?.status, cachedAt: row.last_validated_at }
      };
    } catch {
      return { valid: false, reason: 'Cache read error' };
    }
  }

  // ─── PUBLIC: validate (called on Activation Screen) ────────────────────────
  async validate(licenseKey: string): Promise<any> {
    if (!licenseKey || licenseKey.length < 8) {
      return { success: false, error: 'License key too short.' };
    }

    const hardwareId = generateHardwareId();

    // BYPASS FOR DEVELOPMENT
    if (licenseKey === 'DEV-BYPASS' || licenseKey === '12345678') {
      const payload = {
        licenseId: 'dev-license-id',
        licenseKey,
        status: 'active',
        expiresAt: null,
        features: ['pos', 'inventory', 'reports'],
        tenantId: 'dev-tenant-id',
        cafeName: 'Dev Local Cafe',
        tenantCode: 'DEV-CAFE',
        tenantStatus: 'active',
        subscriptionPlan: 'pro',
        activatedAt: new Date().toISOString(),
        mode: 'offline',
      };
      
      this.saveToCache(licenseKey, payload);
      this.db.prepare('UPDATE pos_devices_local SET last_seen_at = ?, status = ? WHERE id = 1')
        .run(new Date().toISOString(), 'online');

      return {
        success: true,
        mode: 'offline',
        tenant_id: 'dev-tenant-id',
        cafe_name: 'Dev Local Cafe',
        features: payload.features,
      };
    }

    // 1. Try Supabase first
    const online = await this.validateViaSupabase(licenseKey);

    if (online.success && online.data) {
      const { license, tenant } = online.data;
      const payload = {
        licenseId: license.id,
        licenseKey,
        status: 'active',
        expiresAt: license.expires_at,
        features: license.features || ['pos', 'inventory', 'reports'],
        tenantId: tenant.id,
        cafeName: tenant.business_name,
        tenantCode: tenant.tenant_code,
        tenantStatus: tenant.status,
        subscriptionPlan: tenant.subscription_plan,
        activatedAt: new Date().toISOString(),
        mode: 'online',
      };

      this.saveToCache(licenseKey, payload);
      await this.checkInDevice(hardwareId, license.id);

      // CRITICAL: Synchronize with pos_offline_cache.db for global visibility
      cacheTenantLocal({
        id: tenant.id,
        name: tenant.business_name,
        tenant_code: tenant.tenant_code,
        status: tenant.status || 'active'
      });
      cacheDeviceLocal(hardwareId, os.hostname());

      return {
        success: true,
        mode: 'online',
        tenant_id: tenant.id,
        cafe_name: tenant.business_name,
        features: payload.features,
      };
    }

    // 2. Supabase not configured or unreachable — try offline cache
    const cached = this.readFromCache(licenseKey);
    if (cached.valid && cached.data) {
      // Update local device last_seen
      this.db.prepare('UPDATE pos_devices_local SET last_seen_at = ?, status = ? WHERE id = 1')
        .run(new Date().toISOString(), 'online');

      return {
        success: true,
        mode: 'offline',
        tenant_id: cached.data.tenantId,
        cafe_name: cached.data.cafeName,
        features: cached.data.features,
        offline_reason: 'Offline mode — license validated from local cache',
      };
    }

    // 3. Complete failure — new activation needed, possibly with cache error or supabase error
    const errorReason = online.error && !online.error.includes('not configured') ? online.error : (cached.reason || 'Could not validate license');
    return { success: false, error: errorReason };
  }

  // ─── PUBLIC: getStatus (called on app startup) ──────────────────────────────
  getStatus(): any {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = 'license_status'").get() as any;
    if (!row || row.value !== 'active') return { active: false };

    const dataRow = this.db.prepare("SELECT value FROM settings WHERE key = 'license_data'").get() as any;
    if (!dataRow) return { active: false };

    const decrypted = decryptText(dataRow.value);
    if (!decrypted) return { active: false, reason: 'tampered' };

    const parsed = JSON.parse(decrypted);

    // Read tenant cache for fuller offline info
    const tenant = this.db.prepare('SELECT * FROM tenant_cache WHERE id = 1').get() as any;
    const device = this.db.prepare('SELECT * FROM pos_devices_local WHERE id = 1').get() as any;
    const licCache = this.db.prepare('SELECT * FROM license_cache WHERE id = 1').get() as any;

    // Check if license is expired in cache
    if (licCache?.expires_at && new Date(licCache.expires_at) < new Date()) {
      return { active: false, reason: 'expired' };
    }

    return {
      active: true,
      tenantId: parsed.tenantId,
      cafeName: parsed.cafeName || tenant?.business_name,
      tenantStatus: tenant?.status,
      hardwareId: device?.hardware_id,
      lastSeen: device?.last_seen_at,
      lastValidated: licCache?.last_validated_at,
    };
  }

  // ─── PUBLIC: periodicSync (called every 15 minutes when online) ─────────────
  async periodicSync(): Promise<{ synced: boolean; message?: string }> {
    if (!isSupabaseConfigured()) return { synced: false, message: 'Supabase not configured' };

    try {
      const hardwareId = generateHardwareId();
      const device = this.db.prepare('SELECT * FROM pos_devices_local WHERE id = 1').get() as any;
      const licCache = this.db.prepare('SELECT * FROM license_cache WHERE id = 1').get() as any;
      if (!licCache) return { synced: false, message: 'No cached license to sync' };

      // Update device last_seen in Supabase
      if (device) {
        await supabase.from('pos_devices')
          .update({ last_seen_at: new Date().toISOString(), status: 'online' })
          .eq('hardware_id', hardwareId);
      }

      // Update local cache last_seen
      this.db.prepare('UPDATE pos_devices_local SET last_seen_at = ?, status = ? WHERE id = 1')
        .run(new Date().toISOString(), 'online');

      return { synced: true };
    } catch (err: any) {
      return { synced: false, message: err.message };
    }
  }
}

// ─── Loyalty Service ─────────────────────────────────────────────────────────────
class LoyaltyService {
  constructor(private db: Database.Database) {}

  getCardByCode(code: string): any {
    const tenant = getCachedTenant();
    if (!tenant) return null;

    // Strip "LOYALTY-" prefix if present
    const cleanCode = code.startsWith('LOYALTY-') ? code : `LOYALTY-${code}`;
    return this.db.prepare(`
      SELECT lc.*, c.name as customer_name, c.phone as customer_phone
      FROM loyalty_cards lc
      JOIN customers c ON lc.customer_id = c.id
      WHERE lc.tenant_id = ? AND (lc.loyalty_code = ? OR lc.loyalty_code = ?)
    `).get(tenant.tenant_id, cleanCode, code.replace('LOYALTY-', ''));
  }

  createCard(customerId: number, code: string): any {
    const tenant = getCachedTenant();
    if (!tenant) return { success: false };

    const thresholdSetting = this.db.prepare("SELECT value FROM settings WHERE key='loyalty_reward_threshold' AND tenant_id = ?").get(tenant.tenant_id) as any;
    const threshold = thresholdSetting ? parseInt(thresholdSetting.value) : 10;

    const r = this.db.prepare('INSERT INTO loyalty_cards (tenant_id, customer_id, loyalty_code, reward_threshold) VALUES (?,?,?,?)')
      .run(tenant.tenant_id, customerId, code, threshold);

    try {
      const fullRow = this.db.prepare('SELECT * FROM loyalty_cards WHERE id=?').get(r.lastInsertRowid);
      enqueueSyncOperation('loyalty_cards', 'INSERT', fullRow);
    } catch (err) { console.error('Loyalty card sync error:', err); }

    return { success: true, id: r.lastInsertRowid };
  }

  getCardByCustomerId(customerId: number): any {
    const tenant = getCachedTenant();
    if (!tenant) return null;
    return this.db.prepare('SELECT * FROM loyalty_cards WHERE customer_id = ? AND tenant_id = ?').get(customerId, tenant.tenant_id);
  }

  addStamps(customerId: number, stamps: number, orderId?: number): any {
    const tenant = getCachedTenant();
    if (!tenant) return { success: false };

    const card = this.getCardByCustomerId(customerId);
    if (!card) return { success: false, error: 'No loyalty card found' };

    const newStamps = card.stamps + stamps;
    this.db.prepare('UPDATE loyalty_cards SET stamps = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(newStamps, card.id);

    // Sync back to customers table to show on cards/lists
    this.db.prepare('UPDATE customers SET loyalty_points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(newStamps, customerId);

    const tr = this.db.prepare('INSERT INTO loyalty_transactions (tenant_id, customer_id, order_id, stamps_added) VALUES (?,?,?,?)')
      .run(tenant.tenant_id, customerId, orderId || null, stamps);

    try {
      const fullCard = this.db.prepare('SELECT * FROM loyalty_cards WHERE id = ?').get(card.id);
      enqueueSyncOperation('loyalty_cards', 'UPDATE', fullCard);
      
      const fullCust = this.db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
      enqueueSyncOperation('customers', 'UPDATE', fullCust);

      const fullTx = this.db.prepare('SELECT * FROM loyalty_transactions WHERE id = ?').get(tr.lastInsertRowid);
      enqueueSyncOperation('loyalty_transactions', 'INSERT', fullTx);
    } catch (err) { console.error('Loyalty update sync error:', err); }

    return { success: true, stamps: newStamps };
  }

  redeemReward(customerId: number, orderId?: number): any {
    const tenant = getCachedTenant();
    if (!tenant) return { success: false };

    const card = this.getCardByCustomerId(customerId);
    if (!card) return { success: false, error: 'No loyalty card found' };
    if (card.stamps < card.reward_threshold) return { success: false, error: 'Insufficient stamps' };

    // ROLLOVER LOGIC: Deduct threshold, any extra stamps go to the next card
    const remainingStamps = Math.max(0, card.stamps - card.reward_threshold);
    
    this.db.prepare('UPDATE loyalty_cards SET stamps = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(remainingStamps, card.id);

    // Sync back to customers table
    this.db.prepare('UPDATE customers SET loyalty_points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(remainingStamps, customerId);

    const tr = this.db.prepare('INSERT INTO loyalty_transactions (tenant_id, customer_id, order_id, reward_redeemed) VALUES (?,?,?,?)')
      .run(tenant.tenant_id, customerId, orderId || null, 1);

    try {
      const fullCard = this.db.prepare('SELECT * FROM loyalty_cards WHERE id = ?').get(card.id);
      enqueueSyncOperation('loyalty_cards', 'UPDATE', fullCard);
      
      const fullCust = this.db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
      enqueueSyncOperation('customers', 'UPDATE', fullCust);

      const fullTx = this.db.prepare('SELECT * FROM loyalty_transactions WHERE id = ?').get(tr.lastInsertRowid);
      enqueueSyncOperation('loyalty_transactions', 'INSERT', fullTx);
    } catch (err) { console.error('Loyalty redemption sync error:', err); }

    return { success: true, stamps: remainingStamps };
  }

  getTransactions(customerId: number): any[] {
    const tenant = getCachedTenant();
    if (!tenant) return [];
    return this.db.prepare('SELECT * FROM loyalty_transactions WHERE customer_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 50')
      .all(customerId, tenant.tenant_id);
  }

  syncDown(cards: any[]): void {
    const insert = this.db.prepare(`
      INSERT INTO loyalty_cards (tenant_id, customer_id, loyalty_code, stamps, reward_threshold, cloud_id, created_at, updated_at)
      VALUES (@tenant_id, @customer_id, @loyalty_code, @stamps, @reward_threshold, @cloud_id, @created_at, @updated_at)
      ON CONFLICT(tenant_id, loyalty_code) DO UPDATE SET
        customer_id = excluded.customer_id,
        stamps = excluded.stamps,
        reward_threshold = excluded.reward_threshold,
        cloud_id = excluded.cloud_id,
        updated_at = excluded.updated_at
    `);
    
    // Also sync the stamps back to customers table for UI consistency
    const syncToCust = this.db.prepare('UPDATE customers SET loyalty_points = ? WHERE id = ?');
    
    // We need to resolve the local customer_id from the cloud customer_id (UUID)
    const resolveCust = this.db.prepare('SELECT id FROM customers WHERE cloud_id = ?');

    const transaction = this.db.transaction((items) => {
      for (const item of items) {
        const localCust = resolveCust.get(item.customer_id) as any;
        if (localCust) {
          const payload = { ...item, customer_id: localCust.id, cloud_id: item.id };
          insert.run(payload);
          syncToCust.run(item.stamps || 0, localCust.id);
        }
      }
    });
    
    transaction(cards);
  }

  syncDownTransactions(txs: any[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO loyalty_transactions (tenant_id, customer_id, order_id, stamps_added, reward_redeemed, cloud_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cloud_id) DO UPDATE SET created_at = excluded.created_at
    `);
    
    const resolveCust = this.db.prepare('SELECT id FROM customers WHERE cloud_id = ?');

    this.db.transaction((items) => {
      for (const item of items) {
        const localCust = resolveCust.get(item.customer_id) as any;
        if (localCust) {
          stmt.run(item.tenant_id, localCust.id, item.order_id || null, item.stamps_added || 0, item.reward_redeemed || 0, item.id, item.created_at);
        }
      }
    })(txs);
  }
}

