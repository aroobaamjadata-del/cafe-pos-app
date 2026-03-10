-- ─── FINAL SUPABASE SYNC ENABLER ───
-- This script fixes IDs and Unique Constraints for ALL tables to enable Electron Sync.

-- 0. ADD SOFT-DELETE COLUMNS
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.ingredients ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 1. FIX PRODUCT_VARIANTS ID TYPE
-- Re-syncing local INTEGER IDs requires the cloud to have a BIGINT primary key.
ALTER TABLE public.order_items DROP COLUMN IF EXISTS variant_id;
DROP TABLE IF EXISTS public.product_variants CASCADE;

CREATE TABLE public.product_variants (
    id bigint PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    product_id bigint NOT NULL,
    name text NOT NULL,
    sku text,
    price numeric NOT NULL DEFAULT 0,
    cost_price numeric DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.order_items ADD COLUMN variant_id bigint;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Variants: Tenant Isolation" ON public.product_variants FOR ALL TO anon USING (tenant_id = public.get_tenant_id());

-- 2. ENSURE ALL TABLES HAVE THE (tenant_id, id) UNIQUE INDEX
-- This is required for the "onConflict" sync strategy.

-- CATEGORIES
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_tenant_id_id_key;
ALTER TABLE public.categories ADD CONSTRAINT categories_tenant_id_id_key UNIQUE (tenant_id, id);

-- PRODUCTS
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_tenant_id_id_key;
ALTER TABLE public.products ADD CONSTRAINT products_tenant_id_id_key UNIQUE (tenant_id, id);

-- STAFF
ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_tenant_id_id_key;
ALTER TABLE public.staff ADD CONSTRAINT staff_tenant_id_id_key UNIQUE (tenant_id, id);

-- SUPPLIERS
ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_tenant_id_id_key;
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_tenant_id_id_key UNIQUE (tenant_id, id);

-- INVENTORY
ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_tenant_id_id_key;
ALTER TABLE public.inventory ADD CONSTRAINT inventory_tenant_id_id_key UNIQUE (tenant_id, id);

-- INGREDIENTS
ALTER TABLE public.ingredients DROP CONSTRAINT IF EXISTS ingredients_tenant_id_id_key;
ALTER TABLE public.ingredients ADD CONSTRAINT ingredients_tenant_id_id_key UNIQUE (tenant_id, id);

-- CUSTOMERS
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_tenant_id_id_key;
ALTER TABLE public.customers ADD CONSTRAINT customers_tenant_id_id_key UNIQUE (tenant_id, id);

-- MODIFIERS
ALTER TABLE public.modifiers DROP CONSTRAINT IF EXISTS modifiers_tenant_id_id_key;
ALTER TABLE public.modifiers ADD CONSTRAINT modifiers_tenant_id_id_key UNIQUE (tenant_id, id);

-- MODIFIER_OPTIONS
ALTER TABLE public.modifier_options DROP CONSTRAINT IF EXISTS modifier_options_tenant_id_id_key;
ALTER TABLE public.modifier_options ADD CONSTRAINT modifier_options_tenant_id_id_key UNIQUE (tenant_id, id);

-- PRODUCT_VARIANTS
ALTER TABLE public.product_variants DROP CONSTRAINT IF EXISTS product_variants_tenant_id_id_key;
ALTER TABLE public.product_variants ADD CONSTRAINT product_variants_tenant_id_id_key UNIQUE (tenant_id, id);

-- 3. FIX RE-RUNS
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
