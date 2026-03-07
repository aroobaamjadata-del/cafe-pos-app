-- ENABLE RLS
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_devices ENABLE ROW LEVEL SECURITY;

-- 1. Allow reading tenants by tenant_code (Anonymous)
-- This is necessary during activation when the Desktop app only has an anon key
CREATE POLICY "Allow public read of active tenants by code" 
ON tenants FOR SELECT TO anon 
USING (status = 'active');

-- 2. Allow creating a new POS device (Anonymous)
CREATE POLICY "Allow device registration" 
ON pos_devices FOR INSERT TO anon 
WITH CHECK (true);

-- 3. Allow updating an existing POS device (Anonymous)
CREATE POLICY "Allow device updates" 
ON pos_devices FOR UPDATE TO anon 
USING (true)
WITH CHECK (true);

-- 4. Allow reading POS devices (Anonymous)
-- CRITICAL: Upsert operations require SELECT access to detect conflicts!
CREATE POLICY "Allow device read" 
ON pos_devices FOR SELECT TO anon 
USING (true);

-- 5. Enable RLS on licenses table
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;

-- 6. Allow reading licenses by license_key (Anonymous)
CREATE POLICY "Allow public read of active licenses" 
ON licenses FOR SELECT TO anon 
USING (true);
