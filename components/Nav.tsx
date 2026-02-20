import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Landmark, CreditCard, History, Sparkles, Gem, Settings, LogOut, FileCheck, Menu, X } from 'lucide-react';
import { Profile } from '../types';
import { supabase } from '../lib/supabase/client';

const Nav: React.FC<{ user: Profile }> = ({ user }) => {
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const items = [
    { label: 'Visão Geral', path: '/', icon: <Home size={18} /> },
    { label: 'Contas', path: '/accounts', icon: <Landmark size={18} /> },
    { label: 'Cartões', path: '/cards', icon: <CreditCard size={18} /> },
    { label: 'Conciliar', path: '/reconcile', icon: <FileCheck size={18} /> },
    { label: 'Patrimônio', path: '/assets', icon: <Gem size={18} /> },
    { label: 'Histórico', path: '/history', icon: <History size={18} /> },
    { label: 'AI Labs', path: '/ai', icon: <Sparkles size={18} /> },
    { label: 'Ajustes', path: '/settings', icon: <Settings size={18} /> },
  ];

  return (
    <>
      <nav className="bg-white/80 backdrop-blur-md border-b border-slate-100 h-16 flex items-center justify-between px-6 sm:px-10 sticky top-0 z-50">
        <div className="flex items-center gap-8 lg:gap-12">
          <Link to="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
            <div className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center font-bold text-sm tracking-tighter">FV</div>
            <span className="hidden xs:inline font-semibold text-slate-900 tracking-tight text-lg">FinVision</span>
          </Link>

          <div className="hidden lg:flex items-center gap-1">
            {items.map(item => (
              <Link
                key={item.path}
                to={item.path}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${location.pathname === item.path
                  ? 'text-brand-600 bg-brand-50/50'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                  }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-xs font-semibold text-slate-900 tracking-tight">{user.email.split('@')[0]}</span>
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest leading-none mt-0.5">Premium Plan</span>
          </div>
          <button
            onClick={() => supabase?.auth.signOut()}
            className="p-2.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all"
            title="Sair"
          >
            <LogOut size={20} />
          </button>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      <div className={`fixed inset-0 z-40 lg:hidden transition-all duration-300 ${isMenuOpen ? 'visible opacity-100' : 'invisible opacity-0'}`}>
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsMenuOpen(false)} />
        <div className={`absolute top-20 left-4 right-4 bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-2xl p-6 transition-all duration-300 transform ${isMenuOpen ? 'translate-y-0 opacity-100' : '-translate-y-10 opacity-0'}`}>
          <div className="grid grid-cols-2 gap-3">
            {items.map(item => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsMenuOpen(false)}
                className={`p-4 rounded-2xl text-sm font-bold flex flex-col items-center gap-3 transition-all ${location.pathname === item.path
                  ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/20 border border-brand-100 dark:border-brand-900/50'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent'
                  }`}
              >
                <span className={location.pathname === item.path ? 'text-brand-600' : 'text-slate-400'}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            ))}
          </div>
          <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-500 font-black text-xs uppercase">
                {user.email[0]}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-black text-slate-900 dark:text-white">{user.email.split('@')[0]}</span>
                <span className="text-[10px] font-bold text-slate-400">Premium Plan</span>
              </div>
            </div>
            <button
              onClick={() => supabase?.auth.signOut()}
              className="p-3 bg-rose-50 dark:bg-rose-900/20 text-rose-600 rounded-xl"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default Nav;
