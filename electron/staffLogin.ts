import { getCachedTenant } from './sqliteDatabase';
import { DatabaseService } from './database';
import { createIsolatedSupabaseClient } from './supabase';
import * as bcrypt from 'bcryptjs';

/**
 * Enterprise Staff Login Logic
 * 1. Checks if staff exists in local SQLite (Offline-First)
 * 2. Verifies staff belongs to the currently activated tenant
 * 3. Validates credentials using bcrypt
 */
export const staffLogin = async (identifier: string, password: string, db: DatabaseService) => {
  const tenant = getCachedTenant();
  
  if (!tenant) {
    return { success: false, message: 'Terminal not activated. Please activate first.' };
  }

  try {
    const user = db.auth.login(identifier, password);

    if (user.success) {
      console.log(`[AUTH] Staff login successful: ${identifier} (Tenant: ${tenant.tenant_name})`);
      return { 
        success: true, 
        user: user.user,
        mode: 'offline-ready'
      };
    } else {
      return { success: false, message: 'Invalid credentials for this terminal.' };
    }
  } catch (err: any) {
    console.error('[AUTH] Login Error:', err.message);
    return { success: false, message: 'Login failed due to system error.' };
  }
};

/**
 * Initial Setup Flow: Set password for a staff member or Owner.
 * This happens if the staff was created in Supabase but hasn't set their POS password yet.
 */
export const setupStaffPassword = async (email: string, password: string, db: DatabaseService) => {
    const tenant = getCachedTenant();
    if (!tenant) return { success: false, message: 'Terminal not activated.' };

    try {
        // 1. Check if staff exists locally
        let user = db.users.getByEmail(email);

        // 2. If not found locally, check cloud immediately (handles new owners/staff not synced yet)
        if (!user) {
            console.log(`[AUTH] Email ${email} not found locally. Checking Supabase...`);
            const supabase = createIsolatedSupabaseClient();
            
            // Query the cloud table (mapped to staff in our RLS schema)
            const { data: cloudStaff, error: cloudErr } = await supabase
                .from('staff')
                .select('*')
                .eq('email', email)
                .maybeSingle();

            if (cloudErr) {
                console.error('[AUTH] Cloud Check Error:', cloudErr);
            }

            if (cloudStaff) {
                // Ingest the cloud staff record into local SQLite immediately
                db.users.syncDown([cloudStaff]);
                user = db.users.getByEmail(email);
                console.log(`[AUTH] Successfully fetched and cached staff from cloud: ${email}`);
            } else {
                // If not in cloud staff, see if it is the owner's email from the Tenant record
                const { data: tenantData } = await supabase
                    .from('tenants')
                    .select('*')
                    .eq('email', email)
                    .maybeSingle();

                if (tenantData) {
                    console.log(`[AUTH] Email matches Cafe Owner. Auto-generating local Admin account.`);
                    const adminRole = db.getDb().prepare("SELECT id FROM roles WHERE name = 'Admin'").get() as any;
                    
                    // Create the owner as a local admin
                    db.users.create({
                        username: tenantData.owner_name?.replace(/\s+/g, '').toLowerCase() || tenantData.email.split('@')[0],
                        password: password, // Will be hashed inside create
                        full_name: tenantData.owner_name || 'Cafe Owner',
                        email: tenantData.email,
                        phone: tenantData.phone || '',
                        role_id: adminRole ? adminRole.id : 1,
                        is_active: true
                    });
                    
                    user = db.users.getByEmail(email);
                }
            }
        }

        if (!user) {
            return { success: false, message: 'Owner or Staff email not registered for this cafe.' };
        }

        // 3. Hash and update locally immediately (Offline-First)
        // Note: changePassword already handles hashing and sync enqueuing
        db.users.changePassword(user.id, password);

        console.log(`[AUTH] Password set successfully for: ${email}`);
        return { success: true, message: 'Password set successfully! You can now log in.' };

    } catch (err: any) {
        console.error('[AUTH] Setup Error:', err.message);
        return { success: false, message: 'Failed to set password: ' + err.message };
    }
};

