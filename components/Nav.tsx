import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Landmark, CreditCard, History, Sparkles, Gem, Settings, LogOut, BookOpen, FileCheck, Menu, X, Bell, Target, PieChart, HelpCircle, FileDown, ShieldCheck } from 'lucide-react';
import { Profile, UserRole } from '../types';
import { supabase } from '../lib/supabase/client';
import { useTour } from '../contexts/TourContext';

const Nav: React.FC<{ user: Profile }> = ({ user }) => {
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { startTour } = useTour();

  const items = [
    { label: 'Início', path: '/', icon: <Home size={20} /> },
    { label: 'Contas', path: '/accounts', icon: <Landmark size={20} /> },
    { label: 'Cartões', path: '/cards', icon: <CreditCard size={20} /> },
    { label: 'Transações', path: '/history', icon: <History size={20} /> },
    { label: 'Insights AI', path: '/ai', icon: <Sparkles size={20} /> },
    { label: 'Patrimônio', path: '/assets', icon: <Gem size={20} /> },
    { label: 'Estudos', path: '/studies', icon: <BookOpen size={20} /> },
    { label: 'Metas', path: '/goals', icon: <Target size={20} /> },
    { label: 'Orçamento', path: '/budget', icon: <PieChart size={20} /> },
    { label: 'Conciliar', path: '/reconcile', icon: <FileCheck size={20} /> },
    { label: 'Relatórios', path: '/reports', icon: <FileDown size={20} /> },
    { label: 'Ajustes', path: '/settings', icon: <Settings size={20} /> },
  ];

  const isAdmin = user.role === UserRole.ADMIN || user.email === 'rodrigocolicg@gmail.com';

  const adminItems = isAdmin ? [
    { label: 'Gerir Usuários', path: '/admin/usuarios', icon: <ShieldCheck size={20} /> },
    { label: 'Gerir Planos', path: '/admin/planos', icon: <Gem size={20} /> },
  ] : [];

  const allItems = [...items, ...adminItems];

  return (
    <>
      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex flex-col w-64 h-screen bg-white border-r border-slate-100 sticky top-0 z-50 p-6 overflow-y-auto">
        <div className="flex items-center gap-3 mb-12 px-2">
          <div className="w-10 h-10 bg-brand-900 rounded-xl flex items-center justify-center text-white font-bold italic text-xl shadow-lg shadow-brand-500/10">FV</div>
          <span className="text-xl font-bold tracking-tight text-slate-900">FinVision Pro</span>
        </div>

        <nav className="flex-grow space-y-2">
          {allItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              id={`tour-nav-${item.path.replace('/', '') || 'home'}`}
              className={`group flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all relative ${location.pathname === item.path
                ? 'text-brand-600 font-bold'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                }`}
            >
              {location.pathname === item.path && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-brand-600 rounded-r-full" />
              )}
              <span className={`${location.pathname === item.path ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600'}`}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto pt-6 border-t border-slate-50 space-y-4">
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs uppercase border border-white shadow-sm">
              {user.email[0]}
            </div>
            <div className="flex flex-col truncate">
              <span className="text-sm font-bold text-slate-900 truncate">{user.email.split('@')[0]}</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Premium Plan</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => supabase?.auth.signOut()}
              className="flex items-center justify-center gap-3 w-full px-4 py-2.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all text-sm font-medium"
            >
              <LogOut size={20} />
              Sair
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <nav className="lg:hidden bg-white border-b border-slate-100 h-16 flex items-center justify-between px-4 fixed top-0 left-0 right-0 z-50">
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="p-2 text-slate-500"
        >
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        <Link to="/" className="text-brand-600 font-bold text-lg flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-900 text-white rounded-lg flex items-center justify-center font-bold italic shadow-md">FV</div>
          FinVision
        </Link>

        <div className="flex items-center gap-2">
          <button className="p-2 text-slate-400">
            <Bell size={20} />
          </button>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      <div className={`fixed inset-0 z-40 lg:hidden transition-all duration-300 ${isMenuOpen ? 'visible opacity-100' : 'invisible opacity-0'}`}>
        <div className="absolute inset-0 bg-brand-900/20 backdrop-blur-sm" onClick={() => setIsMenuOpen(false)} />
        <div className={`absolute top-0 left-0 w-4/5 h-full bg-white shadow-2xl flex flex-col transition-all duration-300 transform ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex items-center justify-between p-6 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-brand-900 rounded-xl flex items-center justify-center text-white font-bold italic">FV</div>
              <span className="font-bold text-slate-900">FinVision Pro</span>
            </div>
            <button onClick={() => setIsMenuOpen(false)} className="text-slate-400"><X size={24} /></button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 space-y-2">
            {allItems.map(item => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsMenuOpen(false)}
                className={`flex items-center gap-4 p-4 rounded-2xl text-sm font-bold ${location.pathname === item.path
                  ? 'bg-brand-50 text-brand-600'
                  : 'text-slate-500 hover:bg-slate-50'
                  }`}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </div>

          <div className="p-6 pt-4 border-t border-slate-100">
            <button
              onClick={() => supabase?.auth.signOut()}
              className="flex items-center gap-4 w-full p-4 text-rose-500 font-bold"
            >
              <LogOut size={20} />
              Sair da Conta
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default Nav;
