import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Coffee, Award, Star } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import { Customer, LoyaltyCard } from '../../types';

interface LoyaltyCardModalProps {
  customer: Customer;
  onClose: () => void;
}

export default function LoyaltyCardModal({ customer, onClose }: LoyaltyCardModalProps) {
  const [card, setCard] = useState<LoyaltyCard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCard();
  }, [customer.id]);

  const loadCard = async () => {
    try {
      let data = await window.electronAPI.loyalty.getCardByCustomerId(customer.id);
      
      // If no card exists (e.g. legacy customer), create one on the fly
      if (!data) {
        const newCode = `LOYALTY-LC${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        await window.electronAPI.loyalty.createCard(customer.id, newCode);
      }
      
      data = await window.electronAPI.loyalty.getCardByCustomerId(customer.id);
      setCard(data);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return null;

  const stamps = card?.stamps || 0;
  const threshold = card?.reward_threshold || 10;
  const progress = (stamps / threshold) * 100;

  return (
    <Modal title="Digital Loyalty Card" onClose={onClose} size="sm">
      <div className="flex flex-col items-center bg-gradient-to-b from-dark-800 to-dark-900 rounded-2xl p-6 relative overflow-hidden border border-brand-500/20 shadow-2xl">
        {/* Background Accent */}
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-brand-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl" />

        {/* Cafe Logo/Header */}
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center text-white shadow-lg">
            <Coffee size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Cloud n Cream</h2>
            <p className="text-[10px] text-brand-400 uppercase tracking-widest font-semibold">Premium Coffee Club</p>
          </div>
        </div>

        {/* Customer Info */}
        <div className="w-full bg-dark-700/40 rounded-xl p-4 mb-6 border border-white/5">
          <p className="text-dark-400 text-[10px] uppercase font-bold mb-1">Loyalty Member</p>
          <div className="flex justify-between items-end">
            <h3 className="text-lg font-bold text-white uppercase">{customer.name}</h3>
            <p className="text-brand-400 font-mono text-sm">{card?.loyalty_code.split('-')[1]}</p>
          </div>
        </div>

        {/* Stamp Grid */}
        <div className="w-full mb-8">
          <div className="flex justify-between items-center mb-3">
            <p className="text-xs font-semibold text-dark-300">Your Stamps</p>
            <p className="text-xs font-bold text-white">
              <span className="text-brand-400">{stamps}</span> / {threshold}
            </p>
          </div>
          
          <div className="grid grid-cols-5 gap-3">
            {Array.from({ length: threshold }).map((_, i) => {
              const isActive = i < stamps;
              return (
                <div 
                  key={i} 
                  className={`aspect-square rounded-full flex items-center justify-center transition-all duration-500 ${
                    isActive 
                      ? 'bg-brand-500 text-white shadow-[0_0_15px_rgba(226,90,38,0.4)] animate-pulse-slow' 
                      : 'bg-dark-700 border border-white/10 text-dark-500'
                  }`}
                >
                  {isActive ? <Star size={16} fill="currentColor" /> : <div className="w-1.5 h-1.5 rounded-full bg-dark-500" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Reward Status */}
        <div className="w-full text-center mb-8">
          {stamps >= threshold ? (
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 animate-bounce-subtle">
              <Award className="mx-auto text-green-400 mb-1" size={32} />
              <p className="text-green-400 font-bold">REWARD READY!</p>
              <p className="text-[10px] text-green-300/70">Redeem at checkout for a Free Coffee</p>
            </div>
          ) : (
            <div className="bg-dark-700/20 rounded-xl p-3">
              <p className="text-[10px] text-dark-400 uppercase font-bold mb-1">Next Reward in</p>
              <h4 className="text-2xl font-black text-white">{threshold - stamps} <span className="text-brand-500">STAMPS</span></h4>
            </div>
          )}
        </div>

        {/* QR Code */}
        <div className="bg-white p-3 rounded-2xl shadow-inner mb-4">
          <QRCodeSVG 
            value={card?.loyalty_code || ''} 
            size={140}
            level="H"
            includeMargin={false}
          />
        </div>
        <p className="text-[10px] text-dark-500 font-mono tracking-widest">{card?.loyalty_code}</p>
        
        <p className="mt-4 text-[9px] text-dark-600 uppercase font-bold">Scan at counter to earn stamps</p>
      </div>
    </Modal>
  );
}
