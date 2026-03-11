import { createIsolatedSupabaseClient } from './supabase';
import { getCachedTenant, getUnsyncedOperations, markOperationSynced, markOperationError, getCacheDb } from './sqliteDatabase';
import { DatabaseService } from './database';
import { syncEvents, SYNC_EVENT_DATA_CHANGED } from './syncEvents';

// ─── Active-Pull Throttle ─────────────────────────────────────────────────────
let activePullTimer: ReturnType<typeof setTimeout> | null = null;
export const triggerActivePull = (db: DatabaseService) => {
    if (activePullTimer) clearTimeout(activePullTimer);
    activePullTimer = setTimeout(async () => {
        activePullTimer = null;
        try { await syncPullProtocol(db); } catch (e) { /* silent */ }
    }, 2000); // Wait 2s for cloud to settle after a push
};

/**
 * ─── ENTERPRISE BACKGROUND SYNC ENGINE ──────────────────────────────────────────
 */
export const startBackgroundSyncLayer = (db: DatabaseService) => {
    // 1. Transaction Sync (PUSH) - Every 1 second for sub-second sync
    setInterval(async () => {
        try { await syncPushProtocol(db); } catch (err) { /* silent */ }
    }, 1000);

    // 2. Refresh Full State (PULL) - Every 10 minutes (Self-healing heartbeat)
    setInterval(async () => {
        try { await syncPullProtocol(db); } catch (err) { /* silent */ }
    }, 600000);

    // 3. Realtime Subscription (INSTANT SYNC)
    const setupRealtime = () => {
        const tenant = getCachedTenant();
        if (!tenant) return;

        const { notifyUIRemoteChange } = require('./main');
        const supabase = createIsolatedSupabaseClient();
        console.log('[SYNC] Real-Time Engine Active:', tenant.tenant_id);

        supabase
            .channel('realtime-sync')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', filter: `tenant_id=eq.${tenant.tenant_id}` },
                async (payload) => {
                    const table = payload.table;
                    const eventType = payload.eventType;
                    const data = (eventType === 'DELETE') ? payload.old : payload.new;

                    console.log(`[SYNC] Instant ${eventType} on ${table}`);

                    // Apply to Local Database immediately
                    try {
                        if (eventType === 'INSERT' || eventType === 'UPDATE') {
                            const items = Array.isArray(data) ? data : [data];
                            if (table === 'orders') db.orders.syncDown(items);
                            else if (table === 'order_items') db.orders.syncDownItems(items);
                            else if (table === 'payments') db.orders.syncDownPayments(items);
                            else if (table === 'customers') db.customers.syncDown(items);
                            else if (table === 'loyalty_cards') db.loyalty.syncDown(items);
                            else if (table === 'loyalty_transactions') db.loyalty.syncDownTransactions(items);
                            else if (table === 'products') db.products.syncDown(items);
                            else if (table === 'inventory') db.inventory.syncDown(items);
                            else if (table === 'stock_movements') db.inventory.syncDownStockMovements(items);
                            else if (table === 'ingredient_movements') db.ingredients.syncDownIngredientMovements(items);
                            else if (table === 'settings') db.settings.syncDown(items);
                            else if (table === 'staff') db.users.syncDown(items);
                            else if (table === 'categories') db.categories.syncDown(items);
                        }
                        
                        // Notify UI to refresh components
                        notifyUIRemoteChange(table, eventType, data);
                    } catch (e) {
                         console.error('[SYNC] Realtime Apply Failed:', e);
                         triggerActivePull(db); // Fallback to full pull if specific apply fails
                    }
                }
            )
            .subscribe();
    };
    setupRealtime();

    // 4. Local Event Listener (INSTANT PUSH)
    syncEvents.on(SYNC_EVENT_DATA_CHANGED, () => {
        syncPushProtocol(db).catch(() => {});
    });

    // Initial sync
    setTimeout(async () => {
        try {
            await syncPushProtocol(db);
            await syncPullProtocol(db);
        } catch (err) { console.error('[SYNC] Initial sync failed:', err); }
    }, 5000);
};

export const forceSyncNow = async (db: DatabaseService): Promise<{ pushed: number; pulled: boolean; errors: number }> => {
    let pushed = 0; let errors = 0; let pulled = false;
    try {
        const before = getUnsyncedOperations(500).length;
        await syncPushProtocol(db);
        const after = getUnsyncedOperations(500).length;
        pushed = Math.max(0, before - after);
    } catch (err) { errors++; }
    try {
        await syncPullProtocol(db);
        pulled = true;
    } catch (err) { errors++; }
    return { pushed, pulled, errors };
};

