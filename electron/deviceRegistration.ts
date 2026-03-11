import { supabase } from './supabase';
import * as os from 'os';
import * as crypto from 'crypto';

/**
 * Generate a unique, stable hardware ID for this device.
 * Uses OS hostname, MAC addresses, and architecture for consistency.
 */
export const generateHardwareId = () => {
  const interfaces = os.networkInterfaces();
  const macs: string[] = [];
  
  for (const match of Object.values(interfaces)) {
    if (match) {
      match.forEach(i => {
        if (!i.internal && i.mac && i.mac !== '00:00:00:00:00:00') {
          macs.push(i.mac);
        }
      });
    }
  }

  // Sort MACs to ensure identical string if multiple interfaces exist
  const stableMacs = macs.sort().join('|');
  const rawId = `${os.hostname()}-${stableMacs}-${os.platform()}-${os.arch()}`;
  return crypto.createHash('sha256').update(rawId).digest('hex').substring(0, 32);
};

/**
 * Register the POS terminal with the tenant.
 * Enforces max_device limits stored in the tenant's subscription.
 */
export const registerDevice = async (tenantId: string) => {
  const hardwareId = generateHardwareId();
  const deviceName = os.hostname();

  try {
    // 1. Check if device is already registered for this tenant
    const { data: existing, error: fetchErr } = await supabase
      .from('pos_devices')
      .select('id, status')
      .eq('tenant_id', tenantId)
      .eq('hardware_id', hardwareId)
      .maybeSingle();

    if (!fetchErr && existing) {
        if (existing.status === 'deactivated') {
            return { success: false, error: 'This device has been deactivated by the administrator.' };
        }
        // Device already active, just updated its heartbeat
        await supabase
            .from('pos_devices')
            .update({ last_seen_at: new Date().toISOString() })
            .eq('id', existing.id);
        
        return { success: true, deviceId: hardwareId, deviceName };
    }

    // 2. New device? Check tenant limit
    const { data: tenant, error: tenErr } = await supabase
      .from('tenants')
      .select('max_devices')
      .eq('id', tenantId)
      .single();

    if (tenErr || !tenant) return { success: false, error: 'Could not verify tenant subscription limits.' };

    const { count, error: countErr } = await supabase
      .from('pos_devices')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'active');

    if (countErr) return { success: false, error: 'Could not verify current activations.' };

    if (tenant.max_devices && count !== null && count >= tenant.max_devices) {
      return { success: false, error: `Maximum activation limit reached (${tenant.max_devices}). Please deactivate an old device in the Admin Dashboard.` };
    }

    // 3. Register the new device
    const { error: regErr } = await supabase.from('pos_devices').insert({
        tenant_id: tenantId,
        hardware_id: hardwareId,
        device_name: deviceName,
        status: 'active',
        last_seen_at: new Date().toISOString(),
        activated_at: new Date().toISOString()
    });

    if (regErr) throw regErr;
    
    return { success: true, deviceId: hardwareId, deviceName };
  } catch (err: any) {
    console.error('[DEVICE_REG] Error:', err);
    if (err.message?.includes('fetch failed')) {
      return { success: false, error: 'Network error. Could not connect to the licensing server.' };
    }
    return { success: false, error: `Registration failed: ${err.message}` };
  }
};
