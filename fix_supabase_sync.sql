-- FIX SUPABASE CONSTRAINTS FOR SYNC
-- These are required for the UPSERT strategy used by the POS Sync Worker

-- 1. Categories
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_tenant_id_id_key;
ALTER TABLE public.categories ADD CONSTRAINT categories_tenant_id_id_key UNIQUE (tenant_id, id);

-- 2. Products
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_tenant_id_id_key;
ALTER TABLE public.products ADD CONSTRAINT products_tenant_id_id_key UNIQUE (tenant_id, id);

-- 3. Staff
ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_tenant_id_id_key;
ALTER TABLE public.staff ADD CONSTRAINT staff_tenant_id_id_key UNIQUE (tenant_id, id);

-- 4. Suppliers
ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_tenant_id_id_key;
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_tenant_id_id_key UNIQUE (tenant_id, id);

-- 5. Inventory (uses product_id as unique key per tenant usually)
-- But the code uses 'id' for inventory sync in syncWorker.ts line 95
ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_tenant_id_id_key;
ALTER TABLE public.inventory ADD CONSTRAINT inventory_tenant_id_id_key UNIQUE (tenant_id, id);

-- 6. Ingredients
ALTER TABLE public.ingredients DROP CONSTRAINT IF EXISTS ingredients_tenant_id_id_key;
ALTER TABLE public.ingredients ADD CONSTRAINT ingredients_tenant_id_id_key UNIQUE (tenant_id, id);

-- 7. Customers
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_tenant_id_id_key;
ALTER TABLE public.customers ADD CONSTRAINT customers_tenant_id_id_key UNIQUE (tenant_id, id);

-- 8. Modifiers
ALTER TABLE public.modifiers DROP CONSTRAINT IF EXISTS modifiers_tenant_id_id_key;
ALTER TABLE public.modifiers ADD CONSTRAINT modifiers_tenant_id_id_key UNIQUE (tenant_id, id);

-- 9. Modifier Options
ALTER TABLE public.modifier_options DROP CONSTRAINT IF EXISTS modifier_options_tenant_id_id_key;
ALTER TABLE public.modifier_options ADD CONSTRAINT modifier_options_tenant_id_id_key UNIQUE (tenant_id, id);
