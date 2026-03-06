import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

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

  initialize(): void {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = 10000');
    this.createSchema();
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
  }

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        permissions TEXT NOT NULL DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        role_id INTEGER NOT NULL REFERENCES roles(id),
        is_active INTEGER NOT NULL DEFAULT 1,
        last_login DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        color TEXT DEFAULT '#e25a26',
        icon TEXT DEFAULT 'coffee',
        sort_order INTEGER DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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
        name TEXT NOT NULL,
        description TEXT,
        sku TEXT UNIQUE,
        category_id INTEGER REFERENCES categories(id),
        price REAL NOT NULL DEFAULT 0,
        cost_price REAL DEFAULT 0,
        tax_rate REAL DEFAULT 0,
        image TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        track_inventory INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL UNIQUE REFERENCES products(id),
        quantity REAL NOT NULL DEFAULT 0,
        min_quantity REAL DEFAULT 5,
        unit TEXT DEFAULT 'pcs',
        supplier_id INTEGER REFERENCES suppliers(id),
        last_restocked DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS stock_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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
        name TEXT NOT NULL,
        phone TEXT UNIQUE,
        email TEXT,
        address TEXT,
        loyalty_points INTEGER DEFAULT 0,
        total_spent REAL DEFAULT 0,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_number TEXT NOT NULL UNIQUE,
        customer_id INTEGER REFERENCES customers(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('pending','completed','voided','refunded')),
        subtotal REAL NOT NULL DEFAULT 0,
        discount_type TEXT CHECK(discount_type IN ('percent','fixed')),
        discount_value REAL DEFAULT 0,
        discount_amount REAL DEFAULT 0,
        tax_amount REAL DEFAULT 0,
        total REAL NOT NULL DEFAULT 0,
        payment_method TEXT NOT NULL DEFAULT 'cash' CHECK(payment_method IN ('cash','card','online','split')),
        amount_paid REAL DEFAULT 0,
        change_amount REAL DEFAULT 0,
        notes TEXT,
        void_reason TEXT,
        void_at DATETIME,
        receipt_printed INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        product_name TEXT NOT NULL,
        unit_price REAL NOT NULL,
        quantity REAL NOT NULL,
        discount_percent REAL DEFAULT 0,
        tax_rate REAL DEFAULT 0,
        line_total REAL NOT NULL,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        method TEXT NOT NULL CHECK(method IN ('cash','card','online')),
        amount REAL NOT NULL,
        reference TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ── Recipe & Ingredient System ─────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS ingredients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
        quantity REAL NOT NULL,
        unit TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(product_id, ingredient_id)
      );

      CREATE TABLE IF NOT EXISTS modifiers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        is_required INTEGER DEFAULT 0,
        allow_multiple INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS modifier_options (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        modifier_id INTEGER NOT NULL REFERENCES modifiers(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        price_adjustment REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS product_modifiers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        modifier_id INTEGER NOT NULL REFERENCES modifiers(id) ON DELETE CASCADE,
        UNIQUE(product_id, modifier_id)
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
    `);
  }

  private seedDefaults(): void {
    // Roles
    const existingRoles = this.db.prepare('SELECT COUNT(*) as c FROM roles').get() as any;
    if (existingRoles.c === 0) {
      const adminPerms = JSON.stringify(['*']);
      const managerPerms = JSON.stringify(['dashboard','pos','menu','inventory','reports','staff','settings']);
      const cashierPerms = JSON.stringify(['pos','dashboard']);
      this.db.prepare(`INSERT INTO roles (name, permissions) VALUES (?,?)`).run('Admin', adminPerms);
      this.db.prepare(`INSERT INTO roles (name, permissions) VALUES (?,?)`).run('Manager', managerPerms);
      this.db.prepare(`INSERT INTO roles (name, permissions) VALUES (?,?)`).run('Cashier', cashierPerms);
    }

    // Default admin user
    const existingUsers = this.db.prepare('SELECT COUNT(*) as c FROM users').get() as any;
    if (existingUsers.c === 0) {
      const hash = bcrypt.hashSync('admin123', 10);
      const adminRole = this.db.prepare('SELECT id FROM roles WHERE name = ?').get('Admin') as any;
      this.db.prepare(`
        INSERT INTO users (username, password_hash, full_name, email, role_id)
        VALUES (?,?,?,?,?)
      `).run('admin', hash, 'Administrator', 'admin@cloudncream.com', adminRole.id);
    }

    // Default categories
    const existingCats = this.db.prepare('SELECT COUNT(*) as c FROM categories').get() as any;
    if (existingCats.c === 0) {
      const cats = [
        ['Hot Drinks', 'Coffees and teas', '#e25a26', 'coffee', 1],
        ['Cold Drinks', 'Iced beverages', '#3b82f6', 'glass-water', 2],
        ['Pastries', 'Fresh baked goods', '#f59e0b', 'cake', 3],
        ['Sandwiches', 'Light meals', '#10b981', 'sandwich', 4],
        ['Desserts', 'Sweet treats', '#ec4899', 'ice-cream', 5],
        ['Extras', 'Add-ons and extras', '#8b5cf6', 'plus-circle', 6],
      ];
      for (const [name, desc, color, icon, sort] of cats) {
        this.db.prepare(`INSERT INTO categories (name, description, color, icon, sort_order) VALUES (?,?,?,?,?)`).run(name, desc, color, icon, sort);
      }
    }

    // Default products
    const existingProds = this.db.prepare('SELECT COUNT(*) as c FROM products').get() as any;
    if (existingProds.c === 0) {
      const catMap = {} as Record<string, number>;
      const cats = this.db.prepare('SELECT id, name FROM categories').all() as any[];
      for (const c of cats) catMap[c.name] = c.id;

      const products = [
        ['Espresso', 'Rich single shot espresso', 'ESP001', catMap['Hot Drinks'], 250, 80, 0],
        ['Cappuccino', 'Espresso with steamed milk foam', 'CAP001', catMap['Hot Drinks'], 380, 100, 0],
        ['Latte', 'Espresso with creamy steamed milk', 'LAT001', catMap['Hot Drinks'], 400, 110, 0],
        ['Americano', 'Espresso diluted with hot water', 'AME001', catMap['Hot Drinks'], 320, 90, 0],
        ['Green Tea', 'Premium Japanese green tea', 'GT001', catMap['Hot Drinks'], 280, 60, 0],
        ['Cold Brew', '24hr cold-steeped coffee', 'CB001', catMap['Cold Drinks'], 450, 120, 0],
        ['Iced Latte', 'Latte served over ice', 'IL001', catMap['Cold Drinks'], 430, 115, 0],
        ['Mango Smoothie', 'Fresh mango blend', 'MS001', catMap['Cold Drinks'], 380, 90, 0],
        ['Croissant', 'Buttery flaky croissant', 'CRO001', catMap['Pastries'], 250, 80, 0],
        ['Cinnamon Roll', 'Warm cinnamon roll with icing', 'CIN001', catMap['Pastries'], 320, 90, 0],
        ['Blueberry Muffin', 'Fresh blueberry muffin', 'MUF001', catMap['Pastries'], 280, 75, 0],
        ['Club Sandwich', 'Triple-decker club sandwich', 'CS001', catMap['Sandwiches'], 650, 200, 0],
        ['Grilled Chicken', 'Grilled chicken with veggies', 'GC001', catMap['Sandwiches'], 580, 180, 0],
        ['Chocolate Cake', 'Rich dark chocolate slice', 'CC001', catMap['Desserts'], 420, 130, 0],
        ['Cheesecake', 'New York style cheesecake', 'CHK001', catMap['Desserts'], 480, 140, 0],
        ['Extra Shot', 'Additional espresso shot', 'EX001', catMap['Extras'], 80, 20, 0],
        ['Oat Milk', 'Plant-based milk alternative', 'OAT001', catMap['Extras'], 60, 15, 0],
      ];

      for (const [name, desc, sku, catId, price, cost, tax] of products) {
        const result = this.db.prepare(`
          INSERT INTO products (name, description, sku, category_id, price, cost_price, tax_rate)
          VALUES (?,?,?,?,?,?,?)
        `).run(name, desc, sku, catId, price, cost, tax);

        this.db.prepare(`
          INSERT INTO inventory (product_id, quantity, min_quantity, unit)
          VALUES (?,?,?,?)
        `).run(result.lastInsertRowid, 50, 10, 'pcs');
      }
    }

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
      ];
      for (const [key, value] of defaults) {
        this.db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?,?)').run(key, value);
      }
    }

    // Default ingredients
    const ingExist = this.db.prepare('SELECT COUNT(*) as c FROM ingredients').get() as any;
    if (ingExist.c === 0) {
      const ingredients = [
        ['Espresso Beans',   'g',  5000,  500,  0.08],
        ['Whole Milk',       'ml', 10000, 1000, 0.005],
        ['Oat Milk',         'ml', 3000,  500,  0.009],
        ['Water',            'ml', 50000, 5000, 0.0001],
        ['Sugar',            'g',  3000,  300,  0.003],
        ['Green Tea Leaves', 'g',  1000,  100,  0.05],
        ['Vanilla Syrup',    'ml', 1000,  100,  0.02],
        ['Caramel Syrup',    'ml', 1000,  100,  0.02],
        ['Chocolate Sauce',  'ml', 800,   80,   0.03],
        ['Ice',              'g',  20000, 2000, 0.001],
        ['Mango Pulp',       'g',  2000,  200,  0.02],
        ['Flour',            'g',  5000,  500,  0.002],
        ['Butter',           'g',  2000,  200,  0.015],
        ['Cream Cheese',     'g',  1000,  100,  0.05],
        ['Blueberries',      'g',  500,   100,  0.04],
        ['Chicken Breast',   'g',  3000,  300,  0.04],
        ['Bread Loaf',       'pcs',20,    5,    15],
        ['Cake Base',        'pcs',10,    2,    80],
      ];
      for (const [name, unit, stock, reorder, cost] of ingredients) {
        this.db.prepare(
          'INSERT INTO ingredients (name, unit, current_stock, reorder_level, cost_per_unit) VALUES (?,?,?,?,?)'
        ).run(name, unit, stock, reorder, cost);
      }

      // Seed recipes for seeded products
      const get = (n: string) => (this.db.prepare('SELECT id FROM ingredients WHERE name = ?').get(n) as any)?.id;
      const getProd = (sku: string) => (this.db.prepare('SELECT id FROM products WHERE sku = ?').get(sku) as any)?.id;

      const recipeMap: [string, [string, number][]][] = [
        ['ESP001', [['Espresso Beans', 18], ['Water', 30]]],
        ['CAP001', [['Espresso Beans', 18], ['Whole Milk', 120], ['Water', 30]]],
        ['LAT001', [['Espresso Beans', 18], ['Whole Milk', 200], ['Water', 30], ['Sugar', 5]]],
        ['AME001', [['Espresso Beans', 18], ['Water', 200]]],
        ['GT001',  [['Green Tea Leaves', 3], ['Water', 250], ['Sugar', 5]]],
        ['CB001',  [['Espresso Beans', 25], ['Water', 300], ['Ice', 150]]],
        ['IL001',  [['Espresso Beans', 18], ['Whole Milk', 200], ['Ice', 120], ['Sugar', 5]]],
        ['MS001',  [['Mango Pulp', 150], ['Whole Milk', 100], ['Ice', 100], ['Sugar', 10]]],
        ['CRO001', [['Flour', 80], ['Butter', 40]]],
        ['CIN001', [['Flour', 100], ['Butter', 30], ['Sugar', 20]]],
        ['MUF001', [['Flour', 90], ['Butter', 25], ['Sugar', 20], ['Blueberries', 30]]],
        ['CS001',  [['Bread Loaf', 3], ['Chicken Breast', 100], ['Butter', 10]]],
        ['GC001',  [['Chicken Breast', 180], ['Butter', 15]]],
        ['CC001',  [['Cake Base', 1], ['Chocolate Sauce', 30]]],
        ['CHK001', [['Cake Base', 1], ['Cream Cheese', 80]]],
      ];

      const insertRecipe = this.db.prepare(
        'INSERT OR IGNORE INTO recipes (product_id, ingredient_id, quantity, unit) VALUES (?,?,?,?)'
      );
      for (const [sku, ingredients2] of recipeMap) {
        const pid = getProd(sku);
        if (!pid) continue;
        for (const [ingName, qty] of ingredients2) {
          const iid = get(ingName);
          if (!iid) continue;
          const unit2 = (this.db.prepare('SELECT unit FROM ingredients WHERE id=?').get(iid) as any)?.unit;
          insertRecipe.run(pid, iid, qty, unit2);
        }
      }

      // Seed modifiers
      const sizeMod = this.db.prepare('INSERT INTO modifiers (name, description, is_required) VALUES (?,?,?)').run('Size', 'Choose your cup size', 1);
      const sizeId = sizeMod.lastInsertRowid as number;
      this.db.prepare('INSERT INTO modifier_options (modifier_id, name, price_adjustment) VALUES (?,?,?)').run(sizeId, 'Small', -30);
      this.db.prepare('INSERT INTO modifier_options (modifier_id, name, price_adjustment) VALUES (?,?,?)').run(sizeId, 'Medium', 0);
      this.db.prepare('INSERT INTO modifier_options (modifier_id, name, price_adjustment) VALUES (?,?,?)').run(sizeId, 'Large', 50);

      const milkMod = this.db.prepare('INSERT INTO modifiers (name, description) VALUES (?,?)').run('Milk Type', 'Milk alternative');
      const milkId = milkMod.lastInsertRowid as number;
      this.db.prepare('INSERT INTO modifier_options (modifier_id, name, price_adjustment) VALUES (?,?,?)').run(milkId, 'Whole Milk', 0);
      this.db.prepare('INSERT INTO modifier_options (modifier_id, name, price_adjustment) VALUES (?,?,?)').run(milkId, 'Oat Milk', 60);
      this.db.prepare('INSERT INTO modifier_options (modifier_id, name, price_adjustment) VALUES (?,?,?)').run(milkId, 'No Milk', -20);

      const sugarMod = this.db.prepare('INSERT INTO modifiers (name, description) VALUES (?,?)').run('Sugar Level', 'Sweetness preference');
      const sugarId = sugarMod.lastInsertRowid as number;
      this.db.prepare('INSERT INTO modifier_options (modifier_id, name, price_adjustment) VALUES (?,?,?)').run(sugarId, 'No Sugar', 0);
      this.db.prepare('INSERT INTO modifier_options (modifier_id, name, price_adjustment) VALUES (?,?,?)').run(sugarId, 'Less Sugar', 0);
      this.db.prepare('INSERT INTO modifier_options (modifier_id, name, price_adjustment) VALUES (?,?,?)').run(sugarId, 'Normal Sugar', 0);
      this.db.prepare('INSERT INTO modifier_options (modifier_id, name, price_adjustment) VALUES (?,?,?)').run(sugarId, 'Extra Sugar', 0);

      // Link modifiers to coffee products
      const coffeeSKUs = ['ESP001','CAP001','LAT001','AME001','CB001','IL001'];
      for (const sku of coffeeSKUs) {
        const pid = getProd(sku);
        if (!pid) continue;
        this.db.prepare('INSERT OR IGNORE INTO product_modifiers (product_id, modifier_id) VALUES (?,?)').run(pid, sizeId);
        this.db.prepare('INSERT OR IGNORE INTO product_modifiers (product_id, modifier_id) VALUES (?,?)').run(pid, milkId);
        this.db.prepare('INSERT OR IGNORE INTO product_modifiers (product_id, modifier_id) VALUES (?,?)').run(pid, sugarId);
      }
    }
  }
}

// ─── Auth Service ──────────────────────────────────────────────────────────────
class AuthService {
  constructor(private db: Database.Database) {}

  login(username: string, password: string): any {
    const user = this.db.prepare(`
      SELECT u.*, r.name as role_name, r.permissions
      FROM users u JOIN roles r ON u.role_id = r.id
      WHERE u.username = ? AND u.is_active = 1 AND u.deleted_at IS NULL
    `).get(username) as any;

    if (!user) return { success: false, message: 'Invalid credentials' };
    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) return { success: false, message: 'Invalid credentials' };

    this.db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
    const { password_hash, ...safeUser } = user;
    return { success: true, user: { ...safeUser, permissions: JSON.parse(user.permissions) } };
  }

  logout(): { success: boolean } { return { success: true }; }
}

// ─── Users Service ─────────────────────────────────────────────────────────────
class UsersService {
  constructor(private db: Database.Database) {}

  getAll(): any[] {
    return this.db.prepare(`
      SELECT u.id, u.username, u.full_name, u.email, u.phone,
             u.role_id, r.name as role_name, u.is_active, u.last_login, u.created_at
      FROM users u JOIN roles r ON u.role_id = r.id
      WHERE u.deleted_at IS NULL ORDER BY u.full_name
    `).all();
  }

  create(data: any): any {
    const hash = bcrypt.hashSync(data.password, 10);
    const result = this.db.prepare(`
      INSERT INTO users (username, password_hash, full_name, email, phone, role_id)
      VALUES (?,?,?,?,?,?)
    `).run(data.username, hash, data.full_name, data.email || null, data.phone || null, data.role_id);
    return { success: true, id: result.lastInsertRowid };
  }

  update(id: number, data: any): any {
    this.db.prepare(`
      UPDATE users SET full_name=?, email=?, phone=?, role_id=?, is_active=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(data.full_name, data.email || null, data.phone || null, data.role_id, data.is_active ? 1 : 0, id);
    return { success: true };
  }

  delete(id: number): any {
    this.db.prepare('UPDATE users SET deleted_at=CURRENT_TIMESTAMP WHERE id=?').run(id);
    return { success: true };
  }

  changePassword(id: number, newPassword: string): any {
    const hash = bcrypt.hashSync(newPassword, 10);
    this.db.prepare('UPDATE users SET password_hash=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(hash, id);
    return { success: true };
  }
}

// ─── Categories Service ────────────────────────────────────────────────────────
class CategoriesService {
  constructor(private db: Database.Database) {}

  getAll(): any[] {
    return this.db.prepare(`
      SELECT c.*, COUNT(p.id) as product_count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id AND p.deleted_at IS NULL
      WHERE c.deleted_at IS NULL
      GROUP BY c.id ORDER BY c.sort_order, c.name
    `).all();
  }

  create(data: any): any {
    const result = this.db.prepare(`
      INSERT INTO categories (name, description, color, icon, sort_order)
      VALUES (?,?,?,?,?)
    `).run(data.name, data.description || null, data.color || '#e25a26', data.icon || 'coffee', data.sort_order || 0);
    return { success: true, id: result.lastInsertRowid };
  }

  update(id: number, data: any): any {
    this.db.prepare(`
      UPDATE categories SET name=?, description=?, color=?, icon=?, sort_order=?, is_active=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(data.name, data.description || null, data.color, data.icon, data.sort_order || 0, data.is_active ? 1 : 0, id);
    return { success: true };
  }

  delete(id: number): any {
    this.db.prepare('UPDATE categories SET deleted_at=CURRENT_TIMESTAMP WHERE id=?').run(id);
    return { success: true };
  }
}

// ─── Products Service ──────────────────────────────────────────────────────────
class ProductsService {
  constructor(private db: Database.Database) {}

  getAll(): any[] {
    return this.db.prepare(`
      SELECT p.*, c.name as category_name, c.color as category_color,
             i.quantity as stock, i.min_quantity, i.unit
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN inventory i ON i.product_id = p.id
      WHERE p.deleted_at IS NULL
      ORDER BY c.sort_order, p.name
    `).all();
  }

  getByCategory(categoryId: number): any[] {
    return this.db.prepare(`
      SELECT p.*, c.name as category_name, i.quantity as stock, i.min_quantity, i.unit
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN inventory i ON i.product_id = p.id
      WHERE p.category_id = ? AND p.is_active = 1 AND p.deleted_at IS NULL
      ORDER BY p.name
    `).all(categoryId);
  }

  search(query: string): any[] {
    const q = `%${query}%`;
    return this.db.prepare(`
      SELECT p.*, c.name as category_name, i.quantity as stock
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN inventory i ON i.product_id = p.id
      WHERE (p.name LIKE ? OR p.sku LIKE ? OR p.description LIKE ?)
        AND p.is_active = 1 AND p.deleted_at IS NULL
      LIMIT 20
    `).all(q, q, q);
  }

  create(data: any): any {
    const result = this.db.prepare(`
      INSERT INTO products (name, description, sku, category_id, price, cost_price, tax_rate, track_inventory)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(data.name, data.description || null, data.sku || null, data.category_id, data.price, data.cost_price || 0, data.tax_rate || 0, data.track_inventory ? 1 : 0);

    if (data.track_inventory) {
      this.db.prepare(`
        INSERT INTO inventory (product_id, quantity, min_quantity, unit)
        VALUES (?,?,?,?)
      `).run(result.lastInsertRowid, data.initial_stock || 0, data.min_quantity || 5, data.unit || 'pcs');
    }
    return { success: true, id: result.lastInsertRowid };
  }

  update(id: number, data: any): any {
    this.db.prepare(`
      UPDATE products SET name=?, description=?, sku=?, category_id=?, price=?, cost_price=?,
             tax_rate=?, is_active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).run(data.name, data.description || null, data.sku || null, data.category_id, data.price, data.cost_price || 0, data.tax_rate || 0, data.is_active ? 1 : 0, id);

    if (data.min_quantity !== undefined) {
      this.db.prepare('UPDATE inventory SET min_quantity=?, unit=? WHERE product_id=?').run(data.min_quantity, data.unit || 'pcs', id);
    }
    return { success: true };
  }

  delete(id: number): any {
    this.db.prepare('UPDATE products SET deleted_at=CURRENT_TIMESTAMP WHERE id=?').run(id);
    return { success: true };
  }
}

// ─── Orders Service ────────────────────────────────────────────────────────────
class OrdersService {
  constructor(private db: Database.Database) {}

  create(data: any): any {
    const now = new Date();
    const orderNumber = `ORD-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(Date.now()).slice(-6)}`;

    const createOrder = this.db.transaction((order: any) => {
      const result = this.db.prepare(`
        INSERT INTO orders (order_number, customer_id, user_id, status, subtotal,
          discount_type, discount_value, discount_amount, tax_amount, total,
          payment_method, amount_paid, change_amount, notes)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        orderNumber, order.customer_id || null, order.user_id, 'completed',
        order.subtotal, order.discount_type || null, order.discount_value || 0,
        order.discount_amount || 0, order.tax_amount || 0, order.total,
        order.payment_method, order.amount_paid, order.change_amount || 0, order.notes || null
      );

      const orderId = result.lastInsertRowid as number;

      // Insert items, deduct product inventory AND recipe ingredients
      for (const item of order.items) {
        this.db.prepare(`
          INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, discount_percent, tax_rate, line_total, notes)
          VALUES (?,?,?,?,?,?,?,?,?)
        `).run(orderId, item.product_id, item.product_name, item.unit_price, item.quantity,
               item.discount_percent || 0, item.tax_rate || 0, item.line_total, item.notes || null);

        // ── Deduct product-level inventory (finished goods) ──────────
        const inv = this.db.prepare('SELECT quantity FROM inventory WHERE product_id = ?').get(item.product_id) as any;
        if (inv) {
          const newQty = Math.max(0, inv.quantity - item.quantity);
          this.db.prepare('UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?').run(newQty, item.product_id);
          this.db.prepare(`
            INSERT INTO stock_movements (product_id, type, quantity, before_qty, after_qty, reference, user_id)
            VALUES (?,?,?,?,?,?,?)
          `).run(item.product_id, 'out', item.quantity, inv.quantity, newQty, orderNumber, order.user_id);
        }

        // ── Deduct recipe ingredients ────────────────────────────────
        const recipeRows = this.db.prepare(
          'SELECT r.ingredient_id, r.quantity, r.unit FROM recipes r WHERE r.product_id = ?'
        ).all(item.product_id) as any[];

        for (const row of recipeRows) {
          // Apply modifier adjustments
          let ingQtyPerUnit = row.quantity;
          if (item.modifier_option_ids && item.modifier_option_ids.length > 0) {
            for (const optId of item.modifier_option_ids) {
              const adj = this.db.prepare(
                'SELECT quantity_adjustment FROM recipe_modifier_adjustments WHERE modifier_option_id=? AND ingredient_id=?'
              ).get(optId, row.ingredient_id) as any;
              if (adj) ingQtyPerUnit += adj.quantity_adjustment;
            }
          }

          const totalIngQty = ingQtyPerUnit * item.quantity;
          const ing = this.db.prepare('SELECT current_stock FROM ingredients WHERE id=?').get(row.ingredient_id) as any;
          if (ing) {
            const beforeQty = ing.current_stock;
            const afterQty = Math.max(0, beforeQty - totalIngQty);
            this.db.prepare(
              'UPDATE ingredients SET current_stock=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'
            ).run(afterQty, row.ingredient_id);
            this.db.prepare(`
              INSERT INTO ingredient_movements (ingredient_id, type, quantity, before_qty, after_qty, reference, user_id)
              VALUES (?,?,?,?,?,?,?)
            `).run(row.ingredient_id, 'usage', totalIngQty, beforeQty, afterQty, orderNumber, order.user_id);
          }
        }
      }

      // Insert payment(s)
      if (order.payments) {
        for (const p of order.payments) {
          this.db.prepare('INSERT INTO payments (order_id, method, amount, reference) VALUES (?,?,?,?)').run(orderId, p.method, p.amount, p.reference || null);
        }
      } else {
        this.db.prepare('INSERT INTO payments (order_id, method, amount) VALUES (?,?,?)').run(orderId, order.payment_method, order.amount_paid);
      }

      // Update customer stats
      if (order.customer_id) {
        this.db.prepare(`
          UPDATE customers SET total_spent = total_spent + ?, loyalty_points = loyalty_points + ?
          WHERE id = ?
        `).run(order.total, Math.floor(order.total / 100), order.customer_id);
      }

      return { success: true, id: orderId, order_number: orderNumber };
    });

    return createOrder(data);
  }

  getAll(): any[] {
    return this.db.prepare(`
      SELECT o.*, u.full_name as cashier_name, c.name as customer_name,
             COUNT(oi.id) as item_count
      FROM orders o
      JOIN users u ON o.user_id = u.id
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.status != 'voided' OR o.status = 'voided'
      GROUP BY o.id
      ORDER BY o.created_at DESC LIMIT 200
    `).all();
  }

  getById(id: number): any {
    const order = this.db.prepare(`
      SELECT o.*, u.full_name as cashier_name, c.name as customer_name
      FROM orders o JOIN users u ON o.user_id = u.id
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.id = ?
    `).get(id) as any;

    if (!order) return null;
    order.items = this.db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
    order.payments = this.db.prepare('SELECT * FROM payments WHERE order_id = ?').all(id);
    return order;
  }

  getByDateRange(start: string, end: string): any[] {
    return this.db.prepare(`
      SELECT o.*, u.full_name as cashier_name
      FROM orders o JOIN users u ON o.user_id = u.id
      WHERE DATE(o.created_at) BETWEEN ? AND ? AND o.status = 'completed'
      ORDER BY o.created_at DESC
    `).all(start, end);
  }

  void(id: number, reason: string): any {
    const items = this.db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id) as any[];
    const orderRow = this.db.prepare('SELECT order_number FROM orders WHERE id=?').get(id) as any;
    // Restore product inventory
    for (const item of items) {
      const inv = this.db.prepare('SELECT quantity FROM inventory WHERE product_id = ?').get(item.product_id) as any;
      if (inv) {
        const newQty = inv.quantity + item.quantity;
        this.db.prepare('UPDATE inventory SET quantity = ? WHERE product_id = ?').run(newQty, item.product_id);
      }
      // Restore ingredient stock
      const recipeRows = this.db.prepare(
        'SELECT ingredient_id, quantity FROM recipes WHERE product_id = ?'
      ).all(item.product_id) as any[];
      for (const row of recipeRows) {
        const totalQty = row.quantity * item.quantity;
        const ing = this.db.prepare('SELECT current_stock FROM ingredients WHERE id=?').get(row.ingredient_id) as any;
        if (ing) {
          const after = ing.current_stock + totalQty;
          this.db.prepare('UPDATE ingredients SET current_stock=? WHERE id=?').run(after, row.ingredient_id);
          this.db.prepare(`
            INSERT INTO ingredient_movements (ingredient_id, type, quantity, before_qty, after_qty, reference)
            VALUES (?,?,?,?,?,?)
          `).run(row.ingredient_id, 'return', totalQty, ing.current_stock, after, orderRow?.order_number);
        }
      }
    }
    this.db.prepare(`UPDATE orders SET status='voided', void_reason=?, void_at=CURRENT_TIMESTAMP WHERE id=?`).run(reason, id);
    return { success: true };
  }
}

