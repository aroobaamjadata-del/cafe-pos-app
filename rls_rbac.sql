-- ─── ENTERPRISE MULTI-TENANT RLS SCHEMA ─────────────────────────────────────────
-- 1. UTILITY FUNCTIONS FOR HEADER-BASED AUTH
-- ─────────────────────────────────────────────────────────────────────────────

-- Function to get tenant_id from request headers (passed from Electron)
CREATE OR REPLACE FUNCTION public.get_tenant_id() RETURNS uuid AS $$
  SELECT (current_setting('request.headers', true)::json->>'x-tenant-id')::uuid;
$$ LANGUAGE SQL STABLE;

-- Function to get device_id from request headers (passed from Electron)
CREATE OR REPLACE FUNCTION public.get_device_id() RETURNS text AS $$
  SELECT current_setting('request.headers', true)::json->>'x-device-id';
$$ LANGUAGE SQL STABLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. SCHEMA DEFINITION & CONSTRAINTS
-- ─────────────────────────────────────────────────────────────────────────────

-- Ensure local_order_id exists in the orders table
-- This is used to map the local 'order_number' from SQLite to Supabase
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS local_order_id TEXT;

-- Remove the unique constraint if it already exists to avoid errors on re-runs
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS unique_order_per_tenant;

-- Add the unique constraint
-- Ensure local_order_id is unique per tenant to prevent cross-terminal duplicates
-- This is critical for the UPSERT strategy in the Sync Worker.
ALTER TABLE public.orders 
ADD CONSTRAINT unique_order_per_tenant UNIQUE (tenant_id, local_order_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS POLICIES FOR TENANTS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Terminals can only READ their own record to verify status
DROP POLICY IF EXISTS "Tenants: Read own status" ON public.tenants;
CREATE POLICY "Tenants: Read own status" ON public.tenants
FOR SELECT TO anon
USING (id = public.get_tenant_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS POLICIES FOR POS DEVICES
-- ─────────────────────────────────────────────────────────────────────────────
-- Ensure the device_id column exists
ALTER TABLE public.pos_devices ADD COLUMN IF NOT EXISTS device_id TEXT;

ALTER TABLE public.pos_devices ENABLE ROW LEVEL SECURITY;

-- Registered devices can check/update their own record
DROP POLICY IF EXISTS "Devices: Multi-tenant Isolation" ON public.pos_devices;
CREATE POLICY "Devices: Multi-tenant Isolation" ON public.pos_devices
FOR ALL TO anon
USING (tenant_id = public.get_tenant_id() AND device_id = public.get_device_id())
WITH CHECK (tenant_id = public.get_tenant_id() AND device_id = public.get_device_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS POLICIES FOR STAFF & ROLES (TENANT BOUND LOGIN)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

-- Staff can only be retrieved if they belong to the activated tenant header.
-- This prevents a staff member from Cafe A logging into Cafe B's terminal.
DROP POLICY IF EXISTS "Roles: Tenant Isolation" ON public.roles;
CREATE POLICY "Roles: Tenant Isolation" ON public.roles
FOR ALL TO anon
USING (tenant_id = public.get_tenant_id())
WITH CHECK (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS "Staff: Tenant Isolation" ON public.staff;
CREATE POLICY "Staff: Tenant Isolation" ON public.staff
FOR ALL TO anon
USING (tenant_id = public.get_tenant_id())
WITH CHECK (tenant_id = public.get_tenant_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RLS POLICIES FOR ORDERS (CRITICAL SYNC)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Logic:
-- 1. tenant_id must match the POS activation header
-- 2. device_id must be authorized for this tenant
DROP POLICY IF EXISTS "Orders: Secure Multi-terminal Sync" ON public.orders;
CREATE POLICY "Orders: Secure Multi-terminal Sync" ON public.orders
FOR ALL TO anon
USING (
    tenant_id = public.get_tenant_id() 
    AND EXISTS (
        SELECT 1 FROM public.pos_devices 
        WHERE device_id = public.get_device_id() 
        AND tenant_id = public.get_tenant_id()
    )
)
WITH CHECK (
    tenant_id = public.get_tenant_id()
    AND EXISTS (
        SELECT 1 FROM public.pos_devices 
        WHERE device_id = public.get_device_id() 
        AND tenant_id = public.get_tenant_id()
    )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RLS POLICIES FOR PRODUCTS & INVENTORY
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Products: Tenant Isolation" ON public.products;
CREATE POLICY "Products: Tenant Isolation" ON public.products
FOR ALL TO anon
USING (tenant_id = public.get_tenant_id())
WITH CHECK (tenant_id = public.get_tenant_id());
