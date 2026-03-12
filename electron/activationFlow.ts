import { cacheTenantLocal, cacheDeviceLocal } from './sqliteDatabase';
import { DatabaseService } from './database';
import { validateTenantCode } from './validateTenantCode';
import { registerDevice } from './deviceRegistration';
import { syncPullProtocol } from './syncWorker';

/**
 * ENTERPRISE ACTIVATION FLOW:
 * 1. Validates License Key / Tenant Code online.
 * 2. Binds this specific Hardware ID to the Tenant (checking limits).
 * 3. Initializes Local SQLite with Tenant Environment.
 * 4. Hydrates local DB with remote Master Data (Pull Protocol).
 */
export const runActivationFlow = async (activationCode: string, db: DatabaseService) => {
  console.log(`[ACTIVATION] Starting flow for: ${activationCode}`);

  try {
    // 1. Validation (Online)
    const validation = await validateTenantCode(activationCode);
    if (!validation.success || !validation.tenant) {
      return { success: false, error: validation.error || 'Invalid activation code.' };
    }
    
    const tenant = validation.tenant;

    // 2. Hardware Registration & Subscription Check
    const registration = await registerDevice(tenant.id);
    if (!registration.success) {
      return { success: false, error: registration.error };
    }

    // 3. Local Cache Provisioning
    cacheTenantLocal(tenant);
    cacheDeviceLocal(registration.deviceId || '', registration.deviceName || '');

    // 4. Mirror in database.ts (License Service)
    const licensePayload = {
        licenseId: 'activated-pos',
        licenseKey: activationCode,
        status: 'active',
        tenantId: tenant.id,
        tenantCode: tenant.tenant_code,
        tenantStatus: tenant.status,
        subscriptionPlan: tenant.subscription_plan || 'pro',
        cafeName: tenant.name,
        activatedAt: new Date().toISOString(),
        mode: 'online',
    };
    db.license['saveToCache'](activationCode, licensePayload);

    // 5. Initial Data Hydration (Master Data Pull)
    // We trigger this immediately so the user doesn't see empty screens after login
    console.log('[ACTIVATION] Hydrating local database from cloud...');
    await syncPullProtocol(db).catch(err => console.error('[ACTIVATION] Pull failed:', err));

    return { 
      success: true, 
      tenant: tenant.name,
      cafe_name: tenant.name,
      tenant_id: tenant.id,
      mode: 'online',
      message: 'Terminal activated and environment synced successfully.'
    };

  } catch (err: any) {
    console.error('[ACTIVATION] Error:', err);
    return { success: false, error: 'Activation failed: ' + err.message };
  }
};
