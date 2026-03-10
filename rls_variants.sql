-- ─────────────────────────────────────────────────────────────────────────────
-- UPDATE SCHEMA FOR PRODUCT VARIANTS AND ORDER ITEMS
-- ─────────────────────────────────────────────────────────────────────────────

-- 0. Drop if exists to ensure clean run
DROP TABLE IF EXISTS public.product_variants CASCADE;

-- 1. Create product_variants table
CREATE TABLE public.product_variants (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL,
    product_id bigint NOT NULL,
    name text NOT NULL,
    sku text,
    price numeric NOT NULL DEFAULT 0,
    cost_price numeric DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    FOREIGN KEY (tenant_id, product_id) REFERENCES public.products(tenant_id, id) ON DELETE CASCADE
);

-- 2. Add Variant fields to order_items
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS variant_id uuid;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS variant_name text;

-- 3. Enable RLS for product_variants
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Variants: Tenant Isolation" ON public.product_variants;
CREATE POLICY "Variants: Tenant Isolation" ON public.product_variants
FOR ALL TO anon
USING (tenant_id = public.get_tenant_id())
WITH CHECK (tenant_id = public.get_tenant_id());