// ─── Inventory Service ─────────────────────────────────────────────────────────
class InventoryService {
  constructor(private db: Database.Database) {}

  getAll(): any[] {
    return this.db.prepare(`
      SELECT i.*, p.name as product_name, p.sku, p.price,
             c.name as category_name, s.name as supplier_name
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN suppliers s ON i.supplier_id = s.id
      WHERE p.deleted_at IS NULL
      ORDER BY p.name
    `).all();
  }

  getLowStock(): any[] {
    return this.db.prepare(`
      SELECT i.*, p.name as product_name, p.sku
      FROM inventory i JOIN products p ON i.product_id = p.id
      WHERE i.quantity <= i.min_quantity AND p.deleted_at IS NULL
      ORDER BY (i.quantity / i.min_quantity) ASC
    `).all();
  }

  adjustStock(productId: number, qty: number, type: string, notes: string): any {
    const inv = this.db.prepare('SELECT quantity FROM inventory WHERE product_id = ?').get(productId) as any;
    if (!inv) return { success: false, message: 'Inventory not found' };

    const beforeQty = inv.quantity;
    let afterQty: number;
    if (type === 'adjustment') afterQty = qty;
    else if (type === 'in') afterQty = beforeQty + qty;
    else afterQty = Math.max(0, beforeQty - qty);

    this.db.prepare('UPDATE inventory SET quantity=?, last_restocked=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE product_id=?').run(afterQty, productId);
    this.db.prepare(`
      INSERT INTO stock_movements (product_id, type, quantity, before_qty, after_qty, notes)
      VALUES (?,?,?,?,?,?)
    `).run(productId, type, Math.abs(qty), beforeQty, afterQty, notes || null);

    return { success: true };
  }

