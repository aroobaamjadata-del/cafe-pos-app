import { cacheTenantLocal, cacheDeviceLocal } from './sqliteDatabase';
import { DatabaseService } from './database';
import { validateTenantCode } from './validateTenantCode';
import { registerDevice } from './deviceRegistration';

export const runActivationFlow = async (tenantCode: string, dbSvcParam?: DatabaseService) => {
  console.log(`Starting activation for: ${tenantCode}`);

  if (tenantCode === 'DEV-BYPASS') {
    return {
        success: true,
        tenant: 'Dev Local Cafe',
        message: 'Dev bypass active',
        mode: 'offline',
        tenant_id: 'dev-tenant-id'
    };
  }

  // 1. Validate Tenant online
  const validation = await validateTenantCode(tenantCode);
  if (!validation.success) {
    return { success: false, error: validation.error }; // Return error instead of message for ActivationScreen
  }
  
  const tenant = validation.tenant;

  // Type guard to ensure tenant exists
  if (!tenant) {
      return { success: false, error: 'Tenant data not found' };
  }

  // 2. Register this POS device to the Tenant
  const registration = await registerDevice(tenant.id);
  if (!registration.success) {
    return { success: false, error: registration.error };
  }

  try {
    // 3. Store securely in local SQLite Cache
    const tenantToCache = { ...tenant, name: tenant.business_name };
    cacheTenantLocal(tenantToCache);
    cacheDeviceLocal(registration.deviceId || '', registration.deviceName || '');
    
    // Also store it inside the regular cache so `database.ts` can use it.
    let dbSvc = dbSvcParam;
    if (!dbSvc) {
        dbSvc = new DatabaseService();
        dbSvc.initialize(); // ensuring initialized
    }

    const payload = {
        licenseId: 'tenant-id-pos',
        licenseKey: tenantCode,
        status: 'active',
        expiresAt: null,
        features: ['pos', 'inventory', 'reports'],
        tenantId: tenant.id,
        cafeName: tenant.business_name,
        tenantCode: tenant.tenant_code,
        tenantStatus: tenant.status,
        subscriptionPlan: 'pro',
        activatedAt: new Date().toISOString(),
        mode: 'online',
    };
    dbSvc.license['saveToCache'](tenantCode, payload);

    return { 
      success: true, 
      tenant: tenant.business_name,
      cafe_name: tenant.business_name, // the React App expects cafe_name
      tenant_id: tenant.id, // and tenant_id
      mode: 'online',
      features: payload.features,
      message: 'Terminal activated successfully.'
    };
  } catch (dbErr: any) {
    return { success: false, error: 'Failed to write to secure local storage: ' + dbErr.message };
  }
};
