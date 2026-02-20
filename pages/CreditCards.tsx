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
    <div className="max-w-6xl mx-auto py-8 sm:py-10 px-6 sm:px-8 space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight leading-none">
            Gestão de <span className="text-brand-600">Crédito</span>
          </h1>
          <p className="text-slate-500 text-sm">{cards.length} dispositivos indexados.</p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-6 py-3 bg-slate-900 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-md flex items-center gap-2 self-start"
        >
          <Plus size={16} /> Provisionar Cartão
        </button>
      </header>

      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center gap-4">
          <Loader2 size={32} className="animate-spin text-slate-200" />
          <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Sincronizando...</p>
        </div>
      ) : cards.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center space-y-6">
          <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-200 mx-auto">
            <Plus size={32} />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-slate-900">Nenhum Cartão</h3>
            <p className="text-slate-400 text-sm">Seu vault de crédito está vazio.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4">
            <CardList
              cards={cards}
              selectedCardId={selectedCard?.id}
              onSelectCard={setSelectedCard}
              getCardColor={getCardColor}
              formatCurrency={formatCurrency}
            />
          </div>

          <div className="lg:col-span-8 space-y-8">
            {selectedCard && (
              <div className="space-y-8">
                <div className="p-8 bg-white rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden">
                  <div className="flex flex-col xl:flex-row justify-between xl:items-center gap-8 relative z-10">
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{selectedCard.name}</h2>
                        {selectedCard.is_additional && (
                          <span className="px-2 py-0.5 bg-slate-900 text-white rounded-md text-[8px] font-bold uppercase tracking-widest">Adicional</span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                        <span className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${getCardColor(selectedCard.brand)}`} /> {selectedCard.brand}
                        </span>
                        <span>**** {selectedCard.last4}</span>
                      </div>
                    </div>

                    <div className="flex gap-8 p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
                      <div className="space-y-1">
                        <span className="text-[8px] font-bold text-slate-400 uppercase">Fechamento</span>
                        <p className="text-sm font-black text-slate-900">Dia {selectedCard.closing_day}</p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[8px] font-bold text-slate-400 uppercase">Vencimento</span>
                        <p className="text-sm font-black text-slate-900">Dia {selectedCard.due_day}</p>
                      </div>
                    </div>
                  </div>
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
