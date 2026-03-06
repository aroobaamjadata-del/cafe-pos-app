import { useState } from 'react';
import { KeyRound, ShieldCheck, AlertCircle } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import toast from 'react-hot-toast';

export default function ActivationScreen() {
  const [licenseKey, setLicenseKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { setActivation } = useAppStore();

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (licenseKey.length < 10) {
      setError('Invalid license key format.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await window.electronAPI.license.validate(licenseKey);
      if (res.success) {
        toast.success('Successfully activated ' + res.cafe_name);
        setActivation(true, res.tenant_id);
      } else {
        setError(res.error || 'Failed to activate license');
        toast.error('Activation failed');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during activation');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Brand identity */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-brand-500/10 rounded-2xl flex items-center justify-center mb-4 border border-brand-500/20">
            <ShieldCheck size={32} className="text-brand-500" />
          </div>
          <h1 className="text-3xl font-bold text-white font-display text-center">Cloud n Cream POS</h1>
          <p className="text-brand-400 font-semibold text-sm mt-2 text-center uppercase tracking-widest">Enterprise Edition</p>
        </div>

        {/* Activation Form */}
        <div className="bg-dark-800 rounded-2xl border border-dark-700/50 p-8 shadow-2xl">
          <h2 className="text-xl font-bold text-white mb-6">Activate Your Terminal</h2>
          
          <form onSubmit={handleActivate} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">License Key</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <KeyRound size={18} className="text-dark-400" />
                </div>
                <input
                  type="text"
                  value={licenseKey}
                  onChange={(e) => {
                    setLicenseKey(e.target.value.toUpperCase());
                    setError('');
                  }}
                  className="block w-full pl-10 pr-3 py-3 border border-dark-600 rounded-xl bg-dark-900 text-white placeholder-dark-500 focus:outline-none focus:border-brand-500 transition-colors font-mono tracking-wider"
                  placeholder="DEMO-XXXX-XXXX-XXXX"
                  required
                />
              </div>
              <p className="mt-2 text-xs text-dark-400">
                Enter the offline activation key provided by the Super Admin to authorize this terminal.
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-red-400 text-sm bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !licenseKey}
              className="btn-primary w-full flex justify-center py-3.5 px-4 rounded-xl text-sm font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Activate Terminal'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
