-- ─────────────────────────────────────────────────────────────────────────────
-- COMPREHENSIVE POS SCHEMA REPAIR SCRIPT
-- RUN THIS IN SUPABASE SQL EDITOR TO FIX SYNC ISSUES
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. FIX ORDERS TABLE
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_type text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_value numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tax_amount numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS amount_paid numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS change_amount numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS void_reason text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS void_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS loyalty_redeemed boolean DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS loyalty_discount_amount numeric DEFAULT 0;

-- 2. FIX ORDER_ITEMS TABLE (Mapping to local SQLite schema)
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS product_name text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS variant_name text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS discount_percent numeric DEFAULT 0;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS tax_rate numeric DEFAULT 0;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS line_total numeric DEFAULT 0;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS local_order_id text; -- Used to link to orders.local_order_id
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS local_id bigint;      -- Original SQLite ID

-- Enable RLS and Add Policies for order_items if missing
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Order Items: Tenant Isolation" ON public.order_items;
CREATE POLICY "Order Items: Tenant Isolation" ON public.order_items
FOR ALL TO anon USING (tenant_id = public.get_tenant_id()) WITH CHECK (tenant_id = public.get_tenant_id());

-- 3. CREATE MISSING PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS public.payments (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    local_id bigint,
    local_order_id text,
    method text NOT NULL,
    amount numeric NOT NULL,
    reference text,
    created_at timestamptz DEFAULT now()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Payments: Tenant Isolation" ON public.payments;
CREATE POLICY "Payments: Tenant Isolation" ON public.payments
FOR ALL TO anon USING (tenant_id = public.get_tenant_id()) WITH CHECK (tenant_id = public.get_tenant_id());

-- 4. CREATE MISSING STOCK_MOVEMENTS TABLE
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    local_id bigint,
    product_id bigint,
    type text NOT NULL, 
    quantity numeric NOT NULL,
    before_qty numeric,
    after_qty numeric,
    reference text,
    notes text,
    user_id bigint,
    created_at timestamptz DEFAULT now()
);
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Stock Movements: Tenant Isolation" ON public.stock_movements;
CREATE POLICY "Stock Movements: Tenant Isolation" ON public.stock_movements
FOR ALL TO anon USING (tenant_id = public.get_tenant_id()) WITH CHECK (tenant_id = public.get_tenant_id());

-- 5. CREATE MISSING SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.settings (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    key text NOT NULL,
    value text,
    updated_at timestamptz DEFAULT now(),
    UNIQUE(tenant_id, key)
);
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Settings: Tenant Isolation" ON public.settings;
CREATE POLICY "Settings: Tenant Isolation" ON public.settings
FOR ALL TO anon USING (tenant_id = public.get_tenant_id()) WITH CHECK (tenant_id = public.get_tenant_id());

-- 6. UNIQUE CONSTRAINTS FOR SYNC WORKER (UPSERT MATCHING)
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS unique_order_per_tenant;
ALTER TABLE public.orders ADD CONSTRAINT unique_order_per_tenant UNIQUE (tenant_id, local_order_id);

ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS unique_item_per_tenant;
ALTER TABLE public.order_items ADD CONSTRAINT unique_item_per_tenant UNIQUE (tenant_id, local_id);

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS unique_payment_per_tenant;
ALTER TABLE public.payments ADD CONSTRAINT unique_payment_per_tenant UNIQUE (tenant_id, local_id);

ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS unique_movement_per_tenant;
ALTER TABLE public.stock_movements ADD CONSTRAINT unique_movement_per_tenant UNIQUE (tenant_id, local_id);

-- 7. REFRESH SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
