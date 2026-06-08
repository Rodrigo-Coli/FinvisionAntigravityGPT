import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, CreditCard as CreditCardIcon } from 'lucide-react';

const FloatingActions: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const allowedPaths = ['/', '/accounts', '/cards', '/history'];

  if (!allowedPaths.includes(location.pathname)) {
    return null;
  }

  return (
    <div className="hidden lg:flex fixed bottom-10 right-10 flex-col gap-3 z-50 animate-in slide-in-from-bottom duration-700">
      <button
        onClick={() => navigate('/cards?add=true')}
        className="relative w-14 h-14 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-indigo-500/30 hover:scale-110 active:scale-95 transition-all group"
      >
        <CreditCardIcon size={24} />
        <span className="absolute right-full top-1/2 -translate-y-1/2 mr-3 px-3 py-1.5 bg-slate-900 text-white text-[10px] font-bold rounded-lg opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 ease-out whitespace-nowrap hidden md:block pointer-events-none">
          CARTÃO DE CRÉDITO
        </span>
      </button>
      <button
        onClick={() => navigate('/history?add=true')}
        className="relative w-14 h-14 bg-brand-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-brand-500/30 hover:scale-110 active:scale-95 transition-all group"
      >
        <Plus size={28} />
        <span className="absolute right-full top-1/2 -translate-y-1/2 mr-3 px-3 py-1.5 bg-slate-900 text-white text-[10px] font-bold rounded-lg opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 ease-out whitespace-nowrap hidden md:block pointer-events-none">
          NOVO LANÇAMENTO
        </span>
      </button>
    </div>
  );
};

export default FloatingActions;
