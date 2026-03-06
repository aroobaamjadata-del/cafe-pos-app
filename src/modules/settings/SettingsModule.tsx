import { useEffect, useState } from 'react';
import { Save, Settings } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStore } from '../../store/appStore';
import { Settings as SettingsType } from '../../types';

export default function SettingsModule() {
  const { settings, setSettings } = useAppStore();
  const [form, setForm] = useState<Partial<SettingsType>>({});
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'general' | 'receipt' | 'system'>('general');

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    const result = await window.electronAPI.settings.update(form);
    if (result.success) {
      const updated = await window.electronAPI.settings.get();
      setSettings(updated);
      toast.success('Settings saved!');
    }
    setSaving(false);
  };

  const f = (key: keyof SettingsType) => form[key] || '';
  const set = (key: keyof SettingsType, val: string) => setForm(prev => ({...prev, [key]: val}));

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="page-header">Settings</h1>
        <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
          {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={16} />}
          Save Settings
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-dark-800 p-1 rounded-xl w-fit border border-dark-700/50">
        {(['general', 'receipt', 'system'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-5 py-2 rounded-lg text-sm font-medium capitalize transition-all ${tab === t ? 'bg-brand-500 text-white' : 'text-dark-300 hover:text-white'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <div className="card space-y-5">
          <h2 className="section-title">Business Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm text-dark-300 mb-1.5">Cafe / Business Name</label>
              <input value={f('cafe_name')} onChange={e => set('cafe_name', e.target.value)} className="input-field" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm text-dark-300 mb-1.5">Address</label>
              <input value={f('cafe_address')} onChange={e => set('cafe_address', e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="block text-sm text-dark-300 mb-1.5">Phone</label>
              <input value={f('cafe_phone')} onChange={e => set('cafe_phone', e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="block text-sm text-dark-300 mb-1.5">Email</label>
              <input type="email" value={f('cafe_email')} onChange={e => set('cafe_email', e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="block text-sm text-dark-300 mb-1.5">Currency Label</label>
              <input value={f('currency')} onChange={e => set('currency', e.target.value)} className="input-field" placeholder="Rs." />
            </div>
            <div>
              <label className="block text-sm text-dark-300 mb-1.5">Currency Symbol</label>
              <input value={f('currency_symbol')} onChange={e => set('currency_symbol', e.target.value)} className="input-field" placeholder="₨" />
            </div>
          </div>
        </div>
      )}

      {tab === 'receipt' && (
        <div className="card space-y-5">
          <h2 className="section-title">Receipt Settings</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-dark-300 mb-1.5">Tax Rate (%)</label>
              <input
                type="number"
                value={f('tax_rate')}
                onChange={e => set('tax_rate', e.target.value)}
                className="input-field w-32"
                min="0"
                max="100"
                step="0.5"
              />
            </div>
            <div>
              <label className="block text-sm text-dark-300 mb-1.5">Receipt Footer Message</label>
              <textarea
                value={f('receipt_footer')}
                onChange={e => set('receipt_footer', e.target.value)}
                className="input-field h-24 resize-none"
                placeholder="Thank you for visiting!"
              />
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                className={`w-11 h-6 rounded-full transition-colors relative ${f('receipt_print_on_sale') === '1' ? 'bg-brand-500' : 'bg-dark-600'}`}
                onClick={() => set('receipt_print_on_sale', f('receipt_print_on_sale') === '1' ? '0' : '1')}
              >
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${f('receipt_print_on_sale') === '1' ? 'translate-x-5' : ''}`} />
              </div>
              <span className="text-sm text-dark-200">Auto-show receipt after each sale</span>
            </label>
          </div>
        </div>
      )}

      {tab === 'system' && (
        <div className="card space-y-5">
          <h2 className="section-title">System Settings</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-dark-300 mb-1.5">Low Stock Alert Threshold</label>
              <input
                type="number"
                value={f('low_stock_threshold')}
                onChange={e => set('low_stock_threshold', e.target.value)}
                className="input-field w-32"
              />
              <p className="text-xs text-dark-500 mt-1">Show alert when stock falls below this number</p>
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                className={`w-11 h-6 rounded-full transition-colors relative ${f('auto_backup') === '1' ? 'bg-brand-500' : 'bg-dark-600'}`}
                onClick={() => set('auto_backup', f('auto_backup') === '1' ? '0' : '1')}
              >
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${f('auto_backup') === '1' ? 'translate-x-5' : ''}`} />
              </div>
              <div>
                <span className="text-sm text-dark-200">Automatic Daily Backup</span>
                <p className="text-xs text-dark-500">Backs up database every 24 hours automatically</p>
              </div>
            </label>
          </div>

          <div className="pt-4 border-t border-dark-700/50">
            <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
              <Settings size={16} className="text-dark-400" />
              Application Info
            </h3>
            <div className="space-y-2 text-sm text-dark-400">
              <p>Version: <span className="text-white">1.0.0</span></p>
              <p>Database: <span className="text-white">SQLite (Local)</span></p>
              <p>Framework: <span className="text-white">Electron + React + TypeScript</span></p>
              <p>Future-ready for: <span className="text-white">Multi-tenant SaaS, Cloud sync</span></p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
