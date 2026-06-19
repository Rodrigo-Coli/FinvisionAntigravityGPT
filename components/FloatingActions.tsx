import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, CreditCard as CreditCardIcon, DollarSign } from 'lucide-react';
import { Profile } from '../types';

interface FloatingActionsProps {
  user: Profile;
}

const FloatingActions: React.FC<FloatingActionsProps> = ({ user }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  const excludedPaths = ['/login', '/signup', '/forgot-password', '/reset-password', '/terms', '/privacy'];

  if (excludedPaths.includes(location.pathname)) {
    return null;
  }

  const showOnMobile = user.preferences?.show_bottom_nav === false;
  const containerClass = showOnMobile
    ? "fixed bottom-6 right-6 flex flex-col items-end gap-3 z-50"
    : "hidden lg:flex fixed bottom-10 right-10 flex-col items-end gap-3 z-50";

  return (
    <>
      {/* Backdrop overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/10 backdrop-blur-xs transition-opacity duration-300"
          onClick={() => setIsOpen(false)}
        />
      )}

      <div className={containerClass}>
        {/* Sub-actions container */}
        {isOpen && (
          <div className="flex flex-col items-end gap-3 mb-2 z-50">
            {/* Card transaction button */}
            <div className="flex items-center gap-3 animate-in slide-in-from-bottom-2 fade-in duration-200 delay-75">
              <span className="bg-slate-950/80 text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-xl shadow-lg shadow-slate-950/10 backdrop-blur-xs select-none">
                Gasto no Cartão
              </span>
              <button
                onClick={() => { navigate('/banking?tab=cards&add=true'); setIsOpen(false); }}
                className="w-12 h-12 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-indigo-500/30 hover:scale-110 active:scale-95 transition-all"
              >
                <CreditCardIcon size={20} />
              </button>
            </div>

            {/* New Transaction button */}
            <div className="flex items-center gap-3 animate-in slide-in-from-bottom-2 fade-in duration-200">
              <span className="bg-slate-950/80 text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-xl shadow-lg shadow-slate-950/10 backdrop-blur-xs select-none">
                Nova Transação
              </span>
              <button
                onClick={() => { navigate('/history?add=true'); setIsOpen(false); }}
                className="w-12 h-12 bg-brand-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-brand-500/30 hover:scale-110 active:scale-95 transition-all"
              >
                <DollarSign size={20} />
              </button>
            </div>
          </div>
        )}

        {/* Main trigger button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-all duration-300 transform active:scale-95 z-50 ${
            isOpen
              ? 'bg-slate-950 text-white rotate-45 shadow-slate-950/25'
              : 'bg-brand-600 text-white shadow-brand-500/30 hover:scale-110 hover:bg-brand-700'
          }`}
        >
          <Plus size={28} />
        </button>
      </div>
    </>
  );
};

export default FloatingActions;
