import { X } from 'lucide-react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  hideCloseButton?: boolean;
}

export default function Modal({ title, onClose, children, size = 'md', hideCloseButton }: ModalProps) {
  const sizeMap = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className={`bg-dark-800 border border-dark-600/50 rounded-2xl shadow-2xl w-full flex flex-col ${sizeMap[size]} animate-scale-in max-h-[90vh]`}>
        {(!hideCloseButton || title) && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700/50 flex-shrink-0">
            <h2 className="font-bold text-white text-lg font-display">{title}</h2>
            {!hideCloseButton && (
              <button onClick={onClose} className="text-dark-400 hover:text-white transition-colors">
                <X size={18} />
              </button>
            )}
          </div>
        )}
        <div className={`overflow-y-auto flex-1 ${!title && hideCloseButton ? 'p-0' : 'px-6 py-5'}`}>
          {children}
        </div>
      </div>
    </div>
  );
}
