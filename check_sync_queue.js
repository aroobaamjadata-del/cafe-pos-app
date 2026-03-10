const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const userDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'cloud-n-cream-pos');
const cacheDbPath = path.join(userDataPath, 'pos_offline_cache.db');

console.log('Checking database at:', cacheDbPath);

try {
    const db = new Database(cacheDbPath);
    
    const tenant = db.prepare("SELECT * FROM tenant_cache WHERE id = 1").get();
    console.log('--- Tenant Cache ---');
    console.log(tenant ? tenant : 'Empty');

    const device = db.prepare("SELECT * FROM current_device WHERE id = 1").get();
    console.log('\n--- Device Cache ---');
    console.log(device ? device : 'Empty');

    const queueStats = db.prepare(`
        SELECT table_name, synced, COUNT(*) as count 
        FROM sync_queue 
        GROUP BY table_name, synced
    `).all();
    console.log('\n--- Sync Queue Stats ---');
    console.table(queueStats);

    const errors = db.prepare(`
        SELECT table_name, error_message, created_at 
        FROM sync_queue 
        WHERE error_message IS NOT NULL 
        LIMIT 10
    `).all();
    if (errors.length > 0) {
        console.log('\n--- Recent Sync Errors ---');
        console.table(errors);
    } else {
        console.log('\nNo sync errors found in queue.');
    }

    // Check products specifically
    const unsyncedProducts = db.prepare(`
        SELECT payload FROM sync_queue WHERE table_name = 'products' AND synced = 0 LIMIT 1
    `).get();
    if (unsyncedProducts) {
        console.log('\n--- Sample Unsynced Product Payload ---');
        console.log(unsyncedProducts.payload);
    }

} catch (err) {
    console.error('Error reading database:', err.message);
}
