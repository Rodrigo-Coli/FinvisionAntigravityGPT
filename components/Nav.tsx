import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Landmark, CreditCard, History, Sparkles, Gem, Settings, LogOut, FileCheck, Menu, X } from 'lucide-react';
import { Profile } from '../types';
import { supabase } from '../lib/supabase/client';

const Nav: React.FC<{ user: Profile }> = ({ user }) => {
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const items = [
    { label: 'Geral', path: '/', icon: <Home size={14} /> },
    { label: 'Contas', path: '/accounts', icon: <Landmark size={14} /> },
    { label: 'Cartões', path: '/cards', icon: <CreditCard size={14} /> },
    { label: 'Conciliar', path: '/reconcile', icon: <FileCheck size={14} /> },
    { label: 'Patrimônio', path: '/assets', icon: <Gem size={14} /> },
    { label: 'Histórico', path: '/history', icon: <History size={14} /> },
    { label: 'AI Labs', path: '/ai', icon: <Sparkles size={14} /> },
    { label: 'Ajustes', path: '/settings', icon: <Settings size={14} /> },
  ];

  return (
    <>
      <nav className="bg-white border-b border-slate-50 h-14 flex items-center justify-between px-6 sm:px-8 sticky top-0 z-50">
        <div className="flex items-center gap-6 lg:gap-10">
          <Link to="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <div className="w-7 h-7 bg-slate-900 text-white rounded-lg flex items-center justify-center font-black text-[10px] tracking-tighter">FV</div>
            <span className="hidden xs:inline font-bold text-slate-900 tracking-tight text-base">FinVision</span>
          </Link>

          <div className="hidden lg:flex items-center gap-1">
            {items.map(item => (
              <Link
                key={item.path}
                to={item.path}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all duration-200 flex items-center gap-2 ${location.pathname === item.path
                  ? 'text-brand-600 bg-brand-50/50'
                  : 'text-slate-400 hover:text-slate-900 hover:bg-slate-50'
                  }`}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[10px] font-bold text-slate-900 leading-none">{user.email.split('@')[0]}</span>
            <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest leading-none mt-1">PRO VAULT</span>
          </div>
          <button
            onClick={() => supabase?.auth.signOut()}
            className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
          >
            <LogOut size={16} />
          </button>
        </div>
      </nav>

      <button
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className="fixed bottom-6 right-6 w-12 h-12 bg-slate-900 text-white rounded-full shadow-2xl z-[60] lg:hidden flex items-center justify-center transition-all active:scale-90"
      >
        {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Mobile Menu Rescaled */}
      <div className={`fixed inset-0 z-50 lg:hidden transition-all duration-500 ${isMenuOpen ? 'visible' : 'invisible'}`}>
        <div className={`absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity duration-500 ${isMenuOpen ? 'opacity-100' : 'opacity-0'}`} onClick={() => setIsMenuOpen(false)} />
        <div className={`absolute bottom-20 left-4 right-4 bg-white rounded-3xl p-6 shadow-2xl transition-all duration-500 transform ${isMenuOpen ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
          <div className="grid grid-cols-2 gap-2">
            {items.map(item => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsMenuOpen(false)}
                className={`p-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest flex flex-col items-center gap-2 transition-all ${location.pathname === item.path
                  ? 'bg-brand-50 text-brand-600 border border-brand-100'
                  : 'text-slate-400 border border-transparent'
                  }`}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default Nav;
