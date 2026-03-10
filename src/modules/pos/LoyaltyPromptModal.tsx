import { useState, useEffect, useRef } from 'react';
import { X, UserPlus, Search, Coffee, ChevronRight, User } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import { Customer } from '../../types';
import toast from 'react-hot-toast';

interface LoyaltyPromptModalProps {
  onClose: () => void;
  onCustomerSelected: (customer: Customer) => void;
  onContinueAsGuest: () => void;
  stampsToEarn: number;
}

export default function LoyaltyPromptModal({ 
  onClose, 
  onCustomerSelected, 
  onContinueAsGuest,
  stampsToEarn
}: LoyaltyPromptModalProps) {
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '' });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus the input to listen for scans immediately
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!search.trim()) return;

    setIsLoading(true);
    try {
      // 1. Try to fetch by loyalty code
      if (search.startsWith('LOYALTY-')) {
        const card = await window.electronAPI.loyalty.getCardByCode(search);
        if (card) {
          const allCustomers = await window.electronAPI.customers.getAll();
          const customer = allCustomers.find((c: Customer) => c.id === card.customer_id);
          if (customer) {
            onCustomerSelected(customer);
            return;
          }
        }
      }

      // 2. Try to fetch by phone/name
      const allCustomers = await window.electronAPI.customers.getAll();
      const customer = allCustomers.find((c: Customer) => 
        c.phone === search || c.name.toLowerCase() === search.toLowerCase()
      );

      if (customer) {
        onCustomerSelected(customer);
      } else {
        toast.error('Customer not found. Try adding as new member.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateCustomer = async () => {
    if (!newCustomer.name) return toast.error('Name is required');
    
    setIsLoading(true);
    try {
      const res = await window.electronAPI.customers.create(newCustomer);
      if (res.success) {
        // Fetch all and find our new friend (since create returns success info)
        const all = await window.electronAPI.customers.getAll();
        const created = all.find((c: any) => c.phone === newCustomer.phone || c.name === newCustomer.name);
        if (created) onCustomerSelected(created);
      }
    } catch (error) {
      toast.error('Failed to create customer');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal title="" onClose={onClose} size="sm" hideCloseButton>
      <div className="bg-gradient-to-b from-dark-800 to-dark-900 rounded-2xl p-6 border border-brand-500/20 shadow-2xl relative overflow-hidden">
        {/* Decorative Background */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/5 rounded-full blur-[60px]" />
        
        {/* Reward Header */}
        <div className="text-center mb-8 relative">
          <div className="w-16 h-16 bg-amber-500/20 rounded-2xl flex items-center justify-center text-amber-500 mx-auto mb-4 border border-amber-500/30">
            <Coffee size={32} />
          </div>
          <h2 className="text-2xl font-black text-white leading-tight">Add Loyalty Account?</h2>
          <p className="text-dark-400 text-sm mt-1 font-medium">This order earns <span className="text-amber-400 font-bold">{stampsToEarn} stamps</span> ✨</p>
        </div>

        {!showNewCustomer ? (
          <div className="space-y-4">
            {/* Search Input for Scan/Manual */}
            <form onSubmit={handleSearch} className="relative group">
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
                placeholder="Scan QR or Enter Phone Number..."
                className="w-full bg-dark-700 border border-dark-600/50 text-white rounded-xl pl-12 pr-4 py-4 text-sm focus:outline-none focus:border-brand-500/50 transition-all placeholder:text-dark-500"
              />
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-500 group-focus-within:text-brand-500" size={20} />
            </form>

            <div className="flex gap-3">
              <button 
                onClick={() => setShowNewCustomer(true)}
                className="flex-1 flex items-center justify-center gap-2 bg-dark-700 hover:bg-dark-600 text-white py-3 5 rounded-xl border border-white/5 transition-all text-sm font-bold"
              >
                <UserPlus size={18} className="text-brand-500" />
                New Member
              </button>
            </div>

            <div className="pt-6 border-t border-dark-700/50 flex flex-col gap-3">
              <button 
                onClick={onContinueAsGuest}
                className="w-full flex items-center justify-center gap-2 text-dark-400 hover:text-white py-2 transition-all text-xs font-bold uppercase tracking-widest"
              >
                Skip 
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
             <div className="grid gap-3">
                <input
                  type="text"
                  placeholder="Full Name"
                  value={newCustomer.name}
                  onChange={e => setNewCustomer(prev => ({...prev, name: e.target.value}))}
                  className="input-field py-3"
                />
                <input
                  type="text"
                  placeholder="Phone Number (Optional)"
                  value={newCustomer.phone}
                  onChange={e => setNewCustomer(prev => ({...prev, phone: e.target.value}))}
                  className="input-field py-3"
                />
             </div>
             
             <div className="flex gap-2 pt-2">
                <button 
                  onClick={() => setShowNewCustomer(false)}
                  className="btn-secondary flex-1"
                >
                  Back
                </button>
                <button 
                  onClick={handleCreateCustomer}
                  className="btn-primary flex-[2] bg-brand-500 shadow-lg shadow-brand-500/20"
                >
                  Create & Earn
                </button>
             </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
