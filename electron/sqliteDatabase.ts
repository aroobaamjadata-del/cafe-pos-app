import Database from 'better-sqlite3';
import * as path from 'path';
import { app } from 'electron';

let db: Database.Database | null = null;

export const getCacheDb = (): Database.Database => {
  if (db) return db;
  const dbPath = path.join(app.getPath('userData'), 'pos_offline_cache.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL'); // Performance optimization for offline writes

  db.exec(`
    CREATE TABLE IF NOT EXISTS tenant_cache (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      tenant_id TEXT NOT NULL,
      tenant_name TEXT NOT NULL,
      tenant_code TEXT NOT NULL,
      status TEXT NOT NULL,
      last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS current_device (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      device_id TEXT NOT NULL,
      device_name TEXT NOT NULL,
      activated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- New Table for Offline-First Background Syncronization
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      operation TEXT NOT NULL CHECK(operation IN ('INSERT', 'UPDATE', 'DELETE')),
      payload TEXT NOT NULL, -- JSON string
      synced BOOLEAN DEFAULT 0,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  return db;
};

// ─── Tenant Cache Methods ──────────────────────────────────────────────────
export const cacheTenantLocal = (tenant: any) => {
  const statement = getCacheDb().prepare(`
    INSERT OR REPLACE INTO tenant_cache (id, tenant_id, tenant_name, tenant_code, status, last_synced_at)
    VALUES (1, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  statement.run(tenant.id, tenant.name, tenant.tenant_code, tenant.status);
};

export const getCachedTenant = () => {
  return getCacheDb().prepare("SELECT * FROM tenant_cache WHERE id = 1 AND status = 'active'").get() as any;
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
