import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Landmark, CreditCard } from 'lucide-react';
import AccountsSection from '../components/banking/AccountsSection';
import CreditCardsSection from '../components/banking/CreditCardsSection';
import CardBenefitsSection from '../components/banking/CardBenefitsSection';

const Banking: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  type BankingTab = 'accounts' | 'cards' | 'benefits';
  const parseTab = (tab: string | null): BankingTab => (tab === 'cards' || tab === 'benefits' ? tab : 'accounts');

  const [activeTab, setActiveTab] = useState<BankingTab>(() => parseTab(new URLSearchParams(location.search).get('tab')));

  const handleTabChange = (tab: BankingTab) => {
    setActiveTab(tab);
    navigate(`/banking?tab=${tab}`, { replace: true });
  };

  useEffect(() => {
    const tab = new URLSearchParams(location.search).get('tab');
    if (tab && parseTab(tab) !== activeTab) setActiveTab(parseTab(tab));
  }, [location.search]);

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-10 py-8 pb-36 space-y-8 animate-in fade-in duration-500">
      {/* UNIFIED TABS - mobile only; no menu lateral tem submenu equivalente no desktop */}
      <div className="hidden justify-center sm:justify-start border-b border-slate-100 pb-4">
        <div className="flex bg-slate-50 p-1 rounded-2xl border border-slate-100 w-full sm:w-auto">
          <button
            onClick={() => handleTabChange('accounts')}
            className={`flex-1 sm:flex-initial px-6 py-2.5 rounded-xl text-xs font-bold uppercase transition-all flex items-center justify-center gap-2 ${
              activeTab === 'accounts' 
                ? 'bg-white text-brand-600 shadow-sm border border-slate-100/50' 
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Landmark size={14} /> Contas e Carteiras
          </button>
          <button
            onClick={() => handleTabChange('cards')}
            className={`flex-1 sm:flex-initial px-6 py-2.5 rounded-xl text-xs font-bold uppercase transition-all flex items-center justify-center gap-2 ${
              activeTab === 'cards' 
                ? 'bg-white text-brand-600 shadow-sm border border-slate-100/50' 
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <CreditCard size={14} /> Cartões de Crédito
          </button>
        </div>
      </div>

      <div className="animate-in fade-in duration-500">
        {activeTab === 'accounts' ? (
          <AccountsSection />
        ) : activeTab === 'benefits' ? (
          <CardBenefitsSection />
        ) : (
          <CreditCardsSection />
        )}
      </div>
    </div>
  );
};

export default Banking;
