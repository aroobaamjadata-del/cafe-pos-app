import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { DatabaseService } from './database';

const BACKUP_DIR = path.join(app.getPath('userData'), 'backups');

export class BackupService {
  constructor(private db: DatabaseService) {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  createBackup(destPath: string): { success: boolean; message: string; path?: string } {
    try {
      const dbPath = this.db.getDbPath();
      fs.copyFileSync(dbPath, destPath);
      return { success: true, message: 'Backup created successfully', path: destPath };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  restoreBackup(srcPath: string): { success: boolean; message: string } {
    try {
      const dbPath = this.db.getDbPath();
      // Create a safety backup before restoring
      const safetyPath = dbPath + '.before_restore';
      fs.copyFileSync(dbPath, safetyPath);
      fs.copyFileSync(srcPath, dbPath);
      return { success: true, message: 'Database restored. Please restart the application.' };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  listBackups(): { name: string; path: string; size: number; date: string }[] {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.db'))
      .map(f => {
        const filePath = path.join(BACKUP_DIR, f);
        const stat = fs.statSync(filePath);
        return { name: f, path: filePath, size: stat.size, date: stat.mtime.toISOString() };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return files;
  }

  scheduleAutoBackup(): void {
    // Run auto-backup every 24 hours
    const interval = 24 * 60 * 60 * 1000;
    setInterval(() => {
      const backupPath = path.join(BACKUP_DIR, `auto-backup-${new Date().toISOString().split('T')[0]}.db`);
      this.createBackup(backupPath);
      this.cleanOldBackups(7);
    }, interval);

    // Also run immediately if last backup is old
    const today = new Date().toISOString().split('T')[0];
    const todayBackup = path.join(BACKUP_DIR, `auto-backup-${today}.db`);
    if (!fs.existsSync(todayBackup)) {
      this.createBackup(todayBackup);
    }
  }

  private cleanOldBackups(keepDays: number): void {
    const cutoff = Date.now() - keepDays * 86400000;
    fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('auto-backup-'))
      .forEach(f => {
        const filePath = path.join(BACKUP_DIR, f);
        const stat = fs.statSync(filePath);
        if (stat.mtime.getTime() < cutoff) fs.unlinkSync(filePath);
      });
  }
}