/**
 * Phase 1: Check if email exists and if setup is needed
 */
export const checkUserEmail = async (email: string, db: DatabaseService) => {
    try {
        const tenant = getCachedTenant();
        if (!tenant) return { success: false, message: 'Terminal not activated.' };

        // 1. Check locally
        let user = db.users.getByEmail(email);

        // 2. If not found locally, check Supabase
        if (!user) {
            const supabase = createIsolatedSupabaseClient();
            const { data: cloudStaff } = await supabase
                .from('staff')
                .select('*')
                .eq('email', email)
                .maybeSingle();

            if (cloudStaff) {
                db.users.syncDown([cloudStaff]);
                user = db.users.getByEmail(email);
            } else {
                // Check if it is the owner
                const { data: tenantData } = await supabase
                    .from('tenants')
                    .select('*')
                    .eq('email', email)
                    .maybeSingle();

                if (tenantData) {
                    const adminRole = db.getDb().prepare("SELECT id FROM roles WHERE name = 'Admin'").get() as any;
                    db.users.create({
                        username: tenantData.email.split('@')[0],
                        password: '', // Temporarily empty, setupPassword will handle it
                        full_name: tenantData.owner_name || 'Cafe Owner',
                        email: tenantData.email,
                        phone: tenantData.phone || '',
                        role_id: adminRole ? adminRole.id : 1,
                        is_active: true
                    });
                    user = db.users.getByEmail(email);
                }
            }
        }

        if (!user) return { exists: false };

        return { 
            exists: true, 
            needsSetup: !user.password_hash || user.password_hash === '',
            fullName: user.full_name,
            email: user.email 
        };
    } catch (err: any) {
        return { success: false, message: err.message };
    }
}

/**
 * Phase 2: License + Tenant Validation for Forgot Password
 */
export const validateResetCredentials = async (licenseKey: string, tenantCode: string) => {
    try {
        const supabase = createIsolatedSupabaseClient();
        
        // 1. Find Tenant by Code
        const { data: tenant, error: tErr } = await supabase
            .from('tenants')
            .select('id, email, owner_name')
            .eq('tenant_code', tenantCode)
            .maybeSingle();

        if (tErr || !tenant) return { success: false, message: 'Invalid Tenant Code' };

        // 2. Validate License Key
        const { data: license, error: lErr } = await supabase
            .from('licenses')
            .select('id')
            .eq('tenant_id', tenant.id)
            .eq('license_key', licenseKey)
            .eq('status', 'active')
            .maybeSingle();

        if (lErr || !license) return { success: false, message: 'Invalid or Inactive License Key' };

        return { success: true, tenantId: tenant.id, email: tenant.email };
    } catch (err: any) {
        return { success: false, message: err.message };
    }
}

/**
 * Phase 3: Perform actual reset
 */
export const performPasswordReset = async (tenantCode: string, newPassword: string, db: DatabaseService) => {
    try {
        const supabase = createIsolatedSupabaseClient();
        const tenant = getCachedTenant();
        
        // Find tenant_id from code
        const { data: tenantData } = await supabase
            .from('tenants')
            .select('id, email')
            .eq('tenant_code', tenantCode)
            .maybeSingle();

        if (!tenantData) return { success: false, message: 'Tenant not found.' };

        const newHash = bcrypt.hashSync(newPassword, 10);

        // Update in Supabase (Cloud First for security)
        const { error: resetErr } = await supabase
            .from('staff')
            .update({ password_hash: newHash, updated_at: new Date().toISOString() })
            .eq('email', tenantData.email)
            .eq('tenant_id', tenantData.id);

        if (resetErr) throw new Error('Cloud password reset failed: ' + resetErr.message);

        // Update locally if user exists here
        const localUser = db.users.getByEmail(tenantData.email);
        if (localUser) {
            db.users.changePassword(localUser.id, newPassword);
        }

        return { success: true, message: 'Password reset successful!' };
    } catch (err: any) {
        return { success: false, message: err.message };
    }
}
