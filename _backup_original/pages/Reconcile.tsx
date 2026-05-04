
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

      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id);

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
    if (!supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('cards')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;
      const filtered = (data || [])
        .filter((c: any) => c.is_archived === false || c.status === 'active' || !c.is_archived)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setRealCards(filtered);
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
      const { data, error } = await supabase
        .from('imported_transactions')
        .select('*')
        .eq('user_id', user.id)
        .or('status.eq.READY_TO_RECONCILE,status.eq.ready,status.eq.pending')
        .order('date', { ascending: false });
      if (error) throw error;
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
      const { data: imports } = await supabase.from('imports').select('id, status, created_at, document_id').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10);
      if (!imports) return;
      const docIds = imports.map(i => i.document_id);
      const { data: docs } = await supabase.from('documents').select('id, original_name').in('id', docIds);
      setRecentImports(imports.map(imp => ({
        ...imp,
        original_name: docs?.find(d => d.id === imp.document_id)?.original_name || 'Arquivo'
      })));
    } catch (err) { console.error(err); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !supabase || !selectedTargetId) return;

    setIsProcessing(true);
    setProgressStep("Iniciando...");

    try {
      const targetName = importSource === 'bank'
        ? realAccounts.find(a => a.id === selectedTargetId)?.institution || 'Conta'
        : realCards.find(c => c.id === selectedTargetId)?.name || 'Cartão';

      const importId = await ReconciliationService.startImport({
        file,
        importSource,
        accountId: selectedTargetId,
        accountName: targetName,
        onProgress: setProgressStep
      });

      await ReconciliationService.pollImportStatus(importId, (imp) => {
        if (imp.status === 'processing') setProgressStep("IA processando...");
        if (imp.status === 'ready') setProgressStep("Finalizado!");
      });

      await fetchData();
    } catch (err: any) {
      alert('Erro: ' + (err.message || 'Falha na importação.'));
      await fetchRecentImports();
    } finally {
      setIsProcessing(false);
      setProgressStep(null);
    }
  };

  const handleConfirm = async (item: ImportedTransaction) => {
    if (!supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (importSource === 'bank') {
        const acc = realAccounts.find(a => a.id === selectedTargetId);
        if (!acc) return;
        await supabase.from('transactions').insert({
          user_id: user.id,
          date: item.date,
          description: item.description,
          amount: Math.abs(item.amount),
          type: item.amount < 0 ? 'EXPENSE' : 'INCOME',
          account_id: acc.id,
          account_name: acc.institution,
          category: 'Conciliação'
        });
        await supabase.rpc('recalculate_account_balance', { p_account_id: acc.id });
      } else {
        const card = realCards.find(c => c.id === selectedTargetId);
        if (!card) return;
        await supabase.from('card_transactions').insert({
          user_id: user.id,
          card_id: card.id,
          used_card_id: card.id,
          date: item.date,
          description: item.description,
          amount: Math.abs(item.amount),
          source: 'IMPORT',
          status: 'POSTED'
        });
      }
      await ReconciliationService.updateTransactionStatus(item.id, 'OK');
      setImported(prev => prev.filter(x => x.id !== item.id));
    } catch (err) { alert("Falha ao confirmar"); }
  };

  const handleDismiss = async (id: string) => {
    try {
      await ReconciliationService.updateTransactionStatus(id, 'IGNORED');
      setImported(prev => prev.filter(x => x.id !== id));
    } catch (err) { alert("Erro ao ignorar"); }
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:py-8 lg:px-8 bg-gray-50 min-h-screen">
      <header className="mb-6 lg:mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="text-blue-600 shrink-0" /> Conciliação Bancária
          </h1>
          <p className="text-gray-500 text-xs lg:text-sm">Gerencie transações extraídas por IA</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button onClick={() => navigate('/ai')} className="flex-1 md:flex-none justify-center flex items-center gap-2 px-4 py-3 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-xl text-[10px] font-black uppercase hover:bg-indigo-100 transition-all active:scale-95">
            <Sparkles size={14} /> AI Comprovantes
          </button>
          <button onClick={fetchData} className="p-3 text-gray-400 hover:text-blue-600 bg-white rounded-xl border border-gray-200 shadow-sm transition-all active:bg-gray-50">
            <RefreshCw size={20} className={isLoadingQueue ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 lg:gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-5 lg:p-6 rounded-3xl border border-gray-200 shadow-sm">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Novo Extrato</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setImportSource('bank'); setSelectedTargetId(''); }} className={`p-3 rounded-xl border text-[10px] font-black uppercase transition-all ${importSource === 'bank' ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-50 text-gray-500'}`}><Landmark size={20} className="mx-auto mb-1" /> Banco</button>
                <button onClick={() => { setImportSource('card'); setSelectedTargetId(''); }} className={`p-3 rounded-xl border text-[10px] font-black uppercase transition-all ${importSource === 'card' ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-50 text-gray-500'}`}><CreditCard size={20} className="mx-auto mb-1" /> Cartão</button>
              </div>
              <select value={selectedTargetId} onChange={(e) => setSelectedTargetId(e.target.value)} className="w-full h-12 px-4 bg-gray-50 border rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Selecione o {importSource === 'bank' ? 'Banco' : 'Cartão'}...</option>
                {importSource === 'bank' ? realAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.institution}</option>) : realCards.map(card => <option key={card.id} value={card.id}>{card.name}</option>)}
              </select>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} disabled={isProcessing || !selectedTargetId} className="w-full py-10 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center gap-3 hover:bg-blue-50 transition-all active:scale-95">
                {isProcessing ? <Loader2 size={32} className="animate-spin text-blue-600" /> : <UploadCloud size={32} className="text-gray-300" />}
                <span className="text-[10px] font-black uppercase">{isProcessing ? progressStep : 'Upload Arquivo'}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-black text-gray-900 uppercase">Fila de Transações ({imported.length})</h3>
          </div>
          <div className="space-y-3">
            {imported.map(item => (
              <div key={item.id} className="bg-white border border-gray-200 rounded-3xl p-4 lg:p-5 shadow-sm">
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="flex-1 flex items-center gap-4 w-full">
                    <div className={`p-3 rounded-2xl ${item.amount < 0 ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-500'}`}>
                      <ArrowRight size={20} className={item.amount < 0 ? 'rotate-45' : '-rotate-45'} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{new Date(item.date).toLocaleDateString('pt-BR')}</p>
                      <p className="text-sm font-bold text-gray-900 truncate leading-tight">{item.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className={`text-base font-black ${item.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(item.amount)}</p>
                    <button onClick={() => handleConfirm(item)} className="px-5 py-2.5 bg-green-600 text-white text-[10px] font-black uppercase rounded-xl active:scale-95">Confirmar</button>
                    <button onClick={() => handleDismiss(item.id)} className="p-2.5 text-gray-300 hover:text-red-600 bg-gray-50 rounded-xl"><X size={18} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reconcile;
