const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Path to the SQLite database
// Based on electron/sqliteDatabase.ts: path.join(app.getPath('userData'), 'pos_offline_cache.db')
// On Windows, app.getPath('userData') is typically %APPDATA%/Cloud n Cream POS
const userDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'cloud-n-cream-pos');
const dbPath = path.join(userDataPath, 'pos_offline_cache.db');

console.log('Checking database at:', dbPath);

if (!fs.existsSync(dbPath)) {
    console.error('Database file not found!');
    process.exit(1);
}

const db = new Database(dbPath);

try {
    const syncQueueCount = db.prepare('SELECT COUNT(*) as count FROM sync_queue').get();
    console.log('Total items in sync_queue:', syncQueueCount.count);

    const unsyncedItems = db.prepare('SELECT COUNT(*) as count FROM sync_queue WHERE synced = 0').get();
    console.log('Unsynced items:', unsyncedItems.count);

    const tenant = db.prepare('SELECT * FROM tenant_cache WHERE id = 1').get();
    console.log('Tenant in cache:', tenant ? `${tenant.tenant_name} (${tenant.tenant_id}) Status: ${tenant.status}` : 'NONE');

    const device = db.prepare('SELECT * FROM current_device WHERE id = 1').get();
    console.log('Device in cache:', device ? `${device.device_name} (${device.device_id})` : 'NONE');

    const errors = db.prepare('SELECT table_name, error_message, COUNT(*) as count FROM sync_queue WHERE error_message IS NOT NULL GROUP BY table_name, error_message').all();
    if (errors.length > 0) {
        console.log('\nSync Errors:');
        errors.forEach(err => {
            console.log(`- Table: ${err.table_name}, Error: ${err.error_message}, Count: ${err.count}`);
        });
    }

    const recentItems = db.prepare('SELECT id, table_name, operation, synced, error_message, created_at FROM sync_queue ORDER BY created_at DESC LIMIT 5').all();
    console.log('\nRecent 5 items:');
    recentItems.forEach(item => {
        console.log(`[${item.id}] ${item.table_name} ${item.operation} | Synced: ${item.synced} | Error: ${item.error_message || 'None'} | Created: ${item.created_at}`);
    });

} catch (err) {
    console.error('Error querying database:', err.message);
} finally {
    db.close();
}
