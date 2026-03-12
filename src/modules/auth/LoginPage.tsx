import { useState } from 'react';
import { KeyRound, ShieldCheck, AlertCircle, Wifi, Mail, Fingerprint, Lock, ArrowRight, ArrowLeft, CheckCircle } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import toast from 'react-hot-toast';
import TitleBar from '../../components/layout/TitleBar';

type AuthStep = 'email' | 'login' | 'setup' | 'forgot_validate' | 'forgot_reset';

export default function LoginPage() {
  const [step, setStep] = useState<AuthStep>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Forgot Password fields
  const [licenseKey, setLicenseKey] = useState('');
  const [tenantCode, setTenantCode] = useState('');
  
  const [userData, setUserData] = useState<any>(null);
  const login = useAppStore(s => s.login);

  // Step 1: Email Check
  const handleEmailCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { setError('Email is required'); return; }
    
    setLoading(true);
    setError('');
    try {
      const result = await window.electronAPI.auth.checkUser(email);
      if (result.success && result.data?.exists) {
        setUserData(result.data);
        if (result.data.needsSetup) {
          setStep('setup');
        } else {
          setStep('login');
        }
      } else {
        setError(result.error || 'Identity verification failed. Please check your email.');
      }
    } catch (err: any) {
      setError('Connection failed. Please check network.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) { setError('Password is required'); return; }
    
    setLoading(true);
    setError('');
    try {
      const result = await window.electronAPI.auth.login(email, password);
      if (result.success) {
        toast.success(`Welcome, ${result.user.full_name}!`);
        login(result.user);
      } else {
        setError(result.message || 'Invalid password');
      }
    } catch (err) {
      setError('Login failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 3: First-time Password Setup
  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !confirmPassword) { setError('All fields required'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (password.length < 6) { setError('Min 6 characters required'); return; }

    setLoading(true);
    setError('');
    try {
      const result = await window.electronAPI.auth.setupPassword(email, password);
      if (result.success) {
        toast.success('Password set! Please sign in.');
        setStep('login');
        setPassword('');
        setConfirmPassword('');
      } else {
        setError(result.message || 'Setup failed');
      }
    } catch (err) {
      setError('System error during setup.');
    } finally {
      setLoading(false);
    }
  };

  // Step 4: Validate Forgot Pass (License + Tenant)
  const handleForgotValidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKey || !tenantCode) { setError('All fields required'); return; }

    setLoading(true);
    setError('');
    try {
      const result = await window.electronAPI.auth.validateReset(licenseKey, tenantCode);
      if (result.success) {
        setStep('forgot_reset');
      } else {
        setError(result.error || 'Invalid credentials');
      }
    } catch (err) {
      setError('Validation error.');
    } finally {
      setLoading(false);
    }
  };

  // Step 5: Perform Reset
  const handleForgotReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !confirmPassword) { setError('Fields required'); return; }
    if (password !== confirmPassword) { setError('Passwords match failed'); return; }

    setLoading(true);
    setError('');
    try {
      const result = await window.electronAPI.auth.performReset(tenantCode, password);
      if (result.success) {
        toast.success('System password reset successfully');
        setStep('email');
        setPassword('');
        setConfirmPassword('');
      } else {
        setError(result.error || 'Reset failed');
      }
    } catch (err) {
      setError('Reset error.');
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    setError('');
    if (step === 'forgot_validate') setStep('login');
    else if (step === 'forgot_reset') setStep('forgot_validate');
    else setStep('email');
  };

  return (
    <div className="h-screen flex flex-col bg-dark-950 relative overflow-hidden font-sans">
      <TitleBar />
      <div className="flex-1 flex items-center justify-center relative p-6">
        {/* Background Gradients */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-brand-500/10 rounded-full blur-[120px] -mr-48 -mt-48" />
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-cream-500/5 rounded-full blur-[120px] -ml-48 -mb-48" />
        </div>

        <div className="w-full max-w-[420px] relative z-10">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-[2rem] bg-gradient-to-br from-brand-400 to-brand-600 p-0.5 shadow-2xl shadow-brand-500/20 mb-6 group">
                <div className="w-full h-full bg-dark-900 rounded-[1.9rem] flex items-center justify-center text-5xl group-hover:scale-110 transition-transform">
                    ☕
                </div>
            </div>
            <h1 className="text-4xl font-black text-white tracking-tight leading-none mb-2">Cloud n Cream</h1>
            <p className="text-dark-400 font-medium">Enterprise Point of Sale</p>
          </div>

          <div className="bg-dark-900/50 backdrop-blur-xl border border-white/5 rounded-3xl p-8 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-8">
                {step !== 'email' && (
                    <button onClick={goBack} className="flex items-center gap-1.5 text-dark-400 hover:text-white transition-colors text-sm font-medium mb-4">
                        <ArrowLeft size={16} /> Back
                    </button>
                )}
                <h2 className="text-2xl font-bold text-white tracking-tight">
                    {step === 'email' && 'Welcome Back'}
                    {step === 'login' && 'Sign In'}
                    {step === 'setup' && 'Account Setup'}
                    {step === 'forgot_validate' && 'Recovery'}
                    {step === 'forgot_reset' && 'Reset Password'}
                </h2>
                <p className="text-dark-400 text-sm mt-1 font-medium">
                    {step === 'email' && 'Enter your organizational email to continue'}
                    {step === 'login' && `Hello ${userData?.fullName}, enter your password`}
                    {step === 'setup' && 'Create your POS access password'}
                    {step === 'forgot_validate' && 'Verify your License & Tenant identity'}
                    {step === 'forgot_reset' && 'Choose a strong new password'}
                </p>
            </div>

            {error && (
                <div className="mb-6 flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm leading-relaxed animate-in shake duration-300">
                    <AlertCircle size={18} className="shrink-0 mt-0.5" />
                    <p>{error}</p>
                </div>
            )}

            {step === 'email' && (
                <form onSubmit={handleEmailCheck} className="space-y-5">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-dark-400 uppercase tracking-widest ml-1">Work Email</label>
                        <div className="relative group">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-500 group-focus-within:text-brand-400 transition-colors" size={20} />
                            <input 
                                type="email" value={email} onChange={e => setEmail(e.target.value)}
                                className="w-full bg-dark-800 border border-white/5 focus:border-brand-500/50 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-dark-600 outline-none transition-all shadow-inner"
                                placeholder="name@company.com" disabled={loading} autoFocus
                            />
                        </div>
                    </div>
                    <button type="submit" disabled={loading} className="w-full h-14 bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-dark-950 font-bold rounded-2xl transition-all flex items-center justify-center gap-2 group">
                        {loading ? <span className="animate-pulse">Checking Identity...</span> : <>Continue <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" /></>}
                    </button>
                </form>
            )}

            {step === 'login' && (
                <form onSubmit={handleLogin} className="space-y-5">
                    <div className="space-y-2 text-center py-4 bg-brand-500/5 rounded-2xl border border-brand-500/10 mb-6">
                        <div className="w-12 h-12 bg-brand-500/20 rounded-full flex items-center justify-center mx-auto mb-2 text-brand-400">
                            <Fingerprint size={24} />
                        </div>
                        <span className="text-white font-bold block">{userData?.fullName}</span>
                        <span className="text-xs text-dark-400 font-medium">{email}</span>
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between items-end mr-1">
                            <label className="text-xs font-bold text-dark-400 uppercase tracking-widest ml-1">Password</label>
                            <button type="button" onClick={() => setStep('forgot_validate')} className="text-xs font-bold text-brand-500 hover:text-brand-400 transition-colors">Forgot Password?</button>
                        </div>
                        <div className="relative group">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-500 group-focus-within:text-brand-400 transition-colors" size={20} />
                            <input 
                                type="password" value={password} onChange={e => setPassword(e.target.value)}
                                className="w-full bg-dark-800 border border-white/5 focus:border-brand-500/50 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-dark-600 outline-none transition-all shadow-inner"
                                placeholder="••••••••" disabled={loading} autoFocus
                            />
                        </div>
                    </div>
                    <button type="submit" disabled={loading} className="w-full h-14 bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-dark-950 font-bold rounded-2xl transition-all flex items-center justify-center gap-2">
                        {loading ? 'Authenticating...' : 'Sign In'}
                    </button>
                    <button type="button" onClick={() => setStep('email')} className="w-full text-dark-400 hover:text-white transition-colors text-sm font-medium">Not you? Switch account</button>
                </form>
            )}

            {step === 'setup' && (
                <form onSubmit={handleSetup} className="space-y-5">
                    <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl mb-4">
                        <p className="text-xs text-amber-500 font-bold uppercase tracking-wider mb-1">Attention required</p>
                        <p className="text-sm text-dark-200">First-time login detected. Please create a secure password to activate your terminal access.</p>
                    </div>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-dark-400 uppercase tracking-widest ml-1">New Password</label>
                            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="input-field-alt" placeholder="Create password" disabled={loading} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-dark-400 uppercase tracking-widest ml-1">Confirm Password</label>
                            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="input-field-alt" placeholder="Confirm password" disabled={loading} />
                        </div>
                    </div>
                    <button type="submit" disabled={loading} className="w-full h-14 bg-brand-500 hover:bg-brand-400 text-dark-950 font-bold rounded-2xl transition-all">
                        {loading ? 'Activating...' : 'Activate Account'}
                    </button>
                </form>
            )}

            {step === 'forgot_validate' && (
                <form onSubmit={handleForgotValidate} className="space-y-5">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-dark-400 uppercase tracking-widest ml-1">License Key</label>
                            <input value={licenseKey} onChange={e => setLicenseKey(e.target.value)} className="input-field-alt" placeholder="Enter License Key" disabled={loading} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-dark-400 uppercase tracking-widest ml-1">Tenant Code</label>
                            <input value={tenantCode} onChange={e => setTenantCode(e.target.value)} className="input-field-alt" placeholder="Enter Tenant Code" disabled={loading} />
                        </div>
                    </div>
                    <button type="submit" disabled={loading} className="w-full h-14 bg-dark-800 hover:bg-dark-700 text-white font-bold rounded-2xl border border-white/5 transition-all">
                        {loading ? 'Verifying...' : 'Validate Identity'}
                    </button>
                </form>
            )}

            {step === 'forgot_reset' && (
                <form onSubmit={handleForgotReset} className="space-y-5">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-dark-400 uppercase tracking-widest ml-1">New Password</label>
                            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="input-field-alt" placeholder="New password" disabled={loading} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-dark-400 uppercase tracking-widest ml-1">Confirm Password</label>
                            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="input-field-alt" placeholder="Confirm password" disabled={loading} />
                        </div>
                    </div>
                    <button type="submit" disabled={loading} className="w-full h-14 bg-brand-500 hover:bg-brand-400 text-dark-950 font-bold rounded-2xl transition-all">
                        {loading ? 'Updating Cloud...' : 'Reset & Update Cloud'}
                    </button>
                </form>
            )}

            <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between text-[10px] font-bold text-dark-500 uppercase tracking-widest">
              <span className="flex items-center gap-1"><Wifi size={10} className="text-green-500" /> Terminal online</span>
              <span>Encrypted SSL 256</span>
            </div>
          </div>

          <div className="text-center mt-8">
            <p className="text-[10px] font-bold text-dark-600 uppercase tracking-[0.2em]">
                Enterprise Authentication Protocol v2.0
            </p>
          </div>
        </div>
      </div>

      <style>{`
        .input-field-alt {
            width: 100%;
            background-color: rgba(255,255,255,0.03);
            border: 1px solid rgba(255,255,255,0.05);
            border-radius: 1rem;
            padding: 1rem 1.25rem;
            color: white;
            outline: none;
            transition: all 0.2s;
        }
        .input-field-alt:focus {
            border-color: rgba(226, 90, 38, 0.4);
            background-color: rgba(255,255,255,0.05);
        }
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-4px); }
            75% { transform: translateX(4px); }
        }
        .animate-shake {
            animation: shake 0.3s ease-in-out;
        }
      `}</style>
    </div>
  );
}
