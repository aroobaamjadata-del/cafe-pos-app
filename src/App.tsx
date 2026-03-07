import { useEffect, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { useAppStore } from './store/appStore';
import LoginPage from './modules/auth/LoginPage';
import AppShell from './components/layout/AppShell';
import ActivationScreen from './modules/auth/ActivationScreen';

export default function App() {
  const { isAuthenticated, setSettings, isActivated, setActivation } = useAppStore();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    // Check local database for active license or tenant
    window.electronAPI.system.boot().then((res: any) => {
      if (res.status === 'ready') {
        const tenantId = res.tenant ? (res.tenant.tenant_id || res.tenant.id) : undefined;
        setActivation(true, tenantId);
      } else {
        setActivation(false, undefined);
      }
      setCheckingAuth(false);
    }).catch((err) => {
      console.error('Failed to boot system:', err);
      toast.error('Failed to boot system: ' + err.message);
      setActivation(false, undefined);
      setCheckingAuth(false);
    });
  }, [setActivation]);

  useEffect(() => {
    if (isAuthenticated) {
      window.electronAPI.settings.get().then(setSettings);
    }
  }, [isAuthenticated, setSettings]);

  useEffect(() => {
    if (window.electronAPI.updater) {
      window.electronAPI.updater.onStatus((data: any) => {
        if (data.status === 'available') {
          toast.success(data.message, { duration: 5000, icon: '🔄' });
        } else if (data.status === 'downloaded') {
          toast((t) => (
            <div className="flex flex-col gap-2">
              <span className="font-semibold">{data.message}</span>
              <div className="flex gap-2 mt-2">
                <button 
                  onClick={() => {
                    toast.dismiss(t.id);
                    window.electronAPI.updater.quitAndInstall();
                  }}
                  className="bg-brand-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold w-full"
                >
                  Restart & Install
                </button>
                <button 
                  onClick={() => toast.dismiss(t.id)}
                  className="bg-dark-700 text-dark-200 px-3 py-1.5 rounded-lg text-xs font-bold w-full"
                >
                  Later
                </button>
              </div>
            </div>
          ), { duration: Infinity }); // Keep open until acted upon
        } else if (data.status === 'error') {
          toast.error(data.message);
        }
      });
      return () => {
        window.electronAPI.updater.removeStatusListener();
      };
    }
  }, []);

  if (checkingAuth) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-dark-900 border border-dark-700">
        <div className="w-8 h-8 border-4 border-dark-600 border-t-brand-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#252420',
            color: '#f5f4f0',
            border: '1px solid #3d3b35',
            borderRadius: '12px',
            fontSize: '14px',
          },
          success: { iconTheme: { primary: '#10b981', secondary: '#252420' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#252420' } },
        }}
      />
      {!isActivated ? <ActivationScreen /> : isAuthenticated ? <AppShell /> : <LoginPage />}
    </>
  );
}
