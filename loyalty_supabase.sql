-- ── LOYALTY SYSTEM PRODUCTION SCHEMA (FIXED) ──
-- This version fixes the Foreign Key reference errors for multi-terminal sync.

-- 0. Ensure Parent Tables have the required composite UNIQUE constraints
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_tenant_id_id_key;
ALTER TABLE public.orders ADD CONSTRAINT orders_tenant_id_id_key UNIQUE (tenant_id, id);

ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_tenant_id_id_key;
ALTER TABLE public.customers ADD CONSTRAINT customers_tenant_id_id_key UNIQUE (tenant_id, id);

-- 1. Loyalty Cards Table
CREATE TABLE IF NOT EXISTS public.loyalty_cards (
    id bigint PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_id bigint NOT NULL,
    loyalty_code text NOT NULL,
    stamps integer DEFAULT 0,
    reward_threshold integer DEFAULT 10,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    deleted_at timestamptz,
    
    -- Composite Foreign Key for multi-tenant isolation
    CONSTRAINT fk_customer 
        FOREIGN KEY (tenant_id, customer_id) 
        REFERENCES public.customers(tenant_id, id) ON DELETE CASCADE,
        
    UNIQUE(tenant_id, loyalty_code),
    UNIQUE(tenant_id, customer_id)
);

-- 2. Loyalty Transactions Table
CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
    id bigint PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_id bigint,
    order_id bigint,
    stamps_added integer DEFAULT 0,
    reward_redeemed integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    
    -- Composite Foreign Keys
    CONSTRAINT fk_tx_customer 
        FOREIGN KEY (tenant_id, customer_id) 
        REFERENCES public.customers(tenant_id, id) ON DELETE SET NULL,
        
    CONSTRAINT fk_tx_order 
        FOREIGN KEY (tenant_id, order_id) 
        REFERENCES public.orders(tenant_id, id) ON DELETE SET NULL,
        
    UNIQUE(tenant_id, id)
);

-- 3. Row Level Security Isolation
ALTER TABLE public.loyalty_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;

-- 4. Policies
DROP POLICY IF EXISTS "LoyaltyCards Isolation" ON public.loyalty_cards;
CREATE POLICY "LoyaltyCards Isolation" ON public.loyalty_cards 
FOR ALL TO anon 
USING (tenant_id = (SELECT (current_setting('request.headers'::text, true)::json->>'x-tenant-id')::uuid))
WITH CHECK (tenant_id = (SELECT (current_setting('request.headers'::text, true)::json->>'x-tenant-id')::uuid));

DROP POLICY IF EXISTS "LoyaltyTransactions Isolation" ON public.loyalty_transactions;
CREATE POLICY "LoyaltyTransactions Isolation" ON public.loyalty_transactions 
FOR ALL TO anon 
USING (tenant_id = (SELECT (current_setting('request.headers'::text, true)::json->>'x-tenant-id')::uuid))
WITH CHECK (tenant_id = (SELECT (current_setting('request.headers'::text, true)::json->>'x-tenant-id')::uuid));

-- 5. Helper Function for Stamps (Server-side)
CREATE OR REPLACE FUNCTION public.get_customer_stamps(cust_id bigint)
RETURNS integer AS $$
    SELECT stamps FROM public.loyalty_cards 
    WHERE customer_id = cust_id 
    AND tenant_id = (SELECT (current_setting('request.headers'::text, true)::json->>'x-tenant-id')::uuid);
$$ LANGUAGE sql STABLE;

-- 6. Grant Permissions
GRANT ALL ON public.loyalty_cards TO anon;
GRANT ALL ON public.loyalty_transactions TO anon;