  getMovements(productId?: number): any[] {
    const base = `
      SELECT sm.*, p.name as product_name, u.full_name as user_name
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.id
      LEFT JOIN users u ON sm.user_id = u.id
    `;
    if (productId) {
      return this.db.prepare(base + ' WHERE sm.product_id = ? ORDER BY sm.created_at DESC LIMIT 100').all(productId);
    }
    return this.db.prepare(base + ' ORDER BY sm.created_at DESC LIMIT 500').all();
  }
}

// ─── Ingredients Service ──────────────────────────────────────────────────────
class IngredientsService {
  constructor(private db: Database.Database) {}

  getAll(): any[] {
    return this.db.prepare(`
      SELECT ing.*, s.name as supplier_name
      FROM ingredients ing
      LEFT JOIN suppliers s ON ing.supplier_id = s.id
      WHERE ing.deleted_at IS NULL
      ORDER BY ing.name
    `).all();
  }

  getLowStock(): any[] {
    return this.db.prepare(`
      SELECT * FROM ingredients
      WHERE current_stock <= reorder_level AND deleted_at IS NULL
      ORDER BY (current_stock / reorder_level) ASC
    `).all();
  }

  create(data: any): any {
    const r = this.db.prepare(`
      INSERT INTO ingredients (name, unit, current_stock, reorder_level, cost_per_unit, supplier_id, notes)
      VALUES (?,?,?,?,?,?,?)
    `).run(data.name, data.unit || 'g', data.current_stock || 0, data.reorder_level || 100,
           data.cost_per_unit || 0, data.supplier_id || null, data.notes || null);
    return { success: true, id: r.lastInsertRowid };
  }

