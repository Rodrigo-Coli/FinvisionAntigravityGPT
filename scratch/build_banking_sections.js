import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backupDir = path.join(__dirname, '..', 'backups', 'backup_20260615_banking_unification');
const bankingCompDir = path.join(__dirname, '..', 'components', 'banking');
const pagesDir = path.join(__dirname, '..', 'pages');

// Ensure components/banking directory exists
if (!fs.existsSync(bankingCompDir)) {
  fs.mkdirSync(bankingCompDir, { recursive: true });
}

// 1. Build AccountsSection.tsx
console.log('Building AccountsSection.tsx...');
let accountsContent = fs.readFileSync(path.join(backupDir, 'Accounts.tsx'), 'utf8');

// Adjust imports
accountsContent = accountsContent
  .replaceAll("from '../types'", "from '../../types'")
  .replaceAll("from '../lib/supabase/client'", "from '../../lib/supabase/client'")
  .replaceAll("from '../lib/dateUtils'", "from '../../lib/dateUtils'");

// Rename component and default export
accountsContent = accountsContent
  .replaceAll('const Accounts: React.FC = () => {', 'const AccountsSection: React.FC = () => {')
  .replaceAll('export default Accounts;', 'export default AccountsSection;');

// Remove outer padding of maximum page layout container
accountsContent = accountsContent.replace(
  'className="max-w-[1600px] mx-auto px-4 sm:px-10 py-8 pb-36 space-y-8 animate-in fade-in duration-500"',
  'className="space-y-8 animate-in fade-in duration-500"'
);

fs.writeFileSync(path.join(bankingCompDir, 'AccountsSection.tsx'), accountsContent, 'utf8');
console.log('[OK] Created components/banking/AccountsSection.tsx');

// 2. Build CreditCardsSection.tsx
console.log('Building CreditCardsSection.tsx...');
let cardsContent = fs.readFileSync(path.join(backupDir, 'CreditCards.tsx'), 'utf8');

// Adjust imports
cardsContent = cardsContent
  .replaceAll("from '../lib/supabase/client'", "from '../../lib/supabase/client'")
  .replaceAll("from '../services/finance.service'", "from '../../services/finance.service'")
  .replaceAll("from '../lib/dateUtils'", "from '../../lib/dateUtils'")
  .replaceAll("from '../components/cards/CardList'", "from '../cards/CardList'")
  .replaceAll("from '../components/cards/StatementSummary'", "from '../cards/StatementSummary'")
  .replaceAll("from '../components/cards/TransactionList'", "from '../cards/TransactionList'")
  .replaceAll("from '../components/cards/AddCardModal'", "from '../cards/AddCardModal'")
  .replaceAll("from '../components/cards/ManualTransactionModal'", "from '../cards/ManualTransactionModal'")
  .replaceAll("from '../components/cards/PayStatementModal'", "from '../cards/PayStatementModal'")
  .replaceAll("from '../components/SeriesScopeModal'", "from '../SeriesScopeModal'");

// Rename component and default export
cardsContent = cardsContent
  .replaceAll('const CreditCardsPage: React.FC = () => {', 'const CreditCardsSection: React.FC = () => {')
  .replaceAll('export default CreditCardsPage;', 'export default CreditCardsSection;');

// Remove outer padding of page layout container
cardsContent = cardsContent.replace(
  'className="max-w-[1600px] mx-auto px-4 sm:px-10 py-8 pb-36 space-y-8 animate-in fade-in duration-500"',
  'className="space-y-8 animate-in fade-in duration-500"'
);

fs.writeFileSync(path.join(bankingCompDir, 'CreditCardsSection.tsx'), cardsContent, 'utf8');
console.log('[OK] Created components/banking/CreditCardsSection.tsx');

// 3. Create pages/Banking.tsx
console.log('Building Banking.tsx...');
const bankingPageContent = `import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Landmark, CreditCard } from 'lucide-react';
import AccountsSection from '../components/banking/AccountsSection';
import CreditCardsSection from '../components/banking/CreditCardsSection';

const Banking: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'accounts' | 'cards'>(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    return tab === 'cards' ? 'cards' : 'accounts';
  });

  const handleTabChange = (tab: 'accounts' | 'cards') => {
    setActiveTab(tab);
    navigate(\`/banking?tab=\${tab}\`, { replace: true });
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab === 'cards' && activeTab !== 'cards') {
      setActiveTab('cards');
    } else if (tab === 'accounts' && activeTab !== 'accounts') {
      setActiveTab('accounts');
    }
  }, [location.search]);

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-10 py-8 pb-36 space-y-8 animate-in fade-in duration-500">
      {/* UNIFIED TABS */}
      <div className="flex justify-center sm:justify-start border-b border-slate-100 pb-4">
        <div className="flex bg-slate-50 p-1 rounded-2xl border border-slate-100 w-full sm:w-auto">
          <button
            onClick={() => handleTabChange('accounts')}
            className={\`flex-1 sm:flex-initial px-6 py-2.5 rounded-xl text-xs font-bold uppercase transition-all flex items-center justify-center gap-2 \${
              activeTab === 'accounts' 
                ? 'bg-white text-brand-600 shadow-sm border border-slate-100/50' 
                : 'text-slate-400 hover:text-slate-600'
            }\`}
          >
            <Landmark size={14} /> Contas e Carteiras
          </button>
          <button
            onClick={() => handleTabChange('cards')}
            className={\`flex-1 sm:flex-initial px-6 py-2.5 rounded-xl text-xs font-bold uppercase transition-all flex items-center justify-center gap-2 \${
              activeTab === 'cards' 
                ? 'bg-white text-brand-600 shadow-sm border border-slate-100/50' 
                : 'text-slate-400 hover:text-slate-600'
            }\`}
          >
            <CreditCard size={14} /> Cartões de Crédito
          </button>
        </div>
      </div>

      <div className="animate-in fade-in duration-500">
        {activeTab === 'accounts' ? (
          <AccountsSection />
        ) : (
          <CreditCardsSection />
        )}
      </div>
    </div>
  );
};

export default Banking;
`;

fs.writeFileSync(path.join(pagesDir, 'Banking.tsx'), bankingPageContent, 'utf8');
console.log('[OK] Created pages/Banking.tsx');
