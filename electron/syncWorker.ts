import { createIsolatedSupabaseClient } from './supabase';
import { getCachedTenant, getUnsyncedOperations, markOperationSynced, markOperationError } from './sqliteDatabase';
import { DatabaseService } from './database';

/**
 * ─── ENTERPRISE BACKGROUND SYNC ENGINE ──────────────────────────────────────────
 * Handles multi-terminal data merging, tenant isolation, and Master Data pulls.
 */
export const startBackgroundSyncLayer = (db: DatabaseService) => {
    // 1. Transaction Sync (PUSH) - Every 30 seconds
    setInterval(async () => {
        try {
            await syncPushProtocol();
        } catch (err) {
            console.error('[SYNC] Push failure:', err);
        }
    }, 30000);

    // 2. Master Data Pull (PULL) - Every 10 minutes (Staff, Roles, Products)
    setInterval(async () => {
        try {
            await syncPullProtocol(db);
        } catch (err) {
            console.error('[SYNC] Pull failure:', err);
        }
    }, 600000);

    // Initial run on startup - CRITICAL: PUSH before PULL to prevent local changes from being clobbered
    const initSync = async () => {
        try {
            console.log('[SYNC] Initializing startup sync...');
            await syncPushProtocol();
            await syncPullProtocol(db);
            console.log('[SYNC] Startup sync complete.');
        } catch (err) {
            console.error('[SYNC] Startup sync failed:', err);
        }
    };
    initSync();
};

/**
 * PUSH PROTOCOL: Uploads offline transactions to Supabase.
 * Uses UPSERT strategy with (tenant_id, local_order_id) to prevent duplicates.
 */
async function syncPushProtocol() {
    const tenant = getCachedTenant();
    if (!tenant) return;

    // Create fresh client to ensure latest headers (including device_id)
    const supabase = createIsolatedSupabaseClient();
    const ops = getUnsyncedOperations(50);
    
    if (ops.length === 0) return;

    for (const op of ops) {
        try {
            const table = op.table_name;
            let payload = JSON.parse(op.payload);
            
            // Critical SaaS Binding: Force tenant_id on every cloud write
            payload.tenant_id = tenant.tenant_id;

            // Map order numbering for cross-terminal duplicate prevention
            if (table === 'orders') {
                payload.local_order_id = payload.order_number;
            }

            // Convert SQLite 0/1 integers to Postgres booleans for ALL boolean columns
            const booleanKeys = ['is_active', 'track_inventory', 'has_recipe', 'allow_multiple', 'is_required', 'is_staff', 'is_voided', 'receipt_printed'];
            Object.keys(payload).forEach(key => {
                if (booleanKeys.includes(key) || key.startsWith('is_') || key.startsWith('has_')) {
                    if (typeof payload[key] === 'number') {
                        payload[key] = payload[key] === 1;
                    }
                }
            });

            // Supabase schema cache doesn't like null timestamps for columns it prefers to default
            if ('deleted_at' in payload && payload.deleted_at === null) delete payload.deleted_at;
            if ('created_at' in payload && payload.created_at === null) delete payload.created_at;
            if ('updated_at' in payload && payload.updated_at === null) delete payload.updated_at;

            // Enterprise Payload Sanitization: Remove UI-only or legacy columns that crash Supabase Upsert
            const forbiddenKeys = [
                'image', 'category_name', 'stock', 'product_name', 'supplier_name', 
                'tenant_name', 'tenant_code', 'role_name', 'variant_count', 'product_count'
            ];
            forbiddenKeys.forEach(key => delete payload[key]);

            let syncResult;
            
            // UPSERT strategy: Insert new or update existing based on unique constraints
            if (op.operation === 'INSERT' || op.operation === 'UPDATE') {
                let onConflict = 'tenant_id, id';
                if (table === 'orders') onConflict = 'tenant_id, local_order_id';
                if (table === 'recipes') onConflict = 'tenant_id, product_id, ingredient_id';
                if (table === 'product_modifiers') onConflict = 'tenant_id, product_id, modifier_id';
                
                // For table-specific logic where we don't have a simple ID or want a different match
                if (table === 'settings') onConflict = 'tenant_id, key';

                if (['products', 'categories', 'staff', 'customers', 'suppliers', 'inventory', 'ingredients', 'modifiers', 'modifier_options', 'expenses', 'product_variants', 'order_items', 'payments', 'stock_movements', 'ingredient_movements', 'loyalty_cards', 'loyalty_transactions'].includes(table)) {
                    onConflict = 'tenant_id, id';
                }

                console.log(`[SYNC] Upserting ${table} (${op.operation}) for ID: ${payload.id || 'N/A'}`);
                
                syncResult = await supabase
                    .from(table)
                    .upsert([payload], { 
                        onConflict,
                        ignoreDuplicates: false 
                    });
            } else if (op.operation === 'DELETE') {
                syncResult = await supabase
                    .from(table)
                    .delete()
                    .match({ id: payload.id, tenant_id: tenant.tenant_id });
            }

            if (syncResult && syncResult.error) {
                console.error(`[SYNC] Upsert Error for ${table}:`, syncResult.error.message);
                markOperationError(op.id, syncResult.error.message);
            } else {
                markOperationSynced(op.id);
            }
        } catch (err: any) {
            console.error(`[SYNC] Caught Error processing ${op.table_name}:`, err.message);
            markOperationError(op.id, err.message);
        }
    }
}

/**
 * PULL PROTOCOL: Ingests master data (Staff, Roles) scoped to the active tenant.
 */
async function syncPullProtocol(db: DatabaseService) {
    const tenant = getCachedTenant();
    if (!tenant) return;

    const supabase = createIsolatedSupabaseClient();

    try {
        // Pull Staff (already isolated by RLS in Supabase via headers)
        const { data: staff, error: staffErr } = await supabase
            .from('staff')
            .select('*')
            .eq('is_active', true);

        if (!staffErr && staff) {
            db.users.syncDown(staff);
        }

        // Pull Roles
        const { data: roles, error: rolesErr } = await supabase
            .from('roles')
            .select('*');

        if (!rolesErr && roles) {
            db.roles.syncDown(roles);
        }

        // Pull Loyalty Cards
        const { data: cards, error: cardErr } = await supabase
            .from('loyalty_cards')
            .select('*');
        
        if (!cardErr && cards) {
            // Need to implement syncDown in LoyaltyService
            db.loyalty.syncDown(cards);
        }
    } catch (err) {
        console.error('[SYNC] Pull Protocol Failed:', err);
    }
}
