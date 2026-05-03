import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, CreditCard as CreditCardIcon } from 'lucide-react';

const FloatingActions: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="hidden sm:flex fixed bottom-24 right-6 sm:bottom-10 sm:right-10 flex-col gap-3 z-50 animate-in slide-in-from-bottom duration-700">
      <button
        onClick={() => navigate('/cards?add=true')}
        className="w-14 h-14 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-indigo-500/30 hover:scale-110 active:scale-95 transition-all group"
        title="Lançamento de Cartão"
      >
        <CreditCardIcon size={24} />
        <span className="absolute right-full mr-4 px-3 py-1.5 bg-slate-900 text-white text-[10px] font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap hidden sm:block">
          CARTÃO DE CRÉDITO
        </span>
      </button>
      <button
        onClick={() => navigate('/history?add=true')}
        className="w-14 h-14 bg-brand-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-brand-500/30 hover:scale-110 active:scale-95 transition-all group"
        title="Nova Transação Bancária"
      >
        <Plus size={28} />
        <span className="absolute right-full mr-4 px-3 py-1.5 bg-slate-900 text-white text-[10px] font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap hidden sm:block">
          NOVO LANÇAMENTO
        </span>
      </button>
    </div>
  );
};

export default FloatingActions;
