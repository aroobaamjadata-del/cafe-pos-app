import Database from 'better-sqlite3';
import * as path from 'path';
import { app } from 'electron';
import { syncEvents, SYNC_EVENT_DATA_CHANGED } from './syncEvents';

let db: Database.Database | null = null;

export const getCacheDb = (): Database.Database => {
  if (db) return db;
  const dbPath = path.join(app.getPath('userData'), 'pos_offline_cache.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL'); // Performance optimization for offline writes

    db.exec(`
    CREATE TABLE IF NOT EXISTS tenant_cache (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      tenant_id TEXT,
      tenant_name TEXT,
      tenant_code TEXT,
      status TEXT,
      last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS current_device (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      device_id TEXT NOT NULL,
      device_name TEXT NOT NULL,
      activated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      operation TEXT NOT NULL CHECK(operation IN ('INSERT', 'UPDATE', 'DELETE')),
      payload TEXT NOT NULL,
      synced BOOLEAN DEFAULT 0,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  return db;
};

// ─── Tenant Cache Methods ──────────────────────────────────────────────────
export const cacheTenantLocal = (tenant: any) => {
  console.log('[CACHE] Preserving tenant locally:', JSON.stringify(tenant));
  
  // Extract values with deep fallbacks
  const t_id = tenant.id || tenant.tenant_id || tenant.uuid;
  const t_name = tenant.name || tenant.tenant_name || tenant.business_name || 'Cafe User';
  const t_code = tenant.tenant_code || tenant.code || '';
  const t_status = tenant.status || 'active';

  const statement = getCacheDb().prepare(`
    INSERT OR REPLACE INTO tenant_cache (id, tenant_id, tenant_name, tenant_code, status, last_synced_at)
    VALUES (1, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  
  statement.run(t_id, t_name, t_code, t_status);
};

export const getCachedTenant = () => {
  return getCacheDb().prepare("SELECT * FROM tenant_cache WHERE id = 1 AND LOWER(status) IN ('active', 'trialing', 'trial')").get() as any;
};

// ─── Device Cache Methods ──────────────────────────────────────────────────
export const cacheDeviceLocal = (deviceId: string, deviceName: string) => {
  const statement = getCacheDb().prepare(`
    INSERT OR REPLACE INTO current_device (id, device_id, device_name, activated_at)
    VALUES (1, ?, ?, CURRENT_TIMESTAMP)
  `);
  statement.run(deviceId, deviceName);
};

export const getCachedDevice = () => {
  return getCacheDb().prepare('SELECT * FROM current_device WHERE id = 1').get() as any;
};

// ─── Sync Queue Methods ────────────────────────────────────────────────────
export const enqueueSyncOperation = (tableName: string, operation: 'INSERT'|'UPDATE'|'DELETE', payload: any) => {
  const statement = getCacheDb().prepare(`
    INSERT INTO sync_queue (table_name, operation, payload) VALUES (?, ?, ?)
  `);
  statement.run(tableName, operation, JSON.stringify(payload));
  syncEvents.emit(SYNC_EVENT_DATA_CHANGED);
};

export const getUnsyncedOperations = (limit = 50) => {
  return getCacheDb().prepare(`
    SELECT * FROM sync_queue WHERE synced = 0 ORDER BY created_at ASC LIMIT ?
  `).all(limit) as any[];
};

export const markOperationSynced = (id: number) => {
  getCacheDb().prepare('UPDATE sync_queue SET synced = 1 WHERE id = ?').run(id);
};

export const markOperationError = (id: number, errorMsg: string) => {
  getCacheDb().prepare('UPDATE sync_queue SET error_message = ? WHERE id = ?').run(errorMsg, id);
};
