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
  AlertCircle
} from 'lucide-react';
import { ImportedTransaction, MatchStatus, BankAccount } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase/client';
import { ReconciliationService } from '../services/reconciliation.service';

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
    if (isSupabaseConfigured && supabase) {
      fetchData();
      fetchRealAccounts();
      fetchRealCards();
    }
  }, []);

  const fetchRealAccounts = async () => {
    if (!supabase) return;
    setIsLoadingTargets(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('accounts').select('*').eq('user_id', user.id);
      const mapped = (data || []).filter((acc: any) => !acc.is_archived).map((acc: any) => ({
        id: acc.id,
        institution: acc.institution || acc.name || 'Conta',
        name: acc.name || acc.institution || 'Conta',
        type: acc.type || 'CHECKING',
        currency: acc.currency || 'BRL',
        initialBalance: Number(acc.initial_balance || 0),
        currentBalance: Number(acc.current_balance || 0),
        limit: Number(acc.limit || 0),
        color: acc.color,
        isArchived: acc.is_archived,
        includeInDashboard: acc.include_in_dashboard !== false
      })).sort((a, b) => a.institution.localeCompare(b.institution));
      setRealAccounts(mapped);
    } catch (err) { console.error(err); } finally { setIsLoadingTargets(false); }
  };

  const fetchRealCards = async () => {
    if (!supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('cards').select('*').eq('user_id', user.id);
      setRealCards((data || []).filter((c: any) => !c.is_archived).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) { console.error(err); }
  };

  const fetchData = async () => {
    setIsLoadingQueue(true);
    await Promise.all([fetchQueue(), fetchRecentImports()]);
    setIsLoadingQueue(false);
  };

  const fetchQueue = async () => {
    if (!supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('imported_transactions').select('*').eq('user_id', user.id).or('status.eq.READY_TO_RECONCILE,status.eq.ready,status.eq.pending').order('date', { ascending: false });
      setImported((data || []).map((t: any) => ({
        id: t.id,
        date: t.date,
        description: t.description,
        amount: Number(t.amount),
        status: t.status as MatchStatus,
        type: t.amount >= 0 ? 'credit' : 'debit'
      })));
    } catch (err) { console.error(err); }
  };

  const fetchRecentImports = async () => {
    if (!supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: imports } = await supabase.from('imports').select('id, status, created_at, document_id').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5);
      setRecentImports(imports || []);
    } catch (err) { console.error(err); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTargetId) return;
    setIsProcessing(true);
    setProgressStep("Iniciando...");
    try {
      const targetName = importSource === 'bank' ? realAccounts.find(a => a.id === selectedTargetId)?.institution : realCards.find(c => c.id === selectedTargetId)?.name;
      const importId = await ReconciliationService.startImport({ file, importSource, accountId: selectedTargetId, accountName: targetName || 'Conta', onProgress: setProgressStep });
      await ReconciliationService.pollImportStatus(importId, (imp) => {
        if (imp.status === 'processing') setProgressStep("IA...");
        if (imp.status === 'ready') setProgressStep("Pronto");
      });
      await fetchData();
    } catch (err: any) { alert(err.message); } finally { setIsProcessing(false); setProgressStep(null); }
  };

  const handleConfirm = async (item: ImportedTransaction) => {
    if (!supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (importSource === 'bank') {
        const acc = realAccounts.find(a => a.id === selectedTargetId);
        if (!acc) return;
        await supabase.from('transactions').insert({ user_id: user.id, date: item.date, description: item.description, amount: Math.abs(item.amount), type: item.amount < 0 ? 'EXPENSE' : 'INCOME', account_id: acc.id, account_name: acc.institution, category: 'Conciliação' });
        await supabase.rpc('recalculate_account_balance', { p_account_id: acc.id });
      } else {
        const card = realCards.find(c => c.id === selectedTargetId);
        if (!card) return;
        await supabase.from('card_transactions').insert({ user_id: user.id, card_id: card.id, used_card_id: card.id, date: item.date, description: item.description, amount: Math.abs(item.amount), source: 'IMPORT', status: 'POSTED' });
      }
      await ReconciliationService.updateTransactionStatus(item.id, 'OK');
      setImported(prev => prev.filter(x => x.id !== item.id));
    } catch (err) { console.error(err); }
  };

  const handleDismiss = async (id: string) => {
    try {
      await ReconciliationService.updateTransactionStatus(id, 'IGNORED');
      setImported(prev => prev.filter(x => x.id !== id));
    } catch (err) { console.error(err); }
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <div className="max-w-6xl mx-auto py-8 sm:py-10 px-6 sm:px-8 space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldCheck size={24} className="text-brand-600" /> Conciliação Bancária
          </h1>
          <p className="text-slate-500 text-sm">Gerencie transações extraídas por IA.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/ai')} className="px-5 py-3 bg-brand-50 text-brand-600 rounded-xl text-[9px] font-bold uppercase tracking-widest border border-brand-100/50 flex items-center gap-2 hover:bg-brand-100 transition-all">
            <Sparkles size={14} /> AI Comprovantes
          </button>
          <button onClick={fetchData} className="p-3 text-slate-300 hover:text-slate-900 bg-white rounded-xl border border-slate-100 transition-all">
            <RefreshCw size={18} className={isLoadingQueue ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Novo Extrato</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setImportSource('bank')} className={`py-4 rounded-xl border text-[9px] font-bold uppercase tracking-widest transition-all ${importSource === 'bank' ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                  <Landmark size={18} className="mx-auto mb-1" /> Banco
                </button>
                <button onClick={() => setImportSource('card')} className={`py-4 rounded-xl border text-[9px] font-bold uppercase tracking-widest transition-all ${importSource === 'card' ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                  <CreditCard size={18} className="mx-auto mb-1" /> Cartão
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Origem Destino</label>
                <select value={selectedTargetId} onChange={(e) => setSelectedTargetId(e.target.value)} className="w-full h-11 px-4 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-slate-200 transition-all">
                  <option value="">Selecione...</option>
                  {importSource === 'bank' ? realAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.institution}</option>) : realCards.map(card => <option key={card.id} value={card.id}>{card.name}</option>)}
                </select>
              </div>

              <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing || !selectedTargetId}
                className={`w-full py-12 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-3 transition-all ${isProcessing ? 'border-brand-400 bg-brand-50/10' : 'border-slate-100 hover:bg-slate-50 text-slate-300 hover:text-slate-900'}`}
              >
                {isProcessing ? <Loader2 size={32} className="animate-spin text-brand-600" /> : <UploadCloud size={32} />}
                <span className="text-[9px] font-bold uppercase tracking-widest">{isProcessing ? progressStep : 'Upload Arquivo'}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fila de Transações ({imported.length})</h3>
          </div>
          <div className="space-y-3">
            {imported.length === 0 ? (
              <div className="bg-white border border-slate-100 border-dashed rounded-3xl py-12 text-center space-y-4">
                <CheckCircle2 size={32} className="mx-auto text-slate-100" />
                <div className="space-y-1">
                  <p className="font-bold text-slate-900 uppercase tracking-tight">Nenhuma Pendência</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Importe novos extratos para ver transações aqui</p>
                </div>
              </div>
            ) : (
              imported.map(item => (
                <div key={item.id} className="bg-white border border-slate-100 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center gap-6 hover:border-slate-200 shadow-sm transition-all group">
                  <div className="flex-grow flex items-center gap-5 w-full">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.amount < 0 ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-500'}`}>
                      <ArrowRight size={18} className={item.amount < 0 ? 'rotate-45' : '-rotate-45'} />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <p className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">{new Date(item.date).toLocaleDateString('pt-BR')}</p>
                      <h4 className="font-bold text-slate-900 uppercase truncate leading-tight tracking-tight">{item.description}</h4>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
                    <p className={`text-lg font-black tracking-tighter ${item.amount < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{formatCurrency(item.amount)}</p>
                    <div className="flex gap-2">
                      <button onClick={() => handleConfirm(item)} className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-[9px] font-bold uppercase tracking-widest hover:bg-brand-600 shadow-md active:scale-95 transition-all">Confirmar</button>
                      <button onClick={() => handleDismiss(item.id)} className="p-2.5 text-slate-200 hover:text-rose-600 transition-colors"><X size={18} /></button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reconcile;
