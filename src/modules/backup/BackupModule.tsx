import { useState, useEffect } from 'react';
import { Database, Download, Upload, Clock, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';

export default function BackupModule() {
  const [backups, setBackups] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => { loadBackups(); }, []);

  const loadBackups = async () => {
    setLoading(true);
    const list = await window.electronAPI.backup.list();
    setBackups(list);
    setLoading(false);
  };

  const createBackup = async () => {
    setCreating(true);
    const result = await window.electronAPI.backup.create();
    if (result.success) toast.success('Backup created successfully!');
    else if (result.message !== 'Cancelled') toast.error(result.message);
    loadBackups();
    setCreating(false);
  };

  const restoreBackup = async () => {
    if (!confirm('⚠️ This will replace the current database with a backup. This cannot be undone. Continue?')) return;
    setRestoring(true);
    const result = await window.electronAPI.backup.restore();
    if (result.success) {
      toast.success(result.message, { duration: 6000 });
    } else if (result.message !== 'Cancelled') {
      toast.error(result.message);
    }
    setRestoring(false);
  };

  const fmtSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const fmtDate = (d: string) => {
    try { return format(parseISO(d), 'MMM dd, yyyy • h:mm a'); } catch { return d; }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <h1 className="page-header">Backup & Restore</h1>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <Download size={22} className="text-emerald-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-white mb-1">Create Backup</h3>
              <p className="text-dark-400 text-sm mb-4">Export the current database to a safe location on your computer.</p>
              <button onClick={createBackup} disabled={creating} className="btn-success w-full flex items-center justify-center gap-2">
                {creating ? <div className="w-4 h-4 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" /> : <Download size={16} />}
                {creating ? 'Creating...' : 'Create Backup Now'}
              </button>
            </div>
          </div>
        </div>

        <div className="card border-amber-500/20 bg-amber-500/5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
              <Upload size={22} className="text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-white mb-1">Restore Backup</h3>
              <p className="text-dark-400 text-sm mb-4">Replace current data with a backup file. Restart required after restore.</p>
              <button onClick={restoreBackup} disabled={restoring} className="btn-danger w-full flex items-center justify-center gap-2">
                {restoring ? <div className="w-4 h-4 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" /> : <Upload size={16} />}
                {restoring ? 'Restoring...' : 'Restore from File'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Auto backup status */}
      <div className="card flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
          <Clock size={18} className="text-blue-400" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-white">Automatic Daily Backup</p>
          <p className="text-dark-400 text-sm">Database is automatically backed up every 24 hours. Last 7 auto-backups are kept.</p>
        </div>
        <span className="badge-success flex items-center gap-1">
          <CheckCircle size={12} />Active
        </span>
      </div>

      {/* Backup history */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title flex items-center gap-2">
            <Database size={18} className="text-dark-400" />
            Auto-Backup History
          </h2>
          <button onClick={loadBackups} className="btn-secondary text-sm flex items-center gap-1.5">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-12 shimmer rounded-xl" />)}
          </div>
        ) : backups.length === 0 ? (
          <div className="text-center py-12 text-dark-400">
            <Database size={36} className="opacity-20 mx-auto mb-3" />
            <p>No backups found yet</p>
            <p className="text-xs mt-1">Auto-backup will create one today</p>
          </div>
        ) : (
          <div className="space-y-2">
            {backups.map((b, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 bg-dark-700/40 rounded-xl border border-dark-600/30 hover:border-dark-500/50 transition-colors">
                <Database size={16} className="text-dark-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{b.name}</p>
                  <p className="text-xs text-dark-400">{fmtDate(b.date)}</p>
                </div>
                <span className="text-xs text-dark-400 flex-shrink-0">{fmtSize(b.size)}</span>
                <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Important note */}
      <div className="flex items-start gap-3 px-4 py-3.5 bg-dark-700/30 border border-dark-600/40 rounded-xl">
        <AlertCircle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-300">Important</p>
          <p className="text-xs text-dark-400 mt-0.5">
            Keep backups on an external drive or cloud storage (USB, Google Drive, etc.) in case of hardware failure.
            Regular backups are critical for a business POS system.
          </p>
        </div>
      </div>
    </div>
  );
}
