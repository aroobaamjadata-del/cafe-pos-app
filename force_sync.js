// Manual Sync Trigger
const { createIsolatedSupabaseClient } = require('./supabase');
const { getCachedTenant, getUnsyncedOperations, markOperationSynced, markOperationError } = require('./sqliteDatabase');

async function forceSync() {
    console.log('Force Sync Starting...');
    const tenant = getCachedTenant();
    if (!tenant) {
        console.error('No tenant cached. Is the app activated?');
        return;
    }
    console.log('Tenant:', tenant.tenant_name, tenant.tenant_id);

    const supabase = createIsolatedSupabaseClient();
    const ops = getUnsyncedOperations(100);
    console.log(`Found ${ops.length} unsynced operations.`);

    for (const op of ops) {
        try {
            const table = op.table_name;
            let payload = JSON.parse(op.payload);
            payload.tenant_id = tenant.tenant_id;
            
            if (table === 'orders') payload.local_order_id = payload.order_number;

            // Cleanup (Same as syncWorker.ts)
            const booleanKeys = ['is_active', 'track_inventory', 'has_recipe', 'allow_multiple', 'is_required', 'is_staff', 'is_voided', 'receipt_printed'];
            Object.keys(payload).forEach(key => {
                if (booleanKeys.includes(key) || key.startsWith('is_') || key.startsWith('has_')) {
                    if (typeof payload[key] === 'number') payload[key] = payload[key] === 1;
                }
            });
            if ('deleted_at' in payload && payload.deleted_at === null) delete payload.deleted_at;
            if ('created_at' in payload && payload.created_at === null) delete payload.created_at;
            if ('updated_at' in payload && payload.updated_at === null) delete payload.updated_at;
            const forbiddenKeys = ['image', 'category_name', 'stock', 'product_name', 'supplier_name', 'tenant_name', 'tenant_code', 'role_name'];
            forbiddenKeys.forEach(key => delete payload[key]);

            console.log(`Syncing ${table} ID: ${payload.id}...`);
            let syncResult;
            let onConflict = 'tenant_id, id';
            if (table === 'orders') onConflict = 'tenant_id, local_order_id';
            
            syncResult = await supabase.from(table).upsert([payload], { onConflict });

            if (syncResult.error) {
                console.error(`Error ${table}:`, syncResult.error.message);
                markOperationError(op.id, syncResult.error.message);
            } else {
                console.log(`Success ${table} ID: ${payload.id}`);
                markOperationSynced(op.id);
            }
        } catch (err) {
            console.error('Processing error:', err);
        }
    }
    console.log('Force Sync Finished.');
}

forceSync();
