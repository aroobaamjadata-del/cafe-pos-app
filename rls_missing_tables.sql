-- ─────────────────────────────────────────────────────────────────────────────
-- UPDATE SCHEMA FOR MISSING TABLES (CATEGORIES, INVENTORY, CUSTOMERS)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create categories table
CREATE TABLE IF NOT EXISTS public.categories (
    id bigint PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    color text DEFAULT '#e25a26',
    icon text DEFAULT 'coffee',
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    deleted_at timestamptz
);

-- 2. Create suppliers table (needed for inventory)
CREATE TABLE IF NOT EXISTS public.suppliers (
    id bigint PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    contact_person text,
    phone text,
    email text,
    address text,
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    deleted_at timestamptz
);

-- 3. Create inventory table
CREATE TABLE IF NOT EXISTS public.inventory (
    id bigint PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    product_id bigint NOT NULL,
    quantity numeric NOT NULL DEFAULT 0,
    min_quantity numeric DEFAULT 5,
    unit text DEFAULT 'pcs',
    supplier_id bigint,
    last_restocked timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 4. Create customers table
CREATE TABLE IF NOT EXISTS public.customers (
    id bigint PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    phone text,
    email text,
    address text,
    loyalty_points integer DEFAULT 0,
    total_spent numeric DEFAULT 0,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    deleted_at timestamptz
);

-- 5. Enable RLS
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies (Tenant Isolation)
DROP POLICY IF EXISTS "Categories: Tenant Isolation" ON public.categories;
CREATE POLICY "Categories: Tenant Isolation" ON public.categories
FOR ALL TO anon USING (tenant_id = public.get_tenant_id()) WITH CHECK (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "Suppliers: Tenant Isolation" ON public.suppliers;
CREATE POLICY "Suppliers: Tenant Isolation" ON public.suppliers
FOR ALL TO anon USING (tenant_id = public.get_tenant_id()) WITH CHECK (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "Inventory: Tenant Isolation" ON public.inventory;
CREATE POLICY "Inventory: Tenant Isolation" ON public.inventory
FOR ALL TO anon USING (tenant_id = public.get_tenant_id()) WITH CHECK (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "Customers: Tenant Isolation" ON public.customers;
CREATE POLICY "Customers: Tenant Isolation" ON public.customers
FOR ALL TO anon USING (tenant_id = public.get_tenant_id()) WITH CHECK (tenant_id = public.get_tenant_id());