const MAX_SYNC_RETRIES = 5;
const getRetryCount = (errorMsg: string | null): number => {
    if (!errorMsg) return 0;
    const m = errorMsg.match(/^RETRY:(\d+)/);
    return m ? parseInt(m[1]) : 0;
};

export async function syncPushProtocol(dbService: DatabaseService) {
    const tenant = getCachedTenant();
    if (!tenant) return;

    const supabase = createIsolatedSupabaseClient();
    const queue = getUnsyncedOperations(100);

    if (queue.length === 0) return;

    for (const op of queue) {
        try {
            const table = op.table_name;
            let payload = JSON.parse(op.payload);
            const retryCount = getRetryCount(op.error_message);

            if (retryCount >= MAX_SYNC_RETRIES) continue;

            payload.tenant_id = tenant.tenant_id;

            // ─── ID MAPPING LAYER ───
            // We map local SQLite IDs to 'local_id' in Supabase to prevent collisions between devices.
            // SQLite uses INTEGERS; Supabase uses BIGINT/UUID. We always delete 'id' before push.
            const mappedTables = [
                'customers', 'staff', 'suppliers', 'categories', 'products', 'product_variants', 
                'loyalty_cards', 'loyalty_transactions', 'stock_movements', 'ingredient_movements', 
                'expenses', 'inventory', 'ingredients', 'recipes', 'modifiers', 'modifier_options',
                'payments', 'order_items'
            ];

            if (mappedTables.includes(table)) {
                payload.local_id = payload.id;
                delete payload.id;
            }

            // Special handling for foreign key resolution (Translation from Local ID to Cloud UUID)
            if (payload.customer_id && table !== 'customers') {
                try {
                    const cust = dbService.customers.getById(payload.customer_id);
                    if (cust && cust.cloud_id) payload.customer_id = cust.cloud_id;
                } catch (e) {}
            }
            if (payload.user_id) {
                try {
                    const user = dbService.users.getById(payload.user_id);
                    if (user && user.cloud_id) payload.user_id = user.cloud_id;
                } catch (e) {}
            }
            if (payload.category_id && table === 'products') {
                try {
                    const cat = dbService.categories.getById(payload.category_id);
                    if (cat && cat.cloud_id) payload.category_id = cat.cloud_id;
                } catch (e) {}
            }

            // Special handling for orders (Link to order_number/local_order_id)
            if (table === 'orders') {
                payload.local_order_id = payload.order_number;
                delete payload.id; // Cloud uses UUID
            } else if (table === 'order_items' || table === 'payments') {
                try {
                    const orderRow = dbService.orders.getById(payload.order_id);
                    if (orderRow) payload.local_order_id = orderRow.order_number;
                } catch (e) {}
            }

            // Boolean Conversion
            const bools = ['is_active', 'track_inventory', 'has_recipe', 'allow_multiple', 'is_required', 'is_staff', 'is_voided', 'receipt_printed', 'loyalty_redeemed'];
            Object.keys(payload).forEach(k => {
                if (bools.includes(k) || k.startsWith('is_') || k.startsWith('has_')) {
                    if (typeof payload[k] === 'number') payload[k] = payload[k] === 1;
                }
            });

            // Cleanup
            if (payload.deleted_at === null) delete payload.deleted_at;
            const forbidden = ['image', 'category_name', 'category_color', 'stock', 'supplier_name', 'tenant_name', 'role_name', 'cashier_name'];
            forbidden.forEach(k => { if (!(table === 'order_items' && (k === 'product_name' || k === 'variant_name'))) delete payload[k]; });

            let result;
            if (op.operation === 'INSERT' || op.operation === 'UPDATE') {
                let onConflict = 'tenant_id, id';
                if (table === 'orders') onConflict = 'tenant_id, local_order_id';
                else if (table === 'recipes') onConflict = 'tenant_id, product_id, ingredient_id';
                else if (table === 'product_modifiers') onConflict = 'tenant_id, product_id, modifier_id';
                else if (table === 'settings') onConflict = 'tenant_id, key';
                else if (table === 'customers') onConflict = 'tenant_id, phone'; // Strongest business key
                else if (table === 'loyalty_cards') onConflict = 'tenant_id, loyalty_code'; // Strongest business key
                else if (mappedTables.includes(table)) onConflict = 'tenant_id, local_id';

                result = await supabase.from(table).upsert(payload, { onConflict });
            } else if (op.operation === 'DELETE') {
                const match: any = { tenant_id: tenant.tenant_id };
                if (payload.local_id) match.local_id = payload.local_id;
                else match.id = payload.id;
                result = await supabase.from(table).delete().match(match);
            }

            if (result?.error) throw result.error;
            markOperationSynced(op.id);
        } catch (err: any) {
            const count = getRetryCount(op.error_message) + 1;
            markOperationError(op.id, `RETRY:${count} | ${err.message}`);
        }
    }
}

