import { useState } from 'react';
import { KeyRound, ShieldCheck, AlertCircle, Wifi, WifiOff, CheckCircle } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import toast from 'react-hot-toast';
import TitleBar from '../../components/layout/TitleBar';

type ActivationStep = 'idle' | 'checking-supabase' | 'checking-cache' | 'done';

export default function ActivationScreen() {
  const [licenseKey, setLicenseKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<ActivationStep>('idle');
  const [mode, setMode] = useState<'online' | 'offline' | null>(null);
  const { setActivation } = useAppStore();

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (licenseKey.length < 8) {
      setError('License key is too short.');
      return;
    }

    setIsLoading(true);
    setError('');
    setStep('checking-supabase');

    try {
      const res = await window.electronAPI.system.activate(licenseKey);

      if (res.success) {
        setMode(res.mode ?? 'offline');
        setStep('done');

        if (res.mode === 'offline') {
          toast('🔌 Offline mode — license validated from local cache', {
            style: { background: '#1a2a1a', color: '#86efac', border: '1px solid #166534' },
            duration: 6000,
          });
        } else {
          toast.success(`✅ Terminal activated for ${res.cafe_name}`);
        }

        setTimeout(() => {
          setActivation(true, res.tenant_id);
        }, 800);
      } else {
        setStep('idle');
        setError(res.error || 'Failed to activate license');
      }
    } catch (err: any) {
      setStep('idle');
      setError(err.message || 'An error occurred during activation');
    } finally {
      setIsLoading(false);
    }
  };

  const stepLabel = {
    idle: '',
    'checking-supabase': 'Verifying with Supabase...',
    'checking-cache': 'Checking local cache...',
    done: 'Activation complete!',
  }[step];

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      <TitleBar />
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          {/* Brand */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-brand-500/10 rounded-2xl flex items-center justify-center mb-4 border border-brand-500/20">
              <ShieldCheck size={32} className="text-brand-500" />
            </div>
            <h1 className="text-3xl font-bold text-white font-display text-center">Cloud n Cream POS</h1>
            <p className="text-brand-400 font-semibold text-sm mt-2 text-center uppercase tracking-widest">Enterprise Edition</p>
          </div>

          {/* Activation Card */}
          <div className="bg-dark-800 rounded-2xl border border-dark-700/50 p-8 shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-6">Activate Your Terminal</h2>

            {/* Success State */}
            {step === 'done' && (
              <div className="flex flex-col items-center gap-4 py-6">
                <CheckCircle size={48} className="text-green-400" />
                <p className="text-green-300 font-semibold text-center">Terminal Activated!</p>
                {mode === 'offline' && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-yellow-300 text-sm">
                    <WifiOff size={16} />
                    <span>Offline Mode — License from local cache</span>
                  </div>
                )}
                {mode === 'online' && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/30 rounded-xl text-green-300 text-sm">
                    <Wifi size={16} />
                    <span>Online — Validated via Supabase</span>
                  </div>
                )}
              </div>
            )}

            {/* Form */}
            {step !== 'done' && (
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
                      placeholder="XXXX-XXXX-XXXX-XXXX"
                      required
                      disabled={isLoading}
                    />
                  </div>
                  <p className="mt-2 text-xs text-dark-400">
                    Enter the license key provided by your Super Admin. Works online (Supabase) or offline (local cache).
                  </p>
                </div>

                {/* Progress indicator */}
                {isLoading && stepLabel && (
                  <div className="flex items-center gap-3 text-dark-300 text-sm bg-dark-900/50 p-3 rounded-xl border border-dark-700">
                    <div className="w-4 h-4 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin flex-shrink-0" />
                    <span>{stepLabel}</span>
                  </div>
                )}

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

                {/* Mode indicator hint */}
                <div className="flex items-center justify-center gap-4 pt-1 text-xs text-dark-500">
                  <span className="flex items-center gap-1"><Wifi size={12} /> Online → Supabase validation</span>
                  <span>·</span>
                  <span className="flex items-center gap-1"><WifiOff size={12} /> Offline → Local cache</span>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
