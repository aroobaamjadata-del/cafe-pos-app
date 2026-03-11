-- ─── 1. CORE SEARCH PATH & EXTENSIONS ──────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── 2. TENANTS & SUBSCRIPTIONS ───────────────────────────────────
-- Already exists, but ensure structure is correct
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_devices INTEGER DEFAULT 3;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'pro';

-- ─── 3. POS DEVICES (Activation Registry) ─────────────────────────
CREATE TABLE IF NOT EXISTS pos_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    hardware_id TEXT NOT NULL,
    device_name TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'deactivated')),
    last_seen_at TIMESTAMPTZ DEFAULT now(),
    activated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, hardware_id)
);

ALTER TABLE pos_devices ENABLE ROW LEVEL SECURITY;

-- ─── 4. STAFF (Users table in SaaS mode) ──────────────────────────
-- Note: 'staff' is the table name used in syncWorker.ts
CREATE TABLE IF NOT EXISTS staff (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    full_name TEXT,
    email TEXT,
    password_hash TEXT NOT NULL,
    role_id INTEGER, -- Map to roles
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(tenant_id, username)
);

ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

-- ─── 5. SETTINGS (Store Config) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (tenant_id, key)
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- ─── 6. CORE ENTITIES (Products, Categories, etc) ────────────────
-- Ensure all have tenant_id and local_id (for local-to-cloud mapping)

-- Categories
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    local_id INTEGER, -- SQLite PK
    name TEXT NOT NULL,
    description TEXT,
    color TEXT,
    icon TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Products
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    local_id INTEGER,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    sku TEXT,
    price DECIMAL(12,2) DEFAULT 0,
    cost_price DECIMAL(12,2) DEFAULT 0,
    tax_rate DECIMAL(5,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    track_inventory BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- ─── 7. TRANSACTIONS (Orders & Items) ─────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    local_order_id TEXT NOT NULL, -- The ORD-XXXX string
    customer_id UUID,
    user_id UUID,
    status TEXT DEFAULT 'completed',
    subtotal DECIMAL(12,2) DEFAULT 0,
    total DECIMAL(12,2) DEFAULT 0,
    payment_method TEXT DEFAULT 'cash',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, local_order_id)
);
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    local_id INTEGER, -- local SQLite PK
    local_order_id TEXT NOT NULL,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    product_name TEXT,
    quantity DECIMAL(12,3) NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    total_price DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, local_id)
);
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- ─── 8. ROW LEVEL SECURITY POLICIES (Distributed SaaS) ───────────
-- These policies enforce that a user/device can only see data for their tenant.
-- We use a custom JWT claim 'tenant_id' or a header-matched variable.

-- Policy for 'staff'
CREATE POLICY "Tenant isolation for staff" ON staff
    FOR ALL USING (tenant_id::text = auth.jwt() ->> 'tenant_id');

-- Policy for 'settings' 
CREATE POLICY "Tenant isolation for settings" ON settings
    FOR ALL USING (tenant_id::text = auth.jwt() ->> 'tenant_id');

-- Policy for 'categories'
CREATE POLICY "Tenant isolation for categories" ON categories
    FOR ALL USING (tenant_id::text = auth.jwt() ->> 'tenant_id');

-- Policy for 'products'
CREATE POLICY "Tenant isolation for products" ON products
    FOR ALL USING (tenant_id::text = auth.jwt() ->> 'tenant_id');

-- Policy for 'orders'
CREATE POLICY "Tenant isolation for orders" ON orders
    FOR ALL USING (tenant_id::text = auth.jwt() ->> 'tenant_id');

-- Policy for 'order_items'
CREATE POLICY "Tenant isolation for order_items" ON order_items
    FOR ALL USING (tenant_id::text = auth.jwt() ->> 'tenant_id');

-- Policy for 'pos_devices' (Devices can see their own registry)
CREATE POLICY "Tenant isolation for pos_devices" ON pos_devices
    FOR ALL USING (tenant_id::text = auth.jwt() ->> 'tenant_id');

-- ─── 9. HELPER FUNCTIONS ──────────────────────────────────────────
-- Function to automatically set tenant_id on insert if missing
CREATE OR REPLACE FUNCTION set_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := (auth.jwt() ->> 'tenant_id')::uuid;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all relevant tables
-- CREATE TRIGGER tr_set_tenant_id_products BEFORE INSERT ON products FOR EACH ROW EXECUTE FUNCTION set_tenant_id();
-- (Repeat for other tables as needed)
