import { createClient } from '@supabase/supabase-js';
import { getCachedTenant, getCachedDevice } from './sqliteDatabase';

// ─── Supabase Configuration ────────────────────────────────────────────────────
export const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ckkbsvetdhpltycexodp.supabase.co';
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNra2JzdmV0ZGhwbHR5Y2V4b2RwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NjU0NjIsImV4cCI6MjA4ODM0MTQ2Mn0.xjx6Y74lsj18HqH5mI3i38bG7Q6Zp_sGTLt98DrYCIY';

/**
 * Enterprise Isolated Client Factory
 * Attaches 'x-tenant-id' and 'x-device-id' headers for RLS enforcement.
 * This ensures no terminal can see or modify data belonging to another tenant.
 */
export const createIsolatedSupabaseClient = () => {
  const tenant = getCachedTenant();
  const device = getCachedDevice();

  const headers: Record<string, string> = {
    'x-application-name': 'cloud-n-cream-pos'
  };

  if (tenant?.tenant_id) {
    headers['x-tenant-id'] = tenant.tenant_id;
  }
  if (device?.device_id) {
    headers['x-device-id'] = device.device_id;
  }

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { 
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    },
    global: { headers }
  });
};

// Default singleton client (caution: headers are static at creation time)
export const supabase = createIsolatedSupabaseClient();

export function isSupabaseConfigured(): boolean {
  return (
    SUPABASE_URL.startsWith('https://') &&
    SUPABASE_URL.includes('.supabase.co') &&
    SUPABASE_ANON_KEY.length > 100
  );
}
