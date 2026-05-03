import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Landmark, CreditCard, History, FileCheck, Plus, ShieldCheck, X, DollarSign, Building2, Target, PieChart, Gem } from 'lucide-react';
import { Profile, UserRole } from '../types';

interface BottomNavProps {
  user: Profile;
}

const BottomNav: React.FC<BottomNavProps> = ({ user }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isQuickOpen, setIsQuickOpen] = useState(false);

  const isAdmin = user.role === UserRole.ADMIN || user.email === 'rodrigocolicg@gmail.com';
  const prefs = user.preferences || {};
  const visibleItems = prefs.bottom_nav_items || ['home', 'accounts', 'cards', 'history', 'reconcile'];
  const showNav = prefs.show_bottom_nav !== false;

  if (!showNav) return null;

  const allItems = [
    { id: 'home', label: 'Início', path: '/', icon: <Home size={20} /> },
    { id: 'accounts', label: 'Contas', path: '/accounts', icon: <Landmark size={20} /> },
    { id: 'cards', label: 'Cartões', path: '/cards', icon: <CreditCard size={20} /> },
    { id: 'history', label: 'Histórico', path: '/history', icon: <History size={20} /> },
    { id: 'assets', label: 'Patrimônio', path: '/assets', icon: <Building2 size={20} /> },
    { id: 'goals', label: 'Metas', path: '/goals', icon: <Target size={20} /> },
    { id: 'budgets', label: 'Orçamentos', path: '/budgets', icon: <PieChart size={20} /> },
    { id: 'reconcile', label: 'Conciliar', path: '/reconcile', icon: <FileCheck size={20} /> },
    { id: 'saas', label: 'Vip Plan', path: '/admin/planos', icon: <Gem size={20} /> },
  ];

  const filteredItems = allItems.filter(i => visibleItems.includes(i.id));
  
  // Split into left and right
  const leftItems = filteredItems.slice(0, Math.ceil(filteredItems.length / 2));
  const rightItems = filteredItems.slice(Math.ceil(filteredItems.length / 2));

  return (
    <>
      {/* Quick Actions Overlay */}
      {isQuickOpen && (
        <div className="lg:hidden fixed inset-0 z-[60] flex items-end justify-center px-4 pb-24">
          <div className="absolute inset-0 bg-brand-900/40 backdrop-blur-sm" onClick={() => setIsQuickOpen(false)} />
          <div className="relative bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl animate-in slide-in-from-bottom-10 duration-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-900">Novo Lançamento</h3>
              <button onClick={() => setIsQuickOpen(false)} className="p-2 bg-slate-50 rounded-xl text-slate-400"><X size={20} /></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => { navigate('/history?add=true'); setIsQuickOpen(false); }}
                className="flex flex-col items-center gap-3 p-6 bg-brand-50 border border-brand-100 rounded-[24px] hover:bg-brand-100 transition-all group"
              >
                <div className="w-12 h-12 bg-brand-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-brand-500/20 group-hover:scale-110 transition-transform">
                  <DollarSign size={24} />
                </div>
                <span className="text-[11px] font-bold text-brand-700 uppercase tracking-wider">Transação</span>
              </button>
              <button
                onClick={() => { navigate('/cards?add=true'); setIsQuickOpen(false); }}
                className="flex flex-col items-center gap-3 p-6 bg-indigo-50 border border-indigo-100 rounded-[24px] hover:bg-indigo-100 transition-all group"
              >
                <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-110 transition-transform">
                  <CreditCard size={24} />
                </div>
                <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">Gasto Cartão</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 px-2 pb-safe pt-2 z-50 flex justify-between items-center shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
        <div className="flex flex-1 justify-around items-center">
          {leftItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-1 p-2 rounded-2xl transition-all ${
                  isActive ? 'text-brand-600' : 'text-slate-400'
                }`}
              >
                <div className={`p-1 ${isActive ? 'bg-brand-50 rounded-lg' : ''}`}>
                  {item.icon}
                </div>
                <span className={`text-[9px] font-black uppercase tracking-tighter ${isActive ? 'opacity-100' : 'opacity-60'}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Central Action Button */}
        <div className="relative -top-6 px-2">
          <button
            onClick={() => setIsQuickOpen(!isQuickOpen)}
            className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all transform active:scale-95 ${
              isQuickOpen ? 'bg-slate-900 text-white rotate-45' : 'bg-brand-600 text-white shadow-brand-500/30'
            }`}
          >
            <Plus size={28} />
          </button>
        </div>

        <div className="flex flex-1 justify-around items-center">
          {rightItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-1 p-2 rounded-2xl transition-all ${
                  isActive ? 'text-brand-600' : 'text-slate-400'
                }`}
              >
                <div className={`p-1 ${isActive ? 'bg-brand-50 rounded-lg' : ''}`}>
                  {item.icon}
                </div>
                <span className={`text-[9px] font-black uppercase tracking-tighter ${isActive ? 'opacity-100' : 'opacity-60'}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}

        </div>
      </nav>
    </>
  );
};

export default BottomNav;
