import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Landmark, CreditCard, History, FileCheck, Plus, ShieldCheck, X, DollarSign } from 'lucide-react';
import { Profile, UserRole } from '../types';

interface BottomNavProps {
  user: Profile;
}

const BottomNav: React.FC<BottomNavProps> = ({ user }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isQuickOpen, setIsQuickOpen] = useState(false);

  const isAdmin = user.role === UserRole.ADMIN || user.email === 'rodrigocolicg@gmail.com';

  const items = [
    { label: 'Início', path: '/', icon: <Home size={20} /> },
    { label: 'Contas', path: '/accounts', icon: <Landmark size={20} /> },
  ];

  const rightItems = [
    { label: 'Cartões', path: '/cards', icon: <CreditCard size={20} /> },
    { label: 'Histórico', path: '/history', icon: <History size={20} /> },
  ];

  return (
    <>
      {/* Quick Actions Overlay */}
      {isQuickOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end justify-center px-4 pb-24">
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
                <span className="text-[11px] font-bold text-brand-700 uppercase tracking-wider">Transação Bancária</span>
              </button>
              <button
                onClick={() => { navigate('/cards?add=true'); setIsQuickOpen(false); }}
                className="flex flex-col items-center gap-3 p-6 bg-indigo-50 border border-indigo-100 rounded-[24px] hover:bg-indigo-100 transition-all group"
              >
                <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-110 transition-transform">
                  <CreditCard size={24} />
                </div>
                <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">Gasto no Cartão</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 px-2 pb-safe pt-2 z-50 flex justify-around items-center shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
        {items.map((item) => {
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
              <span className={`text-[10px] font-black uppercase tracking-tighter ${isActive ? 'opacity-100' : 'opacity-60'}`}>
                {item.label}
              </span>
            </Link>
          );
        })}

        {/* Central Action Button */}
        <div className="relative -top-4">
          <button
            onClick={() => setIsQuickOpen(!isQuickOpen)}
            className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all transform active:scale-95 ${
              isQuickOpen ? 'bg-slate-900 text-white rotate-45' : 'bg-brand-600 text-white shadow-brand-500/30'
            }`}
          >
            <Plus size={28} />
          </button>
        </div>

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
              <span className={`text-[10px] font-black uppercase tracking-tighter ${isActive ? 'opacity-100' : 'opacity-60'}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
        
        <Link
          to="/reconcile"
          className={`flex flex-col items-center gap-1 p-2 rounded-2xl transition-all ${
            location.pathname === '/reconcile' ? 'text-brand-600' : 'text-slate-400'
          }`}
        >
          <div className={`p-1 ${location.pathname === '/reconcile' ? 'bg-brand-50 rounded-lg' : ''}`}>
            <FileCheck size={20} />
          </div>
          <span className={`text-[10px] font-black uppercase tracking-tighter ${location.pathname === '/reconcile' ? 'opacity-100' : 'opacity-60'}`}>
            Conciliar
          </span>
        </Link>

        {isAdmin && (
          <Link
            to="/admin/planos"
            className={`flex flex-col items-center gap-1 p-2 rounded-2xl transition-all ${
              location.pathname.startsWith('/admin') ? 'text-brand-600' : 'text-slate-400'
            }`}
          >
            <div className={`p-1 ${location.pathname.startsWith('/admin') ? 'bg-brand-50 rounded-lg' : ''}`}>
              <ShieldCheck size={20} />
            </div>
            <span className={`text-[10px] font-black uppercase tracking-tighter ${location.pathname.startsWith('/admin') ? 'opacity-100' : 'opacity-60'}`}>
              SaaS
            </span>
          </Link>
        )}
      </nav>
    </>
  );
};

export default BottomNav;
