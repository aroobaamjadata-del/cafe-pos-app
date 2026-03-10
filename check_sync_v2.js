const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');

const userDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'cloud-n-cream-pos');
const cacheDbPath = path.join(userDataPath, 'pos_offline_cache.db');

console.log('Checking database at:', cacheDbPath);

const db = new sqlite3.Database(cacheDbPath, (err) => {
    if (err) {
        return console.error('Error opening database:', err.message);
    }
});

db.serialize(() => {
    db.get("SELECT * FROM tenant_cache WHERE id = 1", (err, row) => {
        console.log('--- Tenant Cache ---');
        console.log(row ? row : 'Empty');
    });

    db.get("SELECT * FROM current_device WHERE id = 1", (err, row) => {
        console.log('\n--- Device Cache ---');
        console.log(row ? row : 'Empty');
    });

    db.all(`
        SELECT table_name, synced, COUNT(*) as count 
        FROM sync_queue 
        GROUP BY table_name, synced
    `, (err, rows) => {
        console.log('\n--- Sync Queue Stats ---');
        console.table(rows);
    });

    db.all(`
        SELECT DISTINCT table_name, error_message
        FROM sync_queue 
        WHERE error_message IS NOT NULL
    `, (err, rows) => {
        if (rows && rows.length > 0) {
            console.log('\n--- Unique Sync Errors ---');
            rows.forEach(r => {
                console.log(`Table: ${r.table_name} | Error: ${r.error_message}`);
            });
        } else {
            console.log('\nNo sync errors found in queue.');
        }
    });

    db.get(`
        SELECT payload FROM sync_queue WHERE table_name = 'products' AND synced = 0 LIMIT 1
    `, (err, row) => {
        if (row) {
            console.log('\n--- Sample Unsynced Product Payload ---');
            const p = JSON.parse(row.payload);
            console.log(JSON.stringify(p, null, 2));
        }
    });
});

db.close();
