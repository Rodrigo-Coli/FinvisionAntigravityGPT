import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Landmark, CreditCard, History, Sparkles, Gem, Settings, LogOut, BookOpen, FileCheck, Menu, X, Bell, Target, PieChart, HelpCircle, FileDown, ShieldCheck, Gift, LayoutGrid, Building2, Car, TrendingUp, HandCoins, Layers, Box, ChevronDown, Receipt, Store, ShoppingCart, BarChart3, Brain, Users, Megaphone, Tag, Tags, Navigation, Percent, Cloud } from 'lucide-react';
import { Profile } from '../types';
import { isAdmin } from '../lib/authUtils';
import { supabase } from '../lib/supabase/client';
import { useTour } from '../contexts/TourContext';
import { useSubscription } from '../contexts/SubscriptionContext';

type NavSubItem = { id: string; label: string; icon: React.ReactNode };
type NavItem = { label: string; path: string; icon: React.ReactNode; subItems?: NavSubItem[]; paramName?: string };

const Nav: React.FC<{ user: Profile }> = ({ user }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const { startTour } = useTour();
  const { subscription } = useSubscription();

  const planLabel = subscription?.plans?.name ?? (subscription ? 'Plano Ativo' : 'Plano Gratuito');

  const assetsSubItems: NavSubItem[] = [
    { id: 'overview', label: 'Visão Geral', icon: <LayoutGrid size={16} /> },
    { id: 'realestate', label: 'Ativos Imobiliários', icon: <Building2 size={16} /> },
    { id: 'vehicles', label: 'Veículos', icon: <Car size={16} /> },
    { id: 'investments', label: 'Investimentos', icon: <TrendingUp size={16} /> },
    { id: 'loans', label: 'Empréstimos Concedidos', icon: <HandCoins size={16} /> },
    { id: 'consortiums', label: 'Consórcios', icon: <Layers size={16} /> },
    { id: 'liabilities', label: 'Passivos (Dívidas)', icon: <Landmark size={16} /> },
    { id: 'physical', label: 'Outros Ativos Físicos', icon: <Box size={16} /> },
  ];

  const bankingSubItems: NavSubItem[] = [
    { id: 'accounts', label: 'Contas e Carteiras', icon: <Landmark size={16} /> },
    { id: 'cards', label: 'Cartões de Crédito', icon: <CreditCard size={16} /> },
  ];

  const aiSubItems: NavSubItem[] = [
    { id: 'upload', label: 'Escanear Cupom', icon: <Receipt size={16} /> },
    { id: 'comparative', label: 'Comparador', icon: <Store size={16} /> },
    { id: 'shopping', label: 'Lista de Compras', icon: <ShoppingCart size={16} /> },
    { id: 'history', label: 'Minha Inflação', icon: <BarChart3 size={16} /> },
    { id: 'wealth', label: 'Diagnóstico', icon: <Brain size={16} /> },
  ];

  const planningSubItems: NavSubItem[] = [
    { id: 'budget', label: 'Orçamentos', icon: <PieChart size={16} /> },
    { id: 'goals', label: 'Metas', icon: <Target size={16} /> },
  ];

  const settingsSubItems: NavSubItem[] = [
    { id: 'general', label: 'Preferências', icon: <Settings size={16} /> },
    { id: 'navigation', label: 'Navegação', icon: <Navigation size={16} /> },
    { id: 'subscription', label: 'Meu Plano', icon: <Gem size={16} /> },
    { id: 'categories', label: 'Categorias', icon: <Tags size={16} /> },
    { id: 'entities', label: 'Perfis / Donos', icon: <Building2 size={16} /> },
    { id: 'establishments', label: 'Estabelecimentos', icon: <Store size={16} /> },
    { id: 'rates', label: 'Taxas e Conversão', icon: <Percent size={16} /> },
    { id: 'backup', label: 'Backup e Dados', icon: <Cloud size={16} /> },
    { id: 'changelog', label: 'Novidades', icon: <Bell size={16} /> },
  ];

  const adminSubItems: NavSubItem[] = [
    { id: 'overview', label: 'Visão Geral', icon: <BarChart3 size={16} /> },
    { id: 'plans', label: 'Planos & SaaS', icon: <Gem size={16} /> },
    { id: 'users', label: 'Usuários', icon: <Users size={16} /> },
    { id: 'campaigns', label: 'Campanhas', icon: <Megaphone size={16} /> },
    { id: 'coupons', label: 'Cupons', icon: <Tag size={16} /> },
    { id: 'referrals', label: 'Indicações', icon: <Gift size={16} /> },
    { id: 'prompts', label: 'IA & Custos', icon: <Brain size={16} /> },
    { id: 'audit', label: 'Auditoria', icon: <ShieldCheck size={16} /> },
  ];

  const items: NavItem[] = [
    { label: 'Início', path: '/', icon: <Home size={20} /> },
    { label: 'Contas & Cartões', path: '/banking', icon: <Landmark size={20} />, subItems: bankingSubItems, paramName: 'tab' },
    { label: 'Transações', path: '/history', icon: <History size={20} /> },
    { label: 'Insights AI', path: '/ai', icon: <Sparkles size={20} />, subItems: aiSubItems },
    { label: 'Patrimônio', path: '/assets', icon: <Gem size={20} />, subItems: assetsSubItems },
    { label: 'Planejamento', path: '/planning', icon: <Target size={20} />, subItems: planningSubItems, paramName: 'tab' },
    { label: 'Conciliar', path: '/reconcile', icon: <FileCheck size={20} /> },
    { label: 'Relatórios', path: '/reports', icon: <FileDown size={20} /> },
    { label: 'Indicações', path: '/referrals', icon: <Gift size={20} /> },
    { label: 'Ajustes', path: '/settings', icon: <Settings size={20} />, subItems: settingsSubItems, paramName: 'section' },
  ];

  const adminItems: NavItem[] = isAdmin(user) ? [
    { label: 'Master Console', path: '/admin', icon: <ShieldCheck size={20} />, subItems: adminSubItems },
  ] : [];

  const allItems = [...items, ...adminItems];

  useEffect(() => {
    const match = allItems.find(i => i.subItems && i.path === location.pathname);
    setExpandedItem(match ? match.path : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const getSubValue = (item: NavItem) => new URLSearchParams(location.search).get(item.paramName || 'view');

  return (
    <>
      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex flex-col w-64 h-screen bg-white border-r border-slate-100 sticky top-0 z-50 p-6 overflow-y-auto">
        <div className="flex items-center gap-3 mb-12 px-2">
          <img src="/logo-icon.png" alt="Zyvion" className="w-10 h-10 object-contain" />
          <span className="text-xl font-bold tracking-tight text-slate-900">Zyvion</span>
        </div>

        <nav className="flex-grow space-y-2">
          {allItems.map(item => {
            const isActive = location.pathname === item.path;
            if (item.subItems) {
              const isOpen = isActive && expandedItem === item.path;
              const currentSubValue = getSubValue(item) || item.subItems[0].id;
              return (
                <div key={item.path}>
                  <Link
                    to={item.path}
                    id={`tour-nav-${item.path.replace('/', '') || 'home'}`}
                    onClick={(e) => {
                      if (isActive) {
                        e.preventDefault();
                        setExpandedItem(o => o === item.path ? null : item.path);
                      }
                    }}
                    className={`group flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all relative ${isActive
                      ? 'text-brand-600 font-bold'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-brand-600 rounded-r-full" />
                    )}
                    <span className={`${isActive ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600'}`}>
                      {item.icon}
                    </span>
                    <span className="flex-grow">{item.label}</span>
                    <ChevronDown
                      size={16}
                      className={`text-slate-300 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </Link>
                  {isOpen && (
                    <div className="mt-1 ml-4 pl-4 border-l border-slate-100 space-y-0.5">
                      {item.subItems.map(sub => {
                        const isSubActive = currentSubValue === sub.id;
                        return (
                          <Link
                            key={sub.id}
                            to={`${item.path}?${item.paramName || 'view'}=${sub.id}`}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${isSubActive
                              ? 'text-brand-600 font-bold bg-brand-50'
                              : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                              }`}
                          >
                            {sub.icon}
                            {sub.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <Link
                key={item.path}
                to={item.path}
                id={`tour-nav-${item.path.replace('/', '') || 'home'}`}
                className={`group flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all relative ${isActive
                  ? 'text-brand-600 font-bold'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                  }`}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-brand-600 rounded-r-full" />
                )}
                <span className={`${isActive ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600'}`}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto pt-6 border-t border-slate-50 space-y-4">
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs uppercase border border-white shadow-sm">
              {user.email[0]}
            </div>
            <div className="flex flex-col truncate">
              <span className="text-sm font-bold text-slate-900 truncate">{user.email.split('@')[0]}</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{planLabel}</span>
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
      <nav className="lg:hidden bg-white border-b border-slate-100 mobile-header-safe flex items-center justify-between px-4 fixed top-0 left-0 right-0 z-50">
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="p-2.5 text-slate-500"
        >
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        <Link to="/" className="text-brand-600 font-bold text-lg flex items-center gap-2">
          <img src="/logo-icon.png" alt="Zyvion" className="w-8 h-8 object-contain" />
          Zyvion
        </Link>

        <div className="flex items-center gap-2">
          <button
            className="p-2.5 text-slate-400 hover:text-brand-600 transition-colors"
            aria-label="Notificações"
            title="Configurações de Notificações"
            onClick={() => navigate('/settings?section=notifications')}
          >
            <Bell size={20} />
          </button>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      <div className={`fixed inset-0 z-40 lg:hidden transition-all duration-300 ${isMenuOpen ? 'visible opacity-100' : 'invisible opacity-0'}`}>
        <div className="absolute inset-0 bg-brand-900/20 backdrop-blur-sm" onClick={() => setIsMenuOpen(false)} />
        <div className={`absolute top-0 left-0 w-4/5 h-full bg-white shadow-2xl flex flex-col transition-all duration-300 transform ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex items-center justify-between p-6 pb-4 menu-overlay-safe">
            <div className="flex items-center gap-3">
              <img src="/logo-icon.png" alt="Zyvion" className="w-9 h-9 object-contain" />
              <span className="font-bold text-slate-900">Zyvion</span>
            </div>
            <button onClick={() => setIsMenuOpen(false)} className="text-slate-400"><X size={24} /></button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 space-y-2">
            {allItems.map(item => {
              const isActive = location.pathname === item.path;
              if (item.subItems) {
                const isOpen = isActive && expandedItem === item.path;
                const currentSubValue = getSubValue(item) || item.subItems[0].id;
                return (
                  <div key={item.path}>
                    <Link
                      to={item.path}
                      onClick={(e) => {
                        if (isActive) {
                          e.preventDefault();
                          setExpandedItem(o => o === item.path ? null : item.path);
                        }
                      }}
                      className={`flex items-center gap-4 p-4 rounded-2xl text-sm font-bold ${isActive
                        ? 'bg-brand-50 text-brand-600'
                        : 'text-slate-500 hover:bg-slate-50'
                        }`}
                    >
                      {item.icon}
                      <span className="flex-grow">{item.label}</span>
                      <ChevronDown
                        size={18}
                        className={`text-slate-300 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </Link>
                    {isOpen && (
                      <div className="mt-1 ml-4 pl-4 border-l border-slate-100 space-y-1">
                        {item.subItems.map(sub => {
                          const isSubActive = currentSubValue === sub.id;
                          return (
                            <Link
                              key={sub.id}
                              to={`${item.path}?${item.paramName || 'view'}=${sub.id}`}
                              onClick={() => setIsMenuOpen(false)}
                              className={`flex items-center gap-3 p-3 rounded-xl text-xs font-bold ${isSubActive
                                ? 'bg-brand-50 text-brand-600'
                                : 'text-slate-400 hover:bg-slate-50'
                                }`}
                            >
                              {sub.icon}
                              {sub.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMenuOpen(false)}
                  className={`flex items-center gap-4 p-4 rounded-2xl text-sm font-bold ${isActive
                    ? 'bg-brand-50 text-brand-600'
                    : 'text-slate-500 hover:bg-slate-50'
                    }`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
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
