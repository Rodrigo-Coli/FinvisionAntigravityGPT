import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  ArrowRight,
  XCircle,
  Loader2,
  UploadCloud,
  ShieldCheck,
  RefreshCw,
  CreditCard,
  Landmark,
  History,
  Sparkles,
  X,
  AlertCircle,
  CloudUpload,
  Check
} from 'lucide-react';
import { ImportedTransaction, MatchStatus, BankAccount } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase/client';
import { DateUtils } from '../lib/dateUtils';
import { ReconciliationService } from '../services/reconciliation.service';
import { FinanceService } from '../services/finance.service';

const Reconcile: React.FC = () => {
  const navigate = useNavigate();
  const [imported, setImported] = useState<ImportedTransaction[]>([]);
  const [realAccounts, setRealAccounts] = useState<BankAccount[]>([]);
  const [realCards, setRealCards] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingTargets, setIsLoadingTargets] = useState(false);
  const [progressStep, setProgressStep] = useState<string | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [importSource, setImportSource] = useState<'bank' | 'card'>('bank');
  const [isLoadingQueue, setIsLoadingQueue] = useState(true);
  const [recentImports, setRecentImports] = useState<any[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
    fetchRealAccounts();
    fetchRealCards();
  }, []);

  const fetchRealAccounts = async () => {
    // DEV BYPASS
    if (window.location.href.includes('dev=true')) {
      setRealAccounts([{ id: 'a1', institution: 'Nubank', type: 'CHECKING', currency: 'BRL', initialBalance: 0, currentBalance: 0, limit: 0, color: '', isArchived: false, includeInDashboard: true }]);
      return;
    }

    if (!supabase) return;
    setIsLoadingTargets(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.from('accounts').select('*').eq('user_id', user.id);
      if (error) throw error;

      const mapped = (data || [])
        .filter((acc: any) => acc.is_archived === false || acc.status === 'active' || !acc.is_archived)
        .map((acc: any) => ({
          id: acc.id,
          institution: acc.institution || acc.name || 'Conta',
          name: acc.name || acc.institution || 'Conta',
          type: acc.type || 'CHECKING',
          currency: acc.currency || 'BRL',
          initialBalance: Number(acc.initial_balance || 0),
          currentBalance: Number(acc.current_balance || 0),
          limit: Number(acc.limit || acc.overdraft_limit || 0),
          color: acc.color,
          isArchived: acc.is_archived || acc.status === 'archived',
          includeInDashboard: acc.include_in_dashboard !== false
        }))
        .sort((a, b) => a.institution.localeCompare(b.institution));

      setRealAccounts(mapped);
    } catch (err) {
      console.error('Erro ao buscar contas:', err);
    } finally {
      setIsLoadingTargets(false);
    }
  };

  const fetchRealCards = async () => {
    // DEV BYPASS
    if (window.location.href.includes('dev=true')) {
      setRealCards([{ id: 'c1', name: 'Mastercard Black', last4: '8899' }]);
      return;
    }

    if (!supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase.from('cards').select('*').eq('user_id', user.id);
      if (error) throw error;
      const filtered = (data || [])
        .filter((c: any) => c.is_archived === false || c.status === 'active' || !c.is_archived)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setRealCards(filtered);
    } catch (err) { console.error('Erro ao buscar cartões:', err); }
  };

  const getAccountTypeLabel = (type: string) => {
    switch (type) {
      case 'CHECKING': return 'Corrente';
      case 'SAVINGS': return 'Poupança';
      case 'INVESTMENT': return 'Investimento';
      case 'CASH': return 'Dinheiro';
      case 'CREDIT_CARD': return 'Cartão';
      default: return type;
    }
  };

  const fetchData = async () => {
    setIsLoadingQueue(true);
    // DEV BYPASS
    if (window.location.href.includes('dev=true')) {
      setImported([
        { id: '1', date: new Date().toISOString(), description: 'Uber Trip Help', amount: -25.40, status: 'ready', type: 'debit' },
        { id: '2', date: new Date().toISOString(), description: 'McDonalds Brasi', amount: -65.00, status: 'ready', type: 'debit' },
        { id: '3', date: new Date().toISOString(), description: 'Pix Recebido - Rodrigo', amount: 1500.00, status: 'ready', type: 'credit' }
      ]);
      setRecentImports([
        { id: 'i1', original_name: 'extrato-janeiro.pdf', created_at: new Date().toISOString(), status: 'ready' }
      ]);
      setIsLoadingQueue(false);
      return;
    }
    await Promise.all([fetchQueue(), fetchRecentImports()]);
    setIsLoadingQueue(false);
  };

  const fetchQueue = async () => {
    if (!supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase.from('imported_transactions').select('*').eq('user_id', user.id).or('status.eq.READY_TO_RECONCILE,status.eq.ready,status.eq.pending').order('date', { ascending: false });
      if (error) throw error;
      const mapped = (data || []).filter((t: any) => !t.ignored).map((t: any) => ({
        id: t.id, date: t.date, description: t.description, amount: Number(t.amount), status: t.status as MatchStatus, type: t.amount >= 0 ? 'credit' : 'debit', installment_number: t.metadata?.installment_info?.number, installment_total: t.metadata?.installment_info?.total
      }));
      setImported(mapped);
    } catch (err) { console.error('Erro ao buscar fila:', err); }
  };

  const fetchRecentImports = async () => {
    if (!supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: imports, error: impErr } = await supabase.from('imports').select('id, status, created_at, document_id').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10);
      if (impErr) throw impErr;
      if (!imports || imports.length === 0) { setRecentImports([]); return; }
      const docIds = imports.filter(i => i.document_id).map(i => i.document_id);
      let docs: any[] = [];
      if (docIds.length > 0) {
        const { data, error: docErr } = await supabase.from('documents').select('id, original_name').in('id', docIds);
        if (docErr) throw docErr;
        docs = data || [];
      }
      const combined = imports.map(imp => {
        const doc = docs.find(d => d.id === imp.document_id);
        return { ...imp, import_id: imp.id, original_name: doc?.original_name || 'Arquivo' };
      });
      setRecentImports(combined);
    } catch (err) { console.error("Erro ao buscar imports recentes:", err); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !supabase) return;
    if (!selectedTargetId) { alert(`Selecione um ${importSource === 'bank' ? 'banco' : 'cartão'} de destino primeiro.`); return; }
    setIsProcessing(true); setProgressStep("Iniciando...");
    try {
      let targetName = importSource === 'bank' ? realAccounts.find(a => a.id === selectedTargetId)?.institution || 'Conta' : realCards.find(c => c.id === selectedTargetId)?.name || 'Cartão';
      const importId = await ReconciliationService.startImport({ file, importSource, accountId: selectedTargetId, accountName: targetName, onProgress: setProgressStep });
      await ReconciliationService.pollImportStatus(importId, (imp) => {
        if (imp.status === 'processing') setProgressStep("IA processando...");
        if (imp.status === 'ready') setProgressStep("Finalizado!");
      });
      await fetchData();
    } catch (err: any) { alert('Erro: ' + (err.message || 'Falha na importação.')); await fetchRecentImports(); } finally { setIsProcessing(false); setProgressStep(null); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleConfirm = async (item: ImportedTransaction) => {
    if (!supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (importSource === 'bank') {
        const acc = realAccounts.find(a => a.id === selectedTargetId);
        if (!acc) return alert("Selecione uma conta válida.");
        const { error: txError } = await supabase.from('transactions').insert({ user_id: user.id, date: item.date, description: item.description, amount: Math.abs(item.amount), type: item.amount < 0 ? 'EXPENSE' : 'INCOME', account_id: acc.id, account_name: acc.institution, category: 'Conciliação', is_paid: true, paid_amount: Math.abs(item.amount), paid_at: item.date, metadata: { imported_transaction_id: item.id, source: 'RECONCILIATION' } });
        if (txError) throw txError;
        await supabase.rpc('recalculate_account_balance', { p_account_id: acc.id });
      } else {
        const card = realCards.find(c => c.id === selectedTargetId);
        if (!card) return alert("Selecione um cartão válido.");
        const targetStatementId = await FinanceService.getOrCreateStatement(card.id, item.date);
        const { error: txError } = await supabase.from('card_transactions').insert({ user_id: user.id, card_id: card.id, used_card_id: card.id, statement_id: targetStatementId, date: item.date, description: item.description, amount: Math.abs(item.amount), source: 'IMPORT', status: 'POSTED', is_manual: false });
        if (txError) throw txError;
        if (item.installment_number && item.installment_total && item.installment_total > 1) {
          const remainingCount = item.installment_total - item.installment_number;
          if (remainingCount > 0) {
            const { TransactionSeriesUtils } = await import('../lib/transactionSeriesUtils');
            const futureSeries = TransactionSeriesUtils.generateSeries({ date: item.date, description: item.description.replace(/\d+\/\d+/, '').trim(), amount: Math.abs(item.amount), type: 'EXPENSE', accountId: card.id, category: 'Conciliação' }, { type: 'INSTALLMENT', count: item.installment_total, startDate: item.date });
            const futureTxs = futureSeries.slice(item.installment_number);
            for (const fTx of futureTxs) {
              const fStmtId = await FinanceService.getOrCreateStatement(card.id, fTx.date);
              await supabase.from('card_transactions').insert([{ user_id: user.id, card_id: card.id, used_card_id: card.id, statement_id: fStmtId, date: fTx.date, description: fTx.description, amount: fTx.amount, source: 'IMPORT', status: 'POSTED', is_manual: false, installment_group_id: crypto.randomUUID() }]);
            }
          }
        }
      }
      await ReconciliationService.updateTransactionStatus(item.id, 'OK');
      setImported(prev => prev.filter(x => x.id !== item.id));
    } catch (err) { alert("Falha ao confirmar transação"); }
  };

  const handleDismiss = async (id: string) => { try { await ReconciliationService.updateTransactionStatus(id, 'IGNORED'); setImported(prev => prev.filter(x => x.id !== id)); } catch (err) { alert("Erro ao ignorar transação"); } };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-10 py-8 space-y-8 animate-in fade-in duration-500">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Conciliação Bancária</h1>
          <p className="text-sm text-slate-400 font-medium">Extração de extratos por IA e conferência de dados.</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button onClick={() => navigate('/ai')} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-brand-50 text-brand-600 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-brand-100 transition-all active:scale-95">
            <Sparkles size={16} /> Ver Comprovantes
          </button>
          <button onClick={fetchData} className="p-3 bg-white border border-slate-100 text-slate-400 rounded-xl hover:text-slate-900 transition-all shadow-sm">
            <RefreshCw size={20} className={isLoadingQueue ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
        {/* LEFT SIDEBAR - IMPORT CONTROLS */}
        <div className="lg:col-span-1 space-y-8">
          <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-8">
            <div className="space-y-4">
              <p className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.2em]">Origem do Extrato</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setImportSource('bank'); setSelectedTargetId(''); }} className={`flex flex-col items-center gap-2 p-5 rounded-2xl border text-[10px] font-bold uppercase transition-all ${importSource === 'bank' ? 'bg-slate-900 border-slate-900 text-white shadow-lg' : 'bg-slate-50 border-slate-50 text-slate-400'}`}>
                  <Landmark size={20} /> Banco
                </button>
                <button onClick={() => { setImportSource('card'); setSelectedTargetId(''); }} className={`flex flex-col items-center gap-2 p-5 rounded-2xl border text-[10px] font-bold uppercase transition-all ${importSource === 'card' ? 'bg-slate-900 border-slate-900 text-white shadow-lg' : 'bg-slate-50 border-slate-50 text-slate-400'}`}>
                  <CreditCard size={20} /> Cartão
                </button>
              </div>
            </div>

            <div className="space-y-4 text-left">
              <p className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.2em]">{importSource === 'bank' ? 'Conta Destino' : 'Cartão Destino'}</p>
              <select
                value={selectedTargetId}
                onChange={(e) => setSelectedTargetId(e.target.value)}
                disabled={isLoadingTargets}
                className="w-full h-14 px-5 bg-slate-50 border-none rounded-2xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500 appearance-none"
              >
                <option value="">Selecione...</option>
                {importSource === 'bank' ? (
                  realAccounts.map(acc => (<option key={acc.id} value={acc.id}>{acc.institution}</option>))
                ) : (
                  realCards.map(card => (<option key={card.id} value={card.id}>{card.name} • {card.last4}</option>))
                )}
              </select>
            </div>

            <div className="pt-4">
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".csv,.ofx,.pdf,.png,.jpg,.jpeg" />
              <button onClick={() => fileInputRef.current?.click()} disabled={isProcessing || !selectedTargetId} className={`w-full py-12 border-2 border-dashed rounded-[32px] flex flex-col items-center justify-center gap-4 transition-all active:scale-95 ${isProcessing ? 'border-brand-500 bg-brand-50/50' : 'border-slate-100 hover:border-brand-300 hover:bg-brand-50/5'}`}>
                {isProcessing ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 size={32} className="animate-spin text-brand-600" />
                    <span className="text-[10px] font-bold text-brand-600 uppercase tracking-widest">{progressStep}</span>
                  </div>
                ) : (
                  <>
                    <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center shadow-inner"><CloudUpload size={32} /></div>
                    <div className="text-center">
                      <p className="text-xs font-bold text-slate-900 uppercase tracking-widest">Enviar Arquivo</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">PDF, CSV, OFX ou Imagem</p>
                    </div>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
            <h3 className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.2em] flex items-center gap-2"><History size={14} /> Histórico de Importação</h3>
            <div className="space-y-2">
              {recentImports.length === 0 ? (<p className="text-[10px] text-slate-300 font-bold uppercase text-center py-4">Nenhum registro</p>) : (
                recentImports.map(imp => (
                  <div key={imp.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-50 flex justify-between items-center group">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-slate-900 truncate uppercase tracking-tight">{imp.original_name}</p>
                      <p className="text-[9px] text-slate-400 font-bold mt-0.5">{DateUtils.formatDisplayDate(imp.created_at?.split('T')[0])}</p>
                    </div>
                    <span className={`text-[8px] font-bold px-2 py-1 rounded-lg uppercase whitespace-nowrap ${imp.status === 'ready' ? 'bg-emerald-50 text-emerald-600' : 'bg-brand-50 text-brand-600'}`}>{imp.status}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* MAIN AREA - TRANSACTION QUEUE */}
        <div className="lg:col-span-3 space-y-6">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em]">Fila Inteligente ({imported.length})</h3>
          </div>

          {isLoadingQueue ? (
            <div className="py-32 flex flex-col items-center justify-center bg-white rounded-[40px] border border-slate-100 border-dashed">
              <Loader2 className="animate-spin text-brand-600 w-10 h-10 mb-4" />
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sincronizando fila...</p>
            </div>
          ) : imported.length > 0 ? (
            <div className="space-y-4">
              {imported.map(item => (
                <div key={item.id} className="bg-white border border-slate-100 rounded-[32px] p-6 lg:p-8 shadow-sm hover:shadow-md transition-all group border-b-4 border-b-slate-100">
                  <div className="flex flex-col md:flex-row items-center gap-6">
                    <div className="flex-1 flex items-center gap-6 w-full">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${item.amount < 0 ? 'bg-rose-50 text-rose-500 shadow-sm' : 'bg-emerald-50 text-emerald-500 shadow-sm'}`}>
                        <ArrowRight size={24} className={item.amount < 0 ? 'rotate-45' : '-rotate-45'} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{DateUtils.formatDisplayDate(item.date)}</span>
                          {item.installment_total && (
                            <span className="bg-amber-100 text-amber-600 px-2 py-0.5 rounded-lg text-[8px] font-bold tracking-widest border border-amber-200 uppercase">Parcela {item.installment_number}/{item.installment_total}</span>
                          )}
                        </div>
                        <h4 className="text-lg font-bold text-slate-900 leading-tight uppercase truncate">{item.description}</h4>
                      </div>
                    </div>
                    <div className="flex items-center justify-between md:justify-end gap-10 w-full md:w-auto border-t md:border-t-0 pt-6 md:pt-0 border-slate-50">
                      <div className="md:text-right">
                        <p className={`text-2xl font-bold tracking-tighter ${item.amount < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{formatCurrency(item.amount)}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleConfirm(item)} className="h-12 px-8 bg-emerald-600 text-white text-[11px] font-bold uppercase tracking-widest rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 active:scale-95 flex items-center gap-2">
                          <Check size={16} /> Confirmar
                        </button>
                        <button onClick={() => handleDismiss(item.id)} className="w-12 h-12 flex items-center justify-center text-slate-300 hover:text-rose-500 bg-slate-50 rounded-xl hover:bg-rose-50 transition-all"><X size={20} /></button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white border-2 border-dashed border-slate-100 rounded-[40px] p-24 text-center flex flex-col items-center">
              <div className="w-20 h-20 bg-emerald-50 text-emerald-400 rounded-full flex items-center justify-center mb-6 shadow-inner"><CheckCircle2 size={40} /></div>
              <h3 className="text-2xl font-bold text-slate-900 uppercase tracking-tighter italic">Tudo em ordem!</h3>
              <p className="text-sm text-slate-400 font-medium mt-2">Nenhuma transação pendente de conciliação.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Reconcile;
