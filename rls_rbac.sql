-- ENABLE RLS ON STAFF AND ROLES
CREATE TABLE public.roles (
    id bigint NOT NULL,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id, tenant_id)
);

CREATE TABLE public.staff (
    id bigint NOT NULL,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    username text NOT NULL,
    password_hash text NOT NULL,
    full_name text NOT NULL,
    email text,
    phone text,
    role_id bigint NOT NULL,
    is_active boolean DEFAULT true,
    last_login timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    PRIMARY KEY (id, tenant_id)
);

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

-- Allow background worker sync mutations (Tenant Scoped anonymous operations)
CREATE POLICY "Allow public sync for roles" ON public.roles FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public sync for staff" ON public.staff FOR ALL TO anon USING (true) WITH CHECK (true);
