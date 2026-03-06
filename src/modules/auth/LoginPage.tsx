import { useState } from 'react';
import { useAppStore } from '../../store/appStore';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const login = useAppStore(s => s.login);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) { setError('Please enter username and password'); return; }
    setLoading(true);
    setError('');
    try {
      const result = await window.electronAPI.auth.login(username, password);
      if (result.success) {
        toast.success(`Welcome back, ${result.user.full_name}!`);
        login(result.user);
      } else {
        setError(result.message || 'Login failed');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-dark-900 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-cream-500/8 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-900/20 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md px-6">
        {/* Logo */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-brand-500/20 border border-brand-500/30 mb-4">
            <span className="text-4xl">☕</span>
          </div>
          <h1 className="text-3xl font-bold font-display text-white">Cloud n Cream</h1>
          <p className="text-dark-300 mt-1">Point of Sale System</p>
        </div>

        {/* Login Card */}
        <div className="card border-dark-600/80 shadow-2xl shadow-black/50 animate-slide-up">
          <h2 className="text-xl font-bold text-white mb-6 font-display">Sign In</h2>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm animate-fade-in">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-dark-200 mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="input-field"
                placeholder="Enter username"
                autoComplete="username"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-200 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input-field"
                placeholder="Enter password"
                autoComplete="current-password"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 mt-2 text-base flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </>
              ) : (
                <>Sign In</>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-dark-700/50">
            <p className="text-xs text-dark-400 text-center">
              Default credentials: <span className="text-dark-200 font-mono">admin</span> / <span className="text-dark-200 font-mono">admin123</span>
            </p>
          </div>
        </div>

        <p className="text-center text-dark-500 text-xs mt-6">
          v1.0.0 — Cloud n Cream POS © 2026
        </p>
      </div>
    </div>
  );
}
