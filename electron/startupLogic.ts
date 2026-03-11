import { getCachedTenant, getCachedDevice } from './sqliteDatabase';
import { validateTenantCode } from './validateTenantCode';
import { DatabaseService } from './database';
import { createIsolatedSupabaseClient } from './supabase';
import { syncPullProtocol } from './syncWorker';

/**
 * PRODUCTION BOOT LOGIC:
 * 1. Checks local cache for tenant and device activation.
 * 2. If online, validates device status (active/deactivated) in background.
 * 3. Triggers an immediate data pull to ensure environment is fresh.
 */
export const bootApplication = async (db: DatabaseService) => {
  console.log('[BOOT] Initializing SaaS environment...');

  try {
    // 1. Check local offline cache
    const tenant = getCachedTenant();
    const device = getCachedDevice();

    if (!tenant || !device) {
      console.log('[BOOT] No activation found. Redirecting to setup screen.');
      return { status: 'requires_activation' };
    }

    // 2. Background Validation (Online Check)
    // We don't await this to keep boot time under 500ms
    createIsolatedSupabaseClient()
      .from('pos_devices')
      .select('status, tenant:tenants(status)')
      .eq('hardware_id', device.hardware_id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error && data) {
          // Check if device or tenant was deactivated remotely
          const tenantData = Array.isArray(data.tenant) ? data.tenant[0] : data.tenant;
          const tenantStatus = tenantData?.status || 'active';
          
          if (data.status === 'deactivated' || tenantStatus !== 'active') {
            console.error('[BOOT] ACCESS REVOKED: Device or Tenant is inactive.');
            // This is a "kill switch" - could trigger an IPC message to lock the frontend
          } else {
            console.log('[BOOT] Online validation success.');
            // Trigger a background data refresh
            syncPullProtocol(db).catch(e => console.error('[BOOT] Background sync failed:', e));
          }
        }
      });

    console.log(`[BOOT] Environment loaded for: ${tenant.tenant_name} (Terminal: ${device.device_name})`);
    
    return { 
      status: 'ready', 
      tenant: {
          id: tenant.tenant_id,
          name: tenant.tenant_name,
          code: tenant.tenant_code
      }, 
      device, 
      mode: 'offline-first' 
    };

  } catch (err: any) {
    console.error('[BOOT] System error:', err);
    return { status: 'requires_activation', error: 'Database error during boot.' };
  }
};
