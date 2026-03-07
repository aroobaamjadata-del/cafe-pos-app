import { supabase } from './supabaseClient';

export const validateTenantCode = async (codeOrKey: string) => {
  try {
    // 1. First, try checking the 'licenses' table (using the key as license_key)
    const { data: license, error: licErr } = await supabase
      .from('licenses')
      .select(`id, license_key, status, expires_at, features, current_activations, max_activations, tenant:tenants(id, business_name, tenant_code, status)`)
      .eq('license_key', codeOrKey)
      .maybeSingle();

    if (!licErr && license) {
      if (license.status !== 'active') return { success: false, error: 'License is not active.' };
      if (license.expires_at && new Date(license.expires_at) < new Date()) return { success: false, error: 'License has expired.' };
      
      const tenant = Array.isArray(license.tenant) ? license.tenant[0] : license.tenant;
      if (!tenant) return { success: false, error: 'Tenant not found for this license.' };
      if (tenant.status !== 'active') return { success: false, error: 'Tenant account is inactive.' };
      
      return { success: true, tenant };
    }

    // 2. Fallback: treat the input directly as a tenant_code
    const { data: tenant, error: tenErr } = await supabase
      .from('tenants')
      .select('id, business_name, tenant_code, status, created_at')
      .eq('tenant_code', codeOrKey)
      .maybeSingle();

    if (tenErr) throw tenErr;
    if (!tenant) return { success: false, error: 'Invalid license key or tenant code.' };
    if (tenant.status !== 'active') return { success: false, error: 'Tenant account is inactive.' };

    return { success: true, tenant };

  } catch (err: any) {
    // Handling the exact "fetch failed" Node.js error 
    if (err.message?.includes('fetch failed') || err.message?.includes('Network request failed')) {
      return { success: false, error: 'Network error: Cannot reach server to validate.' };
    }
    return { success: false, error: `Validation failed: ${err.message}` };
  }
};