  update(id: number, data: any): any {
    this.db.prepare(`
      UPDATE ingredients SET name=?, unit=?, reorder_level=?, cost_per_unit=?, supplier_id=?, notes=?,
             updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).run(data.name, data.unit, data.reorder_level, data.cost_per_unit || 0,
           data.supplier_id || null, data.notes || null, id);
    return { success: true };
  }

  delete(id: number): any {
    this.db.prepare('UPDATE ingredients SET deleted_at=CURRENT_TIMESTAMP WHERE id=?').run(id);
    return { success: true };
  }

  adjustStock(id: number, qty: number, type: string, notes: string, userId?: number): any {
    const ing = this.db.prepare('SELECT current_stock FROM ingredients WHERE id=?').get(id) as any;
    if (!ing) return { success: false, message: 'Ingredient not found' };
    const before = ing.current_stock;
    let after: number;
    if (type === 'adjustment') after = qty;
    else if (type === 'purchase') after = before + qty;
    else after = Math.max(0, before - qty);
    this.db.prepare('UPDATE ingredients SET current_stock=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(after, id);
    this.db.prepare(`
      INSERT INTO ingredient_movements (ingredient_id, type, quantity, before_qty, after_qty, notes, user_id)
      VALUES (?,?,?,?,?,?,?)
    `).run(id, type, Math.abs(qty - (type === 'adjustment' ? before : 0) || qty), before, after, notes || null, userId || null);
    return { success: true };
  }

  getMovements(ingredientId?: number): any[] {
    const base = `
      SELECT im.*, ing.name as ingredient_name, ing.unit, u.full_name as user_name
      FROM ingredient_movements im
      JOIN ingredients ing ON im.ingredient_id = ing.id
      LEFT JOIN users u ON im.user_id = u.id
    `;
    if (ingredientId) {
      return this.db.prepare(base + ' WHERE im.ingredient_id = ? ORDER BY im.created_at DESC LIMIT 200').all(ingredientId);
    }
    return this.db.prepare(base + ' ORDER BY im.created_at DESC LIMIT 500').all();
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
    return this.db.prepare(`
      SELECT r.*, p.name as product_name, p.sku, ing.name as ingredient_name, ing.unit as ingredient_unit
      FROM recipes r
      JOIN products p ON r.product_id = p.id
      JOIN ingredients ing ON r.ingredient_id = ing.id
      WHERE p.deleted_at IS NULL
      ORDER BY p.name, ing.name
    `).all();
  }

  upsert(productId: number, ingredientId: number, quantity: number, unit?: string): any {
    this.db.prepare(`
      INSERT INTO recipes (product_id, ingredient_id, quantity, unit)
      VALUES (?,?,?,?)
      ON CONFLICT(product_id, ingredient_id) DO UPDATE SET quantity=excluded.quantity, unit=excluded.unit, updated_at=CURRENT_TIMESTAMP
    `).run(productId, ingredientId, quantity, unit || null);
    return { success: true };
  }

  removeIngredient(productId: number, ingredientId: number): any {
    this.db.prepare('DELETE FROM recipes WHERE product_id=? AND ingredient_id=?').run(productId, ingredientId);
    return { success: true };
  }

  setRecipe(productId: number, items: { ingredient_id: number; quantity: number; unit?: string }[]): any {
    const setAll = this.db.transaction(() => {
      this.db.prepare('DELETE FROM recipes WHERE product_id=?').run(productId);
      for (const item of items) {
        this.db.prepare(
          'INSERT INTO recipes (product_id, ingredient_id, quantity, unit) VALUES (?,?,?,?)'
        ).run(productId, item.ingredient_id, item.quantity, item.unit || null);
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
}

// ─── Modifiers Service ────────────────────────────────────────────────────────
class ModifiersService {
  constructor(private db: Database.Database) {}

  getAll(): any[] {
    const mods = this.db.prepare('SELECT * FROM modifiers ORDER BY name').all() as any[];
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
    const r = this.db.prepare(
      'INSERT INTO modifiers (name, description, is_required, allow_multiple) VALUES (?,?,?,?)'
    ).run(data.name, data.description || null, data.is_required ? 1 : 0, data.allow_multiple ? 1 : 0);
    return { success: true, id: r.lastInsertRowid };
  }

  updateModifier(id: number, data: any): any {
    this.db.prepare(
      'UPDATE modifiers SET name=?, description=?, is_required=?, allow_multiple=? WHERE id=?'
    ).run(data.name, data.description || null, data.is_required ? 1 : 0, data.allow_multiple ? 1 : 0, id);
    return { success: true };
  }

  deleteModifier(id: number): any {
    this.db.prepare('DELETE FROM modifiers WHERE id=?').run(id);
    return { success: true };
  }

  addOption(modifierId: number, data: any): any {
    const r = this.db.prepare(
      'INSERT INTO modifier_options (modifier_id, name, price_adjustment) VALUES (?,?,?)'
    ).run(modifierId, data.name, data.price_adjustment || 0);
    return { success: true, id: r.lastInsertRowid };
  }

  updateOption(id: number, data: any): any {
    this.db.prepare(
      'UPDATE modifier_options SET name=?, price_adjustment=? WHERE id=?'
    ).run(data.name, data.price_adjustment || 0, id);
    return { success: true };
  }

  deleteOption(id: number): any {
    this.db.prepare('DELETE FROM modifier_options WHERE id=?').run(id);
    return { success: true };
  }

  linkToProduct(productId: number, modifierId: number): any {
    this.db.prepare(
      'INSERT OR IGNORE INTO product_modifiers (product_id, modifier_id) VALUES (?,?)'
    ).run(productId, modifierId);
    return { success: true };
  }

  unlinkFromProduct(productId: number, modifierId: number): any {
    this.db.prepare(
      'DELETE FROM product_modifiers WHERE product_id=? AND modifier_id=?'
    ).run(productId, modifierId);
    return { success: true };
  }
}

// ─── Suppliers Service ─────────────────────────────────────────────────────────
class SuppliersService {
  constructor(private db: Database.Database) {}
  getAll(): any[] {
    return this.db.prepare('SELECT * FROM suppliers WHERE deleted_at IS NULL ORDER BY name').all();
  }
  create(data: any): any {
    const r = this.db.prepare('INSERT INTO suppliers (name, contact_person, phone, email, address, notes) VALUES (?,?,?,?,?,?)')
      .run(data.name, data.contact_person || null, data.phone || null, data.email || null, data.address || null, data.notes || null);
    return { success: true, id: r.lastInsertRowid };
  }
  update(id: number, data: any): any {
    this.db.prepare('UPDATE suppliers SET name=?, contact_person=?, phone=?, email=?, address=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .run(data.name, data.contact_person || null, data.phone || null, data.email || null, data.address || null, data.notes || null, id);
    return { success: true };
  }
  delete(id: number): any {
    this.db.prepare('UPDATE suppliers SET deleted_at=CURRENT_TIMESTAMP WHERE id=?').run(id);
    return { success: true };
  }
}

// ─── Customers Service ─────────────────────────────────────────────────────────
class CustomersService {
  constructor(private db: Database.Database) {}
  getAll(): any[] {
    return this.db.prepare('SELECT * FROM customers WHERE deleted_at IS NULL ORDER BY name').all();
  }
  create(data: any): any {
    const r = this.db.prepare('INSERT INTO customers (name, phone, email, address) VALUES (?,?,?,?)')
      .run(data.name, data.phone || null, data.email || null, data.address || null);
    return { success: true, id: r.lastInsertRowid };
  }
  update(id: number, data: any): any {
    this.db.prepare('UPDATE customers SET name=?, phone=?, email=?, address=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .run(data.name, data.phone || null, data.email || null, data.address || null, id);
    return { success: true };
  }
}

// ─── Expenses Service ──────────────────────────────────────────────────────────
class ExpensesService {
  constructor(private db: Database.Database) {}
  getAll(): any[] {
    return this.db.prepare('SELECT e.*, u.full_name as user_name FROM expenses e LEFT JOIN users u ON e.user_id = u.id WHERE e.deleted_at IS NULL ORDER BY e.date DESC').all();
  }
  create(data: any): any {
    const r = this.db.prepare('INSERT INTO expenses (category, description, amount, date, payment_method, reference, user_id, notes) VALUES (?,?,?,?,?,?,?,?)')
      .run(data.category, data.description, data.amount, data.date, data.payment_method || 'cash', data.reference || null, data.user_id || null, data.notes || null);
    return { success: true, id: r.lastInsertRowid };
  }
  update(id: number, data: any): any {
    this.db.prepare('UPDATE expenses SET category=?, description=?, amount=?, date=?, payment_method=?, reference=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .run(data.category, data.description, data.amount, data.date, data.payment_method || 'cash', data.reference || null, data.notes || null, id);
    return { success: true };
  }
  delete(id: number): any {
    this.db.prepare('UPDATE expenses SET deleted_at=CURRENT_TIMESTAMP WHERE id=?').run(id);
    return { success: true };
  }
}

// ─── Reports Service ───────────────────────────────────────────────────────────
class ReportsService {
  constructor(private db: Database.Database) {}

  getDashboard(): any {
    const today = new Date().toISOString().split('T')[0];
    const weekStart = new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0];
    const monthStart = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-01`;

    const todaySales = this.db.prepare(`SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count FROM orders WHERE DATE(created_at) = ? AND status='completed'`).get(today) as any;
    const weeklySales = this.db.prepare(`SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count FROM orders WHERE DATE(created_at) BETWEEN ? AND ? AND status='completed'`).get(weekStart, today) as any;
    const monthlySales = this.db.prepare(`SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count FROM orders WHERE DATE(created_at) >= ? AND status='completed'`).get(monthStart) as any;
    const lowStock = this.db.prepare('SELECT COUNT(*) as count FROM inventory i JOIN products p ON i.product_id=p.id WHERE i.quantity <= i.min_quantity AND p.deleted_at IS NULL').get() as any;
    const recentOrders = this.db.prepare(`SELECT o.*, u.full_name as cashier FROM orders o JOIN users u ON o.user_id=u.id ORDER BY o.created_at DESC LIMIT 10`).all();
    const topProducts = this.db.prepare(`
      SELECT p.name, SUM(oi.quantity) as qty_sold, SUM(oi.line_total) as revenue
      FROM order_items oi JOIN products p ON oi.product_id=p.id
      JOIN orders o ON oi.order_id=o.id
      WHERE DATE(o.created_at) >= ? AND o.status='completed'
      GROUP BY p.id ORDER BY revenue DESC LIMIT 5
    `).all(monthStart);

    return { todaySales, weeklySales, monthlySales, lowStock, recentOrders, topProducts };
  }

  getSalesTrend(days: number): any[] {
    const results = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
      const row = this.db.prepare(`SELECT COALESCE(SUM(total),0) as total, COUNT(*) as orders FROM orders WHERE DATE(created_at)=? AND status='completed'`).get(date) as any;
      results.push({ date, total: row.total, orders: row.orders });
    }
    return results;
  }

