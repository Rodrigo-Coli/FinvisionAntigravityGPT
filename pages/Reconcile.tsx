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

      console.log('[Reconcile] Buscando contas para:', user.id);
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id);

      if (error) {
        console.error('Erro ao buscar contas:', error);
        throw error;
      }

      console.log('[Reconcile] Contas encontradas:', data?.length);

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
      console.error('Erro ao buscar contas reais:', err);
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
    } catch (err) {
      console.error('Erro ao buscar cartões:', err);
    }
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

      const mapped = (data || [])
        .filter((t: any) => !t.ignored)
        .map((t: any) => ({
          id: t.id,
          date: t.date,
          description: t.description,
          amount: Number(t.amount),
          status: t.status as MatchStatus,
          type: t.amount >= 0 ? 'credit' : 'debit'
        }));

      setImported(mapped);
    } catch (err) {
      console.error('Erro ao buscar fila:', err);
    }
  };

  const fetchRecentImports = async () => {
    if (!supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: imports, error: impErr } = await supabase
        .from('imports')
        .select('id, status, created_at, document_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (impErr) throw impErr;
      if (!imports || imports.length === 0) {
        setRecentImports([]);
        return;
      }

      const docIds = imports.filter(i => i.document_id).map(i => i.document_id);
      let docs: any[] = [];
      if (docIds.length > 0) {
        const { data, error: docErr } = await supabase
          .from('documents')
          .select('id, original_name')
          .in('id', docIds);
        if (docErr) throw docErr;
        docs = data || [];
      }

      const combined = imports.map(imp => {
        const doc = docs.find(d => d.id === imp.document_id);
        return {
          ...imp,
          import_id: imp.id,
          original_name: doc?.original_name || 'Arquivo'
        };
      });

      setRecentImports(combined);
    } catch (err) {
      console.error("Erro ao buscar imports recentes:", err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !supabase) return;

    if (!selectedTargetId) {
      alert(`Selecione um ${importSource === 'bank' ? 'banco' : 'cartão'} de destino primeiro.`);
      return;
    }

    setIsProcessing(true);
    setProgressStep("Iniciando...");

    try {
      let targetName = '';
      if (importSource === 'bank') {
        const acc = realAccounts.find(a => a.id === selectedTargetId);
        targetName = acc?.institution || 'Conta';
      } else {
        const card = realCards.find(c => c.id === selectedTargetId);
        targetName = card?.name || 'Cartão';
      }

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
      console.error("Erro na importação:", err);
      alert('Erro: ' + (err.message || 'Falha na importação. Verifique os logs do backend.'));
      await fetchRecentImports();
    } finally {
      setIsProcessing(false);
      setProgressStep(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirm = async (item: ImportedTransaction) => {
    if (!supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (importSource === 'bank') {
        const acc = realAccounts.find(a => a.id === selectedTargetId);
        if (!acc) return alert("Selecione uma conta válida.");

        const { error: txError } = await supabase.from('transactions').insert({
          user_id: user.id,
          date: item.date,
          description: item.description,
          amount: Math.abs(item.amount),
          type: item.amount < 0 ? 'EXPENSE' : 'INCOME',
          account_id: acc.id,
          account_name: acc.institution,
          category: 'Conciliação'
        });

        if (txError) throw txError;
        await supabase.rpc('recalculate_account_balance', { p_account_id: acc.id });
      } else {
        const card = realCards.find(c => c.id === selectedTargetId);
        if (!card) return alert("Selecione um cartão válido.");

        const { error: txError } = await supabase.from('card_transactions').insert({
          user_id: user.id,
          card_id: card.id,
          used_card_id: card.id,
          date: item.date,
          description: item.description,
          amount: Math.abs(item.amount),
          source: 'IMPORT',
          status: 'POSTED'
        });

        if (txError) throw txError;
      }

      await ReconciliationService.updateTransactionStatus(item.id, 'OK');
      setImported(prev => prev.filter(x => x.id !== item.id));
    } catch (err) {
      console.error(err);
      alert("Falha ao confirmar transação");
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      await ReconciliationService.updateTransactionStatus(id, 'IGNORED');
      setImported(prev => prev.filter(x => x.id !== id));
    } catch (err) {
      alert("Erro ao ignorar transação");
    }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

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
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2 ml-1">Origem</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { setImportSource('bank'); setSelectedTargetId(''); }} className={`flex flex-col items-center gap-2 p-3.5 rounded-xl border text-[10px] font-black uppercase transition-all ${importSource === 'bank' ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-gray-50 border-gray-100 text-gray-500'}`}><Landmark size={20} /> Banco</button>
                  <button onClick={() => { setImportSource('card'); setSelectedTargetId(''); }} className={`flex flex-col items-center gap-2 p-3.5 rounded-xl border text-[10px] font-black uppercase transition-all ${importSource === 'card' ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-gray-50 border-gray-100 text-gray-500'}`}><CreditCard size={20} /> Cartão</button>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2 ml-1">{importSource === 'bank' ? 'Conta' : 'Cartão'}</label>
                <select
                  value={selectedTargetId}
                  onChange={(e) => setSelectedTargetId(e.target.value)}
                  disabled={isLoadingTargets}
                  className="w-full h-12 px-4 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">{isLoadingTargets ? 'Carregando...' : `Selecione o ${importSource === 'bank' ? 'Banco' : 'Cartão'}...`}</option>

                  {importSource === 'bank' ? (
                    realAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.institution} ({getAccountTypeLabel(acc.type)})
                      </option>
                    ))
                  ) : (
                    realCards.map(card => (
                      <option key={card.id} value={card.id}>
                        {card.name} {card.is_additional ? `(${card.additional_label || 'Adicional'})` : ''} • ****{card.last4}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div className="pt-2">
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".csv,.ofx,.pdf,.png,.jpg,.jpeg" />
                <button onClick={() => fileInputRef.current?.click()} disabled={isProcessing || !selectedTargetId} className="w-full py-10 border-2 border-dashed border-gray-200 rounded-3xl flex flex-col items-center justify-center gap-3 hover:bg-blue-50 transition-all group active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                  {isProcessing ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 size={32} className="animate-spin text-blue-600" />
                      <span className="text-[9px] font-black text-blue-600 uppercase animate-pulse">{progressStep}</span>
                    </div>
                  ) : (
                    <>
                      <UploadCloud size={32} className="text-gray-300 group-hover:text-blue-500" />
                      <div className="text-center">
                        <span className="text-[10px] font-black uppercase block">Upload de Arquivo</span>
                        <span className="text-[8px] font-bold opacity-50 uppercase mt-1">CSV, PDF, OFX ou FOTO</span>
                      </div>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
          <div className="bg-white p-5 lg:p-6 rounded-3xl border border-gray-200 shadow-sm">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2"><History size={14} /> Recentes</h3>
            <div className="space-y-2">
              {recentImports.length === 0 ? (<p className="text-[9px] text-gray-400 font-bold uppercase text-center py-4">Sem registros</p>) : (
                recentImports.map(imp => (
                  <div key={imp.id} className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 flex justify-between items-center gap-2">
                    <div className="min-w-0">
                      <p className="text-[9px] font-black text-gray-800 truncate uppercase">{imp.original_name || 'Arquivo'}</p>
                      <p className="text-[8px] text-gray-400 font-bold">{new Date(imp.created_at).toLocaleDateString()}</p>
                    </div>
                    <span className={`text-[7px] font-black px-1.5 py-0.5 rounded uppercase shrink-0 ${imp.status === 'ready' ? 'bg-green-100 text-green-700' :
                      imp.status === 'error' ? 'bg-red-100 text-red-700' :
                        imp.status === 'processing' ? 'bg-purple-100 text-purple-700' :
                          'bg-blue-100 text-blue-700'
                      }`} title={imp.error_message}>{imp.status}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-black text-gray-900 uppercase">Fila de Transações ({imported.length})</h3>
          </div>
          {isLoadingQueue ? (
            <div className="py-20 flex flex-col items-center justify-center bg-white rounded-3xl border border-dashed border-gray-200">
              <Loader2 className="animate-spin text-blue-600 mb-3" />
              <p className="text-[9px] font-black text-gray-400 uppercase">Sincronizando dados...</p>
            </div>
          ) : imported.length > 0 ? (
            <div className="space-y-3">
              {imported.map(item => (
                <div key={item.id} className="bg-white border border-gray-200 rounded-3xl p-4 lg:p-5 shadow-sm hover:border-blue-300 transition-all">
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <div className="flex-1 flex items-center gap-4 w-full min-w-0">
                      <div className={`p-3 rounded-2xl shrink-0 ${item.amount < 0 ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-500'}`}>
                        <ArrowRight size={20} className={item.amount < 0 ? 'rotate-45' : '-rotate-45'} />
                      </div>
                      <div className="min-w-0 truncate">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{new Date(item.date).toLocaleDateString('pt-BR')}</p>
                        <p className="text-sm font-bold text-gray-900 truncate leading-tight">{item.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto border-t sm:border-t-0 pt-3 sm:pt-0">
                      <div className="sm:text-right">
                        <p className={`text-base font-black ${item.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(item.amount)}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleConfirm(item)} className="px-5 py-2.5 bg-green-600 text-white text-[10px] font-black uppercase rounded-xl hover:bg-green-700 shadow-md active:scale-95">Confirmar</button>
                        <button onClick={() => handleDismiss(item.id)} className="p-2.5 text-gray-300 hover:text-red-600 bg-gray-50 rounded-xl"><X size={18} /></button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white border-2 border-dashed border-gray-200 rounded-3xl p-20 text-center flex flex-col items-center">
              <CheckCircle2 size={40} className="text-green-200 mb-4" />
              <p className="font-black text-gray-900 uppercase tracking-tighter">Nenhuma pendência</p>
              <p className="text-[10px] text-gray-400 font-bold mt-1 uppercase">Importe novos extratos para ver transações aqui</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Reconcile;
