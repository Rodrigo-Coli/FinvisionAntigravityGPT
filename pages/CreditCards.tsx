import React, { useState, useEffect } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase/client';

// Modular Components
import { CardList } from '../components/cards/CardList';
import { StatementSummary } from '../components/cards/StatementSummary';
import { TransactionList } from '../components/cards/TransactionList';
import { AddCardModal } from '../components/cards/AddCardModal';
import { ManualTransactionModal } from '../components/cards/ManualTransactionModal';
import { PayStatementModal } from '../components/cards/PayStatementModal';

type Account = {
  id: string;
  institution?: string | null;
  name?: string | null;
  bank_name?: string | null;
};

const CreditCardsPage: React.FC = () => {
  const [cards, setCards] = useState<any[]>([]);
  const [selectedCard, setSelectedCard] = useState<any | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [currentStatement, setCurrentStatement] = useState<any | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingTxs, setLoadingTxs] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // categories + inline edit + manual tx modal
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);

  const [showAddTxModal, setShowAddTxModal] = useState(false);
  const [txDate, setTxDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [txDescription, setTxDescription] = useState('');
  const [txAmount, setTxAmount] = useState<number>(0);
  const [txCategoryId, setTxCategoryId] = useState<string>('');
  const [txCardId, setTxCardId] = useState<string>('');

  // PAY STATEMENT
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payAccountId, setPayAccountId] = useState<string>('');
  const [payDate, setPayDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [payAmount, setPayAmount] = useState<number>(0);
  const [isPaying, setIsPaying] = useState(false);

  // Form states for new card
  const [newName, setNewName] = useState('');
  const [newBrand, setNewBrand] = useState('Visa');
  const [newLast4, setNewLast4] = useState('');
  const [newLimit, setNewLimit] = useState<number>(0);
  const [newClosingDay, setNewClosingDay] = useState<number>(5);
  const [newDueDay, setNewDueDay] = useState<number>(15);
  const [isAdditional, setIsAdditional] = useState(false);
  const [parentCardId, setParentCardId] = useState('');
  const [additionalLabel, setAdditionalLabel] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const isAnyModalBusy = isSaving || isPaying;

  useEffect(() => {
    if (isSupabaseConfigured) {
      fetchCards();
      fetchCategories();
      fetchAccounts();
    }
  }, []);

  useEffect(() => {
    if (selectedCard) {
      setTxCardId(selectedCard.id);
      loadCardContext(selectedCard.id);
    }
  }, [selectedCard]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(val || 0));

  const formatDateBR = (d?: string) => {
    if (!d) return '-';
    try {
      return new Date(d).toLocaleDateString('pt-BR');
    } catch {
      return d;
    }
  };

  const getCardColor = (brand: string) => {
    const b = (brand || '').toLowerCase();
    if (b.includes('visa')) return 'bg-brand-600';
    if (b.includes('master')) return 'bg-slate-900';
    if (b.includes('elo')) return 'bg-orange-500';
    if (b.includes('amex')) return 'bg-emerald-600';
    return 'bg-slate-600';
  };

  const safeNumber = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const statementTotal = safeNumber(currentStatement?.total_amount);
  const statementPaid = safeNumber(currentStatement?.paid_amount);
  const statementOpen = Math.max(0, statementTotal - statementPaid);

  const fetchCards = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from('cards')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;

      const activeCards = (data || []).filter((c: any) => c.is_archived !== true && c.status !== 'archived');
      setCards(activeCards);

      if (activeCards.length > 0 && !selectedCard) {
        setSelectedCard(activeCards[0]);
      }
    } catch (err) {
      console.error('Erro ao buscar cartões:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    if (!supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from('categories')
        .select('id, name')
        .eq('user_id', user.id)
        .order('name', { ascending: true });
      if (error) throw error;
      setCategories(data || []);
    } catch (err) {
      console.error('Erro ao buscar categorias:', err);
    }
  };

  const fetchAccounts = async () => {
    if (!supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .order('created_at', { ascending: true });
      if (error) throw error;
      const list = (data || []) as Account[];
      setAccounts(list);
      if (!payAccountId && list.length > 0) {
        setPayAccountId(list[0].id);
      }
    } catch (err) {
      console.error('Erro ao buscar contas:', err);
    }
  };

  const getAccountLabel = (a: Account) => {
    return a.institution || a.name || a.bank_name || `Conta ${a.id.slice(0, 6)}`;
  };

  const loadCardContext = async (cardId: string) => {
    try {
      const stmt = await fetchCurrentStatement(cardId);
      setCurrentStatement(stmt);
      await fetchTransactions(cardId, stmt?.id || null);
    } catch (e) {
      console.error('Erro ao carregar contexto do cartão:', e);
      setCurrentStatement(null);
      await fetchTransactions(cardId);
    }
  };

  const fetchCurrentStatement = async (cardId: string) => {
    if (!supabase) return null;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const openStatuses = ['OPEN', 'DUE', 'PENDING'];
    const openTry = await supabase
      .from('card_statements')
      .select('*')
      .eq('user_id', user.id)
      .eq('card_id', cardId)
      .in('status', openStatuses)
      .order('due_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!openTry.error && openTry.data) return openTry.data;
    const latestTry = await supabase
      .from('card_statements')
      .select('*')
      .eq('user_id', user.id)
      .eq('card_id', cardId)
      .order('due_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    return latestTry.data || null;
  };

  const fetchTransactions = async (cardId: string, statementId?: string | null) => {
    if (!supabase) return;
    setLoadingTxs(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      let query = supabase.from('card_transactions').select('*').eq('user_id', user.id).order('date', { ascending: false });
      if (statementId) query = query.eq('statement_id', statementId);
      else query = query.eq('card_id', cardId);
      const { data, error } = await query;
      if (error) throw error;
      setTransactions(data || []);
    } catch (err) {
      console.error('Erro ao buscar transações:', err);
    } finally {
      setLoadingTxs(false);
    }
  };

  const updateTxLocal = (id: string, patch: any) => {
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const saveTxPatch = async (id: string, patch: any) => {
    if (!supabase) return;
    setSavingRowId(id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from('card_transactions').update(patch).eq('id', id).eq('user_id', user.id);
      if (error) throw error;
    } catch (err) {
      console.error('Erro ao salvar transação:', err);
      if (selectedCard?.id) loadCardContext(selectedCard.id);
    } finally {
      setSavingRowId(null);
    }
  };

  const handleDeleteTx = async (id: string) => {
    if (!supabase) return;
    if (!confirm('Excluir esta transação?')) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from('card_transactions').delete().eq('id', id).eq('user_id', user.id);
      if (error) throw error;
      setTransactions((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      console.error('Erro ao excluir transação:', err);
    }
  };

  const handleAddManualTx = async () => {
    if (!supabase || !txCardId) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const payload: any = {
        user_id: user.id,
        card_id: txCardId,
        date: txDate,
        description: txDescription,
        amount: Math.abs(Number(txAmount || 0)),
        status: 'POSTED',
        source: 'MANUAL',
        is_manual: true,
      };
      if (txCategoryId) payload.category_id = txCategoryId;
      if (selectedCard?.id === txCardId && currentStatement?.id) {
        payload.statement_id = currentStatement.id;
      }
      const { data, error } = await supabase.from('card_transactions').insert([payload]).select('*').single();
      if (error) throw error;
      if (selectedCard?.id === txCardId) {
        setTransactions((prev) => [data, ...prev]);
      }
      setShowAddTxModal(false);
      setTxDescription('');
      setTxAmount(0);
      setTxDate(new Date().toISOString().slice(0, 10));
    } catch (err) {
      console.error('Erro ao adicionar transação:', err);
    }
  };

  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const payload = {
        user_id: user.id,
        name: newName,
        brand: newBrand,
        last4: newLast4,
        limit_total: newLimit, // Nome sincronizado com o SQL
        closing_day: newClosingDay,
        due_day: newDueDay,
        is_archived: false,
        is_additional: isAdditional,
        parent_card_id: isAdditional ? parentCardId : null,
        additional_label: isAdditional ? additionalLabel : null,
      };
      const { data, error } = await supabase.from('cards').insert([payload]).select().single();
      if (error) throw error;
      setCards((prev) => [...prev, data]);
      if (!selectedCard) setSelectedCard(data);
      setShowAddModal(false);
      resetForm();
    } catch (err: any) {
      console.error('Erro ao salvar cartão:', err);
      alert('Erro ao salvar cartão: ' + (err.message || 'Verifique sua conexão.'));
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setNewName('');
    setNewBrand('Visa');
    setNewLast4('');
    setNewLimit(0);
    setNewClosingDay(5);
    setNewDueDay(15);
    setIsAdditional(false);
    setParentCardId('');
    setAdditionalLabel('');
  };

  const handlePayStatement = async () => {
    if (!supabase || !currentStatement?.id) return;
    setIsPaying(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const nextPaid = safeNumber(currentStatement.paid_amount) + Math.abs(Number(payAmount || 0));
      const total = safeNumber(currentStatement.total_amount);
      const newStatus = nextPaid >= total ? 'PAID' : 'OPEN';
      const { error: upErr } = await supabase
        .from('card_statements')
        .update({ paid_amount: nextPaid, status: newStatus, ...(newStatus === 'PAID' ? { paid_at: new Date().toISOString() } : {}) })
        .eq('id', currentStatement.id)
        .eq('user_id', user.id);
      if (upErr) throw upErr;
      if (selectedCard?.id) await loadCardContext(selectedCard.id);
      setShowPayModal(false);
    } catch (err) {
      console.error('Erro ao pagar fatura:', err);
    } finally {
      setIsPaying(false);
    }
  };

  const statementBadge = (() => {
    const s = String(currentStatement?.status || '').toUpperCase();
    if (!s) return null;
    const base = 'px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border';
    if (s === 'PAID') return <span className={`${base} bg-slate-900 text-white border-slate-900 shadow-sm`}>Paga</span>;
    if (s === 'DUE') return <span className={`${base} bg-rose-50 text-rose-600 border-rose-100`}>Vencendo</span>;
    if (s === 'OPEN' || s === 'PENDING') return <span className={`${base} bg-brand-50 text-brand-600 border-brand-100`}>Aberta</span>;
    return <span className={`${base} bg-slate-50 text-slate-500 border-slate-100`}>{s}</span>;
  })();

  return (
    <div className="max-w-7xl mx-auto py-16 sm:py-24 px-8 sm:px-12 space-y-16 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-12">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="text-4xl sm:text-6xl font-bold text-slate-900 tracking-tight leading-none">
              Gestão de <span className="text-brand-600">Crédito</span>
            </h1>
            <span className="px-3 py-1 bg-slate-50 text-slate-400 rounded-full text-[10px] font-bold uppercase tracking-widest border border-slate-100 shadow-sm">Vault</span>
          </div>
          <p className="text-slate-500 font-medium text-lg sm:text-2xl leading-relaxed max-w-2xl">
            Sincronização integral de faturas, limites e ciclos de fechamento. <br className="hidden sm:block" /> {cards.length} dispositivos de crédito indexados.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="w-full md:w-auto px-10 py-6 bg-slate-900 text-white rounded-[24px] font-bold text-[10px] uppercase tracking-[0.2em] shadow-2xl shadow-black/10 hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-4"
        >
          <Plus size={20} /> Provisionar Cartão
        </button>
      </header>

      {loading ? (
        <div className="py-48 flex flex-col items-center justify-center gap-10">
          <div className="relative">
            <div className="w-20 h-20 border-4 border-slate-50 border-t-slate-900 rounded-full animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 size={32} className="text-slate-200 animate-pulse" />
            </div>
          </div>
          <p className="text-slate-400 font-bold uppercase tracking-[0.3em] text-[11px] animate-pulse">Syncing Credit Engines...</p>
        </div>
      ) : cards.length === 0 ? (
        <div className="bg-white rounded-[64px] border border-slate-100 shadow-soft p-24 text-center flex flex-col items-center gap-10">
          <div className="w-32 h-32 bg-slate-50 rounded-[40px] flex items-center justify-center text-slate-200 border border-slate-100">
            <Plus size={64} />
          </div>
          <div className="space-y-4">
            <h3 className="text-3xl font-bold text-slate-900 tracking-tight">Soberania Financeira</h3>
            <p className="text-slate-400 font-medium text-lg max-w-md mx-auto leading-relaxed">Seu vault de crédito está vazio. Inicie a indexação do seu primeiro cartão para consolidar seus ciclos de pagamento.</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-12 py-6 bg-slate-900 text-white rounded-[28px] font-bold text-[11px] uppercase tracking-[0.3em] hover:bg-slate-800 transition-all shadow-2xl shadow-black/10 active:scale-95"
          >
            Começar Agora
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 xl:gap-20">
          <div className="lg:col-span-4 xl:col-span-3">
            <CardList
              cards={cards}
              selectedCardId={selectedCard?.id}
              onSelectCard={setSelectedCard}
              getCardColor={getCardColor}
              formatCurrency={formatCurrency}
            />
          </div>

          <div className="lg:col-span-8 xl:col-span-9 space-y-12">
            {selectedCard && (
              <div className="space-y-12">
                <div className="px-10 sm:px-14 py-12 bg-white rounded-[48px] border border-slate-100 shadow-soft relative overflow-hidden group">
                  <div className="flex flex-col xl:flex-row justify-between xl:items-center gap-10 relative z-10">
                    <div className="space-y-6">
                      <div className="flex flex-wrap items-center gap-5">
                        <h2 className="text-4xl sm:text-5xl font-bold text-slate-900 tracking-tight leading-none">{selectedCard.name}</h2>
                        {selectedCard.is_additional && (
                          <span className="px-4 py-1.5 bg-slate-900 text-white rounded-full text-[9px] font-bold uppercase tracking-[0.2em] shadow-lg shadow-black/10">
                            Adicional
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-6 text-slate-300 font-bold text-[10px] uppercase tracking-[0.3em]">
                        <span className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${getCardColor(selectedCard.brand)}`} />
                          {selectedCard.brand}
                        </span>
                        <span className="w-1.5 h-1.5 bg-slate-100 rounded-full" />
                        <span className="text-slate-400">Card ID: **** {selectedCard.last4}</span>
                        {selectedCard.is_additional && (
                          <>
                            <span className="w-1.5 h-1.5 bg-slate-100 rounded-full" />
                            <span className="text-brand-600">Owner: {selectedCard.additional_label}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-12 p-8 bg-slate-50/50 rounded-[32px] border border-slate-100">
                      <div className="space-y-2">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.3em] leading-none">Cycle Closing</span>
                        <p className="text-lg font-black text-slate-900">Dia {selectedCard.closing_day}</p>
                      </div>
                      <div className="w-px h-12 bg-slate-200/50" />
                      <div className="space-y-2">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.3em] leading-none">Settlement Due</span>
                        <p className="text-lg font-black text-slate-900">Dia {selectedCard.due_day}</p>
                      </div>
                    </div>
                  </div>
                  <div className="absolute top-0 right-0 w-64 h-64 bg-slate-50/50 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none group-hover:bg-brand-50/50 transition-colors duration-1000" />
                </div>

                <StatementSummary
                  currentStatement={currentStatement}
                  statementTotal={statementTotal}
                  statementPaid={statementPaid}
                  statementOpen={statementOpen}
                  formatCurrency={formatCurrency}
                  formatDateBR={formatDateBR}
                  onRefresh={() => loadCardContext(selectedCard.id)}
                  onPay={() => setShowPayModal(true)}
                  statementBadge={statementBadge}
                />

                <TransactionList
                  transactions={transactions}
                  loadingTxs={loadingTxs}
                  categories={categories}
                  savingRowId={savingRowId}
                  onAddManualTx={() => setShowAddTxModal(true)}
                  onUpdateTxLocal={updateTxLocal}
                  onSaveTxPatch={saveTxPatch}
                  onDeleteTx={handleDeleteTx}
                  showStatementScope={!!currentStatement?.id}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals are kept as they are - we refactor the components themselves */}
      <AddCardModal
        show={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleAddCard}
        isSaving={isSaving}
        isAnyModalBusy={isAnyModalBusy}
        cards={cards}
        newName={newName}
        setNewName={setNewName}
        newBrand={newBrand}
        setNewBrand={setNewBrand}
        newLast4={newLast4}
        setNewLast4={setNewLast4}
        newLimit={newLimit}
        setNewLimit={setNewLimit}
        newClosingDay={newClosingDay}
        setNewClosingDay={setNewClosingDay}
        newDueDay={newDueDay}
        setNewDueDay={setNewDueDay}
        isAdditional={isAdditional}
        setIsAdditional={setIsAdditional}
        parentCardId={parentCardId}
        setParentCardId={setParentCardId}
        additionalLabel={additionalLabel}
        setAdditionalLabel={setAdditionalLabel}
      />

      <ManualTransactionModal
        show={showAddTxModal}
        onClose={() => setShowAddTxModal(false)}
        onSubmit={handleAddManualTx}
        isAnyModalBusy={isAnyModalBusy}
        cards={cards}
        categories={categories}
        txCardId={txCardId}
        setTxCardId={setTxCardId}
        txDate={txDate}
        setTxDate={setTxDate}
        txAmount={txAmount}
        setTxAmount={setTxAmount}
        txDescription={txDescription}
        setTxDescription={setTxDescription}
        txCategoryId={txCategoryId}
        setTxCategoryId={setTxCategoryId}
      />

      <PayStatementModal
        show={showPayModal}
        onClose={() => setShowPayModal(false)}
        onSubmit={handlePayStatement}
        isPaying={isPaying}
        selectedCardName={selectedCard?.name}
        statementOpen={statementOpen}
        formatCurrency={formatCurrency}
        accounts={accounts}
        payAccountId={payAccountId}
        setPayAccountId={setPayAccountId}
        payDate={payDate}
        setPayDate={setPayDate}
        payAmount={payAmount}
        setPayAmount={setPayAmount}
        getAccountLabel={getAccountLabel}
      />
    </div>
  );
};

export default CreditCardsPage;
