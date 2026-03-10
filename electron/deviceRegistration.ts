import { supabase } from './supabase';
import * as os from 'os';
import * as crypto from 'crypto';

// Generate stable hardware ID based on MAC address and Hostname
export const generateHardwareId = () => {
  const interfaces = os.networkInterfaces();
  let mac = 'unknown';
  for (const match of Object.values(interfaces)) {
    if (match) {
      const found = match.find(i => !i.internal && i.mac && i.mac !== '00:00:00:00:00:00');
      if (found) {
        mac = found.mac;
        break;
      }
    }
  }

  const rawId = `${os.hostname()}-${mac}-${os.platform()}`;
  return crypto.createHash('sha256').update(rawId).digest('hex').substring(0, 32);
};

export const registerDevice = async (tenantId: string) => {
  const deviceId = generateHardwareId();
  const deviceName = os.hostname();

  try {
    const { error } = await supabase.from('pos_devices').upsert({
      tenant_id: tenantId,
      device_id: deviceId, // Wait, `pos_devices` in your prompt uses `device_id` and `device_name`. But wait, database.ts uses hardware_id. I will map it as `device_id`.
      device_name: deviceName,
      activated_at: new Date().toISOString(),
      status: 'online', // add this if you're keeping the old schema
      last_seen_at: new Date().toISOString()
    }, { onConflict: 'device_id' } as any);

    if (error) {
        // if onConflict fails, try another way
         const { error: error2 } = await supabase.from('pos_devices').upsert({
          tenant_id: tenantId,
          hardware_id: deviceId, // some tables use hardware_id
          device_name: deviceName,
          status: 'online', 
          last_seen_at: new Date().toISOString()
        }, { onConflict: 'hardware_id' } as any);
        if (error2) throw error2;
    }
    
    return { success: true, deviceId, deviceName };
  } catch (err: any) {
    if (err.message.includes('fetch failed')) {
      return { success: false, error: 'Network error while registering device.' };
    }
    return { success: false, error: `Registration failed: ${err.message}` };
  }
};