  getDailySales(date: string): any {
    const orders = this.db.prepare(`SELECT o.*, u.full_name as cashier FROM orders o JOIN users u ON o.user_id=u.id WHERE DATE(o.created_at)=? ORDER BY o.created_at DESC`).all(date) as any[];
    const summary = this.db.prepare(`SELECT COALESCE(SUM(total),0) as total, COUNT(*) as count, COALESCE(SUM(discount_amount),0) as discounts, COALESCE(SUM(tax_amount),0) as taxes FROM orders WHERE DATE(created_at)=? AND status='completed'`).get(date) as any;
    const byPayment = this.db.prepare(`SELECT payment_method, COUNT(*) as count, SUM(total) as total FROM orders WHERE DATE(created_at)=? AND status='completed' GROUP BY payment_method`).all(date);
    return { orders, summary, byPayment };
  }

  getWeeklySales(startDate: string): any[] {
    return this.db.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as orders, SUM(total) as total
      FROM orders WHERE DATE(created_at) >= ? AND status='completed'
      GROUP BY DATE(created_at) ORDER BY date
    `).all(startDate);
  }

  getMonthlySales(year: number, month: number): any[] {
    const m = String(month).padStart(2, '0');
    return this.db.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as orders, SUM(total) as total
      FROM orders WHERE strftime('%Y-%m', created_at)=? AND status='completed'
      GROUP BY DATE(created_at) ORDER BY date
    `).all(`${year}-${m}`);
  }

  getProductPerformance(start: string, end: string): any[] {
    return this.db.prepare(`
      SELECT p.name, p.sku, c.name as category, SUM(oi.quantity) as qty_sold,
             AVG(oi.unit_price) as avg_price, SUM(oi.line_total) as revenue
      FROM order_items oi JOIN products p ON oi.product_id=p.id
      LEFT JOIN categories c ON p.category_id=c.id
      JOIN orders o ON oi.order_id=o.id
      WHERE DATE(o.created_at) BETWEEN ? AND ? AND o.status='completed'
      GROUP BY p.id ORDER BY revenue DESC
    `).all(start, end);
  }

  getCategoryPerformance(start: string, end: string): any[] {
    return this.db.prepare(`
      SELECT c.name as category, c.color, COUNT(DISTINCT o.id) as orders,
             SUM(oi.quantity) as qty_sold, SUM(oi.line_total) as revenue
      FROM order_items oi JOIN products p ON oi.product_id=p.id
      JOIN categories c ON p.category_id=c.id
      JOIN orders o ON oi.order_id=o.id
      WHERE DATE(o.created_at) BETWEEN ? AND ? AND o.status='completed'
      GROUP BY c.id ORDER BY revenue DESC
    `).all(start, end);
  }

  getIngredientConsumption(start: string, end: string): any[] {
    return this.db.prepare(`
      SELECT ing.name as ingredient_name, ing.unit,
             SUM(im.quantity) as total_consumed,
             COUNT(im.id) as usage_count,
             SUM(im.quantity * ing.cost_per_unit) as total_cost
      FROM ingredient_movements im
      JOIN ingredients ing ON im.ingredient_id = ing.id
      WHERE im.type = 'usage' AND DATE(im.created_at) BETWEEN ? AND ?
      GROUP BY ing.id ORDER BY total_consumed DESC
    `).all(start, end);
  }

  getProfitSummary(start: string, end: string): any {
    const revenue = this.db.prepare(`
      SELECT COALESCE(SUM(total),0) as total, COUNT(*) as orders
      FROM orders WHERE DATE(created_at) BETWEEN ? AND ? AND status='completed'
    `).get(start, end) as any;

    const ingredientCost = this.db.prepare(`
      SELECT COALESCE(SUM(im.quantity * ing.cost_per_unit), 0) as total_cost
      FROM ingredient_movements im
      JOIN ingredients ing ON im.ingredient_id = ing.id
      WHERE im.type = 'usage' AND DATE(im.created_at) BETWEEN ? AND ?
    `).get(start, end) as any;

    const expenses = this.db.prepare(`
      SELECT COALESCE(SUM(amount),0) as total FROM expenses
      WHERE DATE(date) BETWEEN ? AND ? AND deleted_at IS NULL
    `).get(start, end) as any;

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
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as any[];
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  }

  update(data: Record<string, string>): any {
    const upsert = this.db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
    const updateAll = this.db.transaction((settings: Record<string, string>) => {
      for (const [key, value] of Object.entries(settings)) {
        upsert.run(key, value);
      }
    });
    updateAll(data);
    return { success: true };
  }
}

