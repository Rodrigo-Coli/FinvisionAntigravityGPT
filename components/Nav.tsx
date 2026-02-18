
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Landmark, CreditCard, History, Sparkles, Gem, Settings, LogOut, FileCheck } from 'lucide-react';
import { Profile } from '../types';
import { supabase } from '../lib/supabase/client';

const Nav: React.FC<{ user: Profile }> = ({ user }) => {
  const location = useLocation();
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
    <nav className="glass border-b border-slate-200/50 dark:border-slate-700/50 h-20 flex items-center justify-between px-8 sticky top-0 z-50">
      <div className="flex items-center gap-10">
        <Link to="/" className="text-brand-600 font-display font-black text-2xl flex items-center gap-3 tracking-tighter transition-transform hover:scale-105">
          <div className="w-10 h-10 bg-brand-600 text-white rounded-xl flex items-center justify-center font-black italic shadow-lg shadow-brand-500/30">FV</div>
          FinVision <span className="text-slate-400 font-medium text-sm ml-1 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">PRO</span>
        </Link>
        <div className="hidden lg:flex items-center gap-1">
          {items.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2.5 transition-all duration-200 ${location.pathname === item.path
                  ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/30 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 dark:text-slate-400'
                }`}
            >
              <span className={location.pathname === item.path ? 'text-brand-600' : 'text-slate-400'}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="hidden sm:flex flex-col items-end">
          <span className="text-xs font-black text-slate-900 dark:text-white tracking-tight">{user.email.split('@')[0]}</span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Premium Plan</span>
        </div>
        <button
          onClick={() => supabase?.auth.signOut()}
          className="p-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-all"
          title="Sair"
        >
          <LogOut size={20} />
        </button>
      </div>
    </nav>
  );
};

export default Nav;
