import { supabase } from './supabaseClient';
import { getCachedTenant, getUnsyncedOperations, markOperationSynced, markOperationError } from './sqliteDatabase';

export const startBackgroundSyncLayer = () => {
    // Check sync queue every 30 seconds
    setInterval(async () => {
        try {
            await syncWorkerProtocol();
        } catch (err) {
            console.error('Background Sync Worker Error:', err);
        }
    }, 30000); 
};

/**
 * ─── The Dedicated Sync Worker Protocol ───────────────────────────────────────
 * Offloads unsynced operations directly to Supabase using offline queue payloads.
 * Skips operations if no internet connectivity.
 */
export const syncWorkerProtocol = async () => {
    const tenant = getCachedTenant();
    if (!tenant) return;

    // Fast active check to ensure tenant is allowed to sync
    // If not online, this simply fails and the function returns — leaving operations unsynced.
    try {
        const { error: pingError } = await supabase.from('tenants').select('status').limit(1).maybeSingle();
        if (pingError && (pingError.message.includes('fetch failed') || pingError.message.includes('Network'))) {
            return; // completely offline, abort gracefully
        }
    } catch {
        return; // totally offline, no crash
    }

    const unsyncedOps = getUnsyncedOperations(50); // process 50 records at a time
    if (unsyncedOps.length === 0) return;

    console.log(`[SYNC WORKER] Processing ${unsyncedOps.length} offline operations for tenant ${tenant.tenant_code}...`);

    for (const op of unsyncedOps) {
        try {
            const table = op.table_name;
            const payload = JSON.parse(op.payload);
            
            // Critical SaaS Implementation: Map operation tenant_id explicitly 
            // incase local operations forgot to attach the SaaS isolation key.
            const synchronizedPayload = { ...payload, tenant_id: tenant.tenant_id };

            let syncResult;
            if (op.operation === 'INSERT') {
                syncResult = await supabase.from(table).insert([synchronizedPayload]);
            } else if (op.operation === 'UPDATE') {
                syncResult = await supabase.from(table).update(synchronizedPayload).eq('id', payload.id);
            } else if (op.operation === 'DELETE') {
                syncResult = await supabase.from(table).delete().eq('id', payload.id);
            }

            if (syncResult && syncResult.error) {
                // If it's a conflict or schema issue, mark it as error so we don't block the queue
                markOperationError(op.id, syncResult.error.message);
                console.error(`[SYNC WORKER] Failed to sync operation ${op.id} on table ${table}:`, syncResult.error.message);
            } else {
                markOperationSynced(op.id);
                console.log(`[SYNC WORKER] Synced operation ID ${op.id} (${table} - ${op.operation}) successfully.`);
            }
            
        } catch (opErr: any) {
            // General hard failure — mark the error and move to next record
            markOperationError(op.id, opErr.message || 'Unknown Parse/Sync Failure');
        }
    }
};