// ─── License Service ───────────────────────────────────────────────────────────
export class LicenseService {
  constructor(private db: Database.Database) {}

  async validate(licenseKey: string): Promise<any> {
    if (!licenseKey || licenseKey.length < 10) {
      throw new Error('Invalid license key format');
    }

    try {
      let data: any;
      // We perform the actual HTTPS fetch but add mock handlers since backend URL defaults to non-existent link.
      if (licenseKey.startsWith('DEMO-') || licenseKey === '1234-5678-9012-3456') {
         data = { tenant_id: 'tenant_' + crypto.randomUUID(), cafe_name: 'Demo Cafe Activated', features: ['pos', 'inventory', 'reports'] };
      } else {
         const response = await fetch('https://api.v1.cloudncream.com/api/validate-license', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ license_key: licenseKey })
         });
         
         if (!response.ok) {
           throw new Error('Network error or invalid license code');
         }
         data = await response.json();
      }

      // Encrypt and store local data
      const secureData = JSON.stringify({
        licenseKey,
        tenantId: data.tenant_id,
        cafeName: data.cafe_name,
        features: data.features,
        activatedAt: new Date().toISOString()
      });
      
      const encrypted = encryptText(secureData);
      
      const stmt = this.db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
      stmt.run('license_data', encrypted);
      stmt.run('license_status', 'active');
      
      // Auto-set store name if setting is empty
      const storeNameStmt = this.db.prepare("SELECT value FROM settings WHERE key='store_name'");
      const storeName = storeNameStmt.get() as any;
      if (!storeName || !storeName.value) {
        stmt.run('store_name', data.cafe_name);
      }

      return { success: true, tenant_id: data.tenant_id, cafe_name: data.cafe_name };
    } catch (error: any) {
      return { success: false, error: 'Failed to validate: ' + error.message };
    }
  }

  getStatus(): any {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = 'license_status'").get() as any;
    if (!row || row.value !== 'active') return { active: false };

    const dataRow = this.db.prepare("SELECT value FROM settings WHERE key = 'license_data'").get() as any;
    if (!dataRow) return { active: false };

    const decrypted = decryptText(dataRow.value);
    if (!decrypted) return { active: false, reason: 'tampered' }; // Tampered data

    const parsed = JSON.parse(decrypted);
    return { active: true, tenantId: parsed.tenantId, cafeName: parsed.cafeName };
  }
}
