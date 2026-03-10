import { createIsolatedSupabaseClient } from './supabase';
import { cacheTenantLocal } from './sqliteDatabase';

/**
 * Validates a tenant code or license key against Supabase.
 * If valid, caches the tenant data locally in SQLite for offline booting.
 */
export const validateTenantCode = async (codeOrKey: string) => {
  const supabase = createIsolatedSupabaseClient(); 

  try {
    console.log(`[ACTIVATION] Validating activation string: ${codeOrKey}`);

    // 1. Try treating it as a LICENSE KEY first
    const { data: license, error: licErr } = await supabase
      .from('licenses')
      .select(`
        id, 
        status, 
        expires_at, 
        features, 
        tenant:tenants(id, business_name, tenant_code, status)
      `)
      .eq('license_key', codeOrKey)
      .maybeSingle();

    if (!licErr && license) {
      if (license.status !== 'active') return { success: false, error: 'License key is disabled.' };
      if (license.expires_at && new Date(license.expires_at) < new Date()) {
          return { success: false, error: 'License key has expired.' };
      }
      
      const tenant = Array.isArray(license.tenant) ? license.tenant[0] : license.tenant;
      if (!tenant || tenant.status !== 'active') {
          return { success: false, error: 'Associated tenant account is inactive.' };
      }

      // Map 'business_name' to the name property correctly, or just save it.
      const tenantToCache = { 
          id: tenant.id, 
          name: tenant.business_name || (tenant as any).name, 
          tenant_code: tenant.tenant_code, 
          status: tenant.status 
      };

      // Success: Cache locally
      cacheTenantLocal(tenantToCache);

      return { success: true, tenant: tenantToCache, source: 'license_key' };
    }

    // 2. Try treating it as a TENANT CODE directly
    const { data: tenant, error: tenErr } = await supabase
      .from('tenants')
      .select('id, business_name, tenant_code, status')
      .eq('tenant_code', codeOrKey)
      .maybeSingle();

    if (!tenErr && tenant) {
      if (tenant.status !== 'active') return { success: false, error: 'Tenant account is inactive.' };

      const tenantToCache = { 
          id: tenant.id, 
          name: tenant.business_name || (tenant as any).name, 
          tenant_code: tenant.tenant_code, 
          status: tenant.status 
      };

      // Success: Cache locally
      cacheTenantLocal(tenantToCache);

      return { success: true, tenant: tenantToCache, source: 'tenant_code' };
    }

    // If both failed
    if (licErr || tenErr) {
        console.error('[ACTIVATION] Error:', licErr || tenErr);
    }
    
    return { success: false, error: 'Invalid activation code or license key.' };

  } catch (err: any) {
    console.error('[ACTIVATION] Exception:', err.message);
    if (err.message?.includes('fetch failed')) {
      return { success: false, error: 'Network error. Please check your internet connection.' };
    }
    return { success: false, error: 'Activation failed. Please try again later.' };
  }
};
