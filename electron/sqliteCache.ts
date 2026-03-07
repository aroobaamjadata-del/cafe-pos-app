import Database from 'better-sqlite3';
import * as path from 'path';
import { app } from 'electron';

let db: Database.Database | null = null;

const getCacheDb = (): Database.Database => {
  if (db) return db;
  const dbPath = path.join(app.getPath('userData'), 'pos_offline_cache.db');
  db = new Database(dbPath);

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
  `);
  
  return db;
};

export const cacheTenantLocal = (tenant: any) => {
  const statement = getCacheDb().prepare(`
    INSERT OR REPLACE INTO tenant_cache (id, tenant_id, tenant_name, tenant_code, status, last_synced_at)
    VALUES (1, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  statement.run(tenant.id, tenant.name, tenant.tenant_code, tenant.status);
};

export const getCachedTenant = () => {
  return getCacheDb().prepare('SELECT * FROM tenant_cache WHERE id = 1 AND status = "active"').get() as any;
};

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
