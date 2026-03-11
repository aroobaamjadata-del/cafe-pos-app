import { useAppStore } from '../../store/appStore';
import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

type SyncState = 'idle' | 'syncing' | 'success' | 'error';

export default function TitleBar() {
  const { user } = useAppStore();
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [pendingOps, setPendingOps] = useState(0);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  const minimize = () => window.electronAPI?.window.minimize();
  const maximize = () => window.electronAPI?.window.maximize();
  const close = () => window.electronAPI?.window.close();

  // Poll sync queue status every 30 seconds
  const refreshStatus = useCallback(async () => {
    try {
      const status = await (window.electronAPI as any)?.sync?.getStatus();
      if (status) setPendingOps(status.pending ?? 0);
    } catch { /* not critical */ }
  }, []);

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 30000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  const handleSyncNow = async () => {
    if (syncState === 'syncing') return;
    setSyncState('syncing');
    try {
      const result = await (window.electronAPI as any)?.sync?.forceNow();
      if (result?.errors > 0) {
        setSyncState('error');
        toast.error('Sync completed with errors. Check connection.');
      } else {
        setSyncState('success');
        setLastSynced(new Date());
        toast.success(`Sync complete — ${result?.pushed ?? 0} changes pushed`, { icon: '☁️' });
      }
      await refreshStatus();
    } catch (err) {
      setSyncState('error');
      toast.error('Sync failed — check your internet connection');
    } finally {
      // Return to idle after 3 seconds
      setTimeout(() => setSyncState('idle'), 3000);
    }
  };

  const syncLabel = syncState === 'syncing' ? 'Syncing…'
    : syncState === 'success' ? 'Synced'
    : syncState === 'error' ? 'Sync Error'
    : pendingOps > 0 ? `${pendingOps} pending`
    : lastSynced ? 'Synced' : 'Sync';

  const syncDotColor = syncState === 'syncing' ? 'bg-blue-400 animate-pulse'
    : syncState === 'success' ? 'bg-emerald-400'
    : syncState === 'error' ? 'bg-red-400'
    : pendingOps > 0 ? 'bg-amber-400 animate-pulse'
    : 'bg-emerald-400';

  return (
    <div
      className="h-11 bg-dark-900 border-b border-dark-700/50 flex items-center px-4 select-none flex-shrink-0"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      {/* App branding */}
      <div className="flex items-center gap-2">
        <span className="text-lg">☕</span>
        <span className="text-sm font-semibold text-dark-100 font-display">Cloud n Cream POS</span>
        <span className="text-dark-500 text-xs ml-2">v1.0.6</span>
      </div>

      {/* Right side */}
      <div
        className="ml-auto flex items-center gap-3"
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        {/* ── Sync Status Button ── */}
        {user && (
          <button
            onClick={handleSyncNow}
            disabled={syncState === 'syncing'}
            title={`Manual Sync — ${pendingOps} operation(s) pending\n${lastSynced ? 'Last sync: ' + lastSynced.toLocaleTimeString() : 'No sync yet'}`}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all border
              ${syncState === 'syncing'
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 cursor-wait'
                : syncState === 'error'
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : pendingOps > 0
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
                : 'bg-dark-800 border-dark-600/50 text-dark-400 hover:text-white hover:border-dark-500'
              }`}
          >
            {syncState === 'syncing' ? (
              <div className="w-2.5 h-2.5 border border-blue-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${syncDotColor}`} />
            )}
            {syncLabel}
          </button>
        )}

        {/* User info */}
        {user && (
          <div className="flex items-center gap-2 text-xs text-dark-400">
            <div className="w-6 h-6 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-400 font-bold text-xs">
              {user.full_name.charAt(0)}
            </div>
            <span>{user.full_name}</span>
            <span className="badge-brand text-[10px]">{user.role_name}</span>
          </div>
        )}

        {/* Window controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={minimize}
            className="w-8 h-7 rounded flex items-center justify-center text-dark-400 hover:text-white hover:bg-dark-700 transition-all"
            title="Minimize"
          >
            <svg width="12" height="2" viewBox="0 0 12 2" fill="currentColor">
              <rect width="12" height="2" rx="1"/>
            </svg>
          </button>
          <button
            onClick={maximize}
            className="w-8 h-7 rounded flex items-center justify-center text-dark-400 hover:text-white hover:bg-dark-700 transition-all"
            title="Maximize"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="1" y="1" width="8" height="8" rx="1.5"/>
            </svg>
          </button>
          <button
            onClick={close}
            className="w-8 h-7 rounded flex items-center justify-center text-dark-400 hover:text-white hover:bg-red-500 transition-all"
            title="Close"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1 1L9 9M9 1L1 9"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
