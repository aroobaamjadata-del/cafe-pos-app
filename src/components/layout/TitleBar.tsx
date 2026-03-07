import { useAppStore } from '../../store/appStore';

export default function TitleBar() {
  const { user } = useAppStore();

  const minimize = () => window.electronAPI?.window.minimize();
  const maximize = () => window.electronAPI?.window.maximize();
  const close = () => window.electronAPI?.window.close();

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

      {/* Right side - user info + window controls */}
      <div
        className="ml-auto flex items-center gap-4"
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
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
