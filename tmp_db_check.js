const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

// Path to pos.db - Adjusting for Windows AppData
const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'cloud-n-cream-pos', 'data', 'pos.db');
const cacheDbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'cloud-n-cream-pos', 'pos_offline_cache.db');

try {
    const db = new Database(dbPath);
    const cacheDb = new Database(cacheDbPath);

    console.log('--- CACHE DB (tenant_cache) ---');
    const tenant = cacheDb.prepare('SELECT * FROM tenant_cache').get();
    console.log(JSON.stringify(tenant, null, 2));

    console.log('\n--- POS DB (Counts) ---');
    const tables = ['products', 'categories', 'users', 'orders'];
    for (const t of tables) {
        const row = db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get();
        console.log(`${t}: ${row.c}`);
    }

    console.log('\n--- SAMPLE CATEGORIES (tenant_id) ---');
    const cats = db.prepare('SELECT id, name, tenant_id FROM categories LIMIT 5').all();
    console.log(JSON.stringify(cats, null, 2));

    console.log('\n--- SAMPLE PRODUCTS (tenant_id) ---');
    const prods = db.prepare('SELECT id, name, tenant_id FROM products LIMIT 5').all();
    console.log(JSON.stringify(prods, null, 2));

} catch (err) {
    console.error('Error reading DB:', err.message);
}
