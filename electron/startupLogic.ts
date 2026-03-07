import { getCachedTenant, getCachedDevice } from './sqliteDatabase';
import { validateTenantCode } from './validateTenantCode';
import { DatabaseService } from './database';

export const bootApplication = async (dbSvcParam?: DatabaseService) => {
  console.log('Booting POS System...');

  try {
    // 1. Check old license cache from database.ts too
    let dbSvc = dbSvcParam;
    if (!dbSvc) {
      dbSvc = new DatabaseService();
      dbSvc.initialize();
    }

    const oldStatus = dbSvc.license.getStatus();
    if (oldStatus.active) {
      return {
          status: 'ready',
          tenant: { tenant_id: oldStatus.tenantId, tenant_name: oldStatus.cafeName },
          mode: 'offline-first'
      };
    }

    // 2. Check local offline cache first
    const localTenant = getCachedTenant();
    const localDevice = getCachedDevice();

    if (!localTenant || !localDevice) {
      console.log('No activation found. Booting to Activation Screen.');
      return { status: 'requires_activation' };
    }

    // 3. Background Sync / Validation Attempt
    // We fire this asynchronously so we don't block the UI from loading instantly
    validateTenantCode(localTenant.tenant_code).then(res => {
      if (res.success) {
        console.log('Online Check: Tenant Validated.');
        // Optionally update the local cache with fresh data here
      } else if (res.error && !res.error.includes('Network error')) {
        // Critical Issue: The tenant has been disabled remotely by Super Admin
        console.error('CRITICAL: Remote tenant access revoked!', res.error);
        // We can dispatch IPC event to trigger app lockout if needed
      } else {
        console.log('Running strictly offline network sync failed.');
      }
    });

    console.log(`Starting POS explicitly in Offline-Ready Mode for ${localTenant.tenant_name}`);
    
    return { 
      status: 'ready', 
      tenant: localTenant, 
      device: localDevice, 
      mode: 'offline-first' 
    };
  } catch (err: any) {
    console.error('Boot error:', err);
    return { status: 'requires_activation', error: err.message };
  }
};