export async function syncPullProtocol(db: DatabaseService) {
    const tenant = getCachedTenant();
    if (!tenant) return;

    const supabase = createIsolatedSupabaseClient();
    const sqlite = getCacheDb();

    // HELPER: check pending push
    const hasPendingPush = (table: string): boolean => {
        const row = sqlite.prepare(`SELECT COUNT(*) as c FROM sync_queue WHERE table_name = ? AND synced = 0`).get(table) as any;
        return row?.c > 0;
    };

    const safePull = async (label: string, fn: () => Promise<void>) => {
        try { await fn(); } catch (e) { console.error(`[SYNC] Pull fail: ${label}`, e); }
    };

    // ─── CRITICAL: DISABLE FK DURING SYNC DOWN ───
    // This allows child records to be inserted before their parents are synced.
    db.getDb().pragma('foreign_keys = OFF');

    try {
        await safePull('roles', async () => {
            const { data } = await supabase.from('roles').select('*');
            if (data) db.roles.syncDown(data);
        });

        await safePull('staff', async () => {
            const { data } = await supabase.from('staff').select('*');
            if (data) db.users.syncDown(data);
        });

        await safePull('categories', async () => {
            const { data } = await supabase.from('categories').select('*');
            if (data) db.categories.syncDown(data);
        });

        await safePull('products', async () => {
            const { data } = await supabase.from('products').select('*');
            if (data) db.products.syncDown(data);
            const { data: variants } = await supabase.from('product_variants').select('*');
            if (variants) db.products.syncDownVariants(variants);
        });

        // Pull CUSTOMERS before LOYALTY_CARDS
        await safePull('customers', async () => {
            const { data } = await supabase.from('customers').select('*');
            if (data) db.customers.syncDown(data);
        });

        await safePull('loyalty_cards', async () => {
            const { data } = await supabase.from('loyalty_cards').select('*');
            if (data) db.loyalty.syncDown(data);
        });

        await safePull('inventory', async () => {
            if (!hasPendingPush('inventory')) {
                const { data } = await supabase.from('inventory').select('*');
                if (data) db.inventory.syncDown(data);
            }
        });

        await safePull('ingredients', async () => {
            if (!hasPendingPush('ingredients')) {
                const { data } = await supabase.from('ingredients').select('*');
                if (data) db.ingredients.syncDown(data);
            }
        });

        await safePull('recipes', async () => {
            const { data } = await supabase.from('recipes').select('*');
            if (data) db.recipes.syncDown(data);
        });

        await safePull('modifiers', async () => {
            const { data } = await supabase.from('modifiers').select('*');
            if (data) db.modifiers.syncDown(data);
            const { data: opt } = await supabase.from('modifier_options').select('*');
            if (opt) db.modifiers.syncDownOptions(opt);
            const { data: lnk } = await supabase.from('product_modifiers').select('*');
            if (lnk) db.modifiers.syncDownLinks(lnk);
        });

        await safePull('suppliers', async () => {
            const { data } = await supabase.from('suppliers').select('*');
            if (data) db.suppliers.syncDown(data);
        });

        await safePull('expenses', async () => {
            const { data } = await supabase.from('expenses').select('*');
            if (data) db.expenses.syncDown(data);
        });

        await safePull('settings', async () => {
            const { data } = await supabase.from('settings').select('*');
            if (data) db.settings.syncDown(data);
        });

        await safePull('loyalty_transactions', async () => {
            const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();
            const { data } = await supabase.from('loyalty_transactions').select('*').gte('created_at', ninetyDaysAgo);
            if (data) db.loyalty.syncDownTransactions(data);
        });

        await safePull('orders', async () => {
            const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();
            const { data: orders } = await supabase.from('orders').select('*').gte('created_at', ninetyDaysAgo);
            if (orders) db.orders.syncDown(orders);
            const { data: items } = await supabase.from('order_items').select('*').gte('created_at', ninetyDaysAgo);
            if (items) db.orders.syncDownItems(items);
            const { data: payments } = await supabase.from('payments').select('*').gte('created_at', ninetyDaysAgo);
            if (payments) db.orders.syncDownPayments(payments);
        });

        console.log('[SYNC] Pull finished.');
    } finally {
        db.getDb().pragma('foreign_keys = ON');
    }
}
