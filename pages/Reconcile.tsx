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
  Check,
  Calendar,
  Building2,
  User,
  Plus,
  Tag
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
  const [importSource, setImportSource] = useState<'bank' | 'card' | 'smart'>('bank');
  const [isLoadingQueue, setIsLoadingQueue] = useState(true);
  const [recentImports, setRecentImports] = useState<any[]>([]);
  const [categories] = useState<string[]>([
    'Salário', 'Moradia', 'Investimento', 'Cartão de Crédito',
    'Extra', 'Alimentação', 'Transporte', 'Lazer', 'Saúde',
    'Educação', 'Outros', 'Conciliação', 'Pagamentos', 'Transferência',
    'Mercado', 'Assinaturas', 'Farmácia', 'Restaurante', 'Vendas', 'Estorno'
  ]);

  // Novos estados para o Editor Inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [owners, setOwners] = useState<string[]>(['Pessoal']);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [counterAccountId, setCounterAccountId] = useState<string>('');
  const [processingItemId, setProcessingItemId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
    fetchRealAccounts();
    fetchRealCards();
    fetchOwners();
  }, []);

  const fetchOwners = async () => {

    if (!supabase) return;
    try {
      const { data } = await supabase.from('transactions').select('owner_name').not('owner_name', 'is', null);
      const { data: cardData } = await supabase.from('card_transactions').select('owner_name').not('owner_name', 'is', null);

      const allOwners = [
        ...new Set([
          'Pessoal',
          ...(data || []).map(t => t.owner_name),
          ...(cardData || []).map(t => t.owner_name)
        ])
      ].filter(Boolean) as string[];

      setOwners(allOwners);
    } catch (e) {
      console.warn("Erro ao buscar donos:", e);
    }
  };

  const fetchRealAccounts = async () => {

    if (!supabase) return;
    setIsLoadingTargets(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase.from('accounts').select('*').eq('user_id', user.id);
      if (error) throw error;
      const mapped = (data || []).filter((acc: any) => !acc.is_archived).map((acc: any) => ({
        id: acc.id, institution: acc.institution || acc.name || 'Conta', type: acc.type || 'CHECKING'
      } as any));
      setRealAccounts(mapped);
    } catch (err) { console.error(err); } finally { setIsLoadingTargets(false); }
  };

  const fetchRealCards = async () => {

    if (!supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase.from('cards').select('*').eq('user_id', user.id);
      if (error) throw error;
      setRealCards(data || []);
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
      const { data, error } = await supabase.from('imported_transactions').select('*').eq('user_id', user.id).or('status.eq.READY_TO_RECONCILE,status.eq.ready,status.eq.pending').order('date', { ascending: false });
      if (error) throw error;
      setImported((data || []).map((t: any) => ({
        id: t.id,
        date: t.date,
        description: t.description,
        amount: Number(t.amount),
        status: t.status as MatchStatus,
        type: t.amount >= 0 ? 'credit' : 'debit',
        owner_name: t.owner_name || 'Pessoal',
        category: t.category,
        potential_duplicate: t.potential_duplicate,
        duplicate_reason: t.duplicate_reason
      })));
    } catch (err) { console.error(err); }
  };

  const fetchRecentImports = async () => {
    if (!supabase) return;
    try {
      const { data: imports } = await supabase.from('imports').select('id, status, created_at, document_id').order('created_at', { ascending: false }).limit(5);
      if (!imports) return;
      const docIds = imports.filter(i => i.document_id).map(i => i.document_id);
      let docs: any[] = [];
      if (docIds.length > 0) {
        const { data } = await supabase.from('documents').select('id, original_name').in('id', docIds);
        docs = data || [];
      }
      setRecentImports(imports.map(imp => ({ ...imp, original_name: docs.find(d => d.id === imp.document_id)?.original_name || 'Arquivo' })));
    } catch (e) { }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !supabase) return;
    setIsProcessing(true); setProgressStep("Iniciando...");
    try {
      let targetName = 'Importação Direta';
      if (selectedTargetId) {
        if (importSource === 'bank') {
          targetName = realAccounts.find(a => a.id === selectedTargetId)?.institution || targetName;
        } else {
          targetName = realCards.find(c => c.id === selectedTargetId)?.name || targetName;
        }
      }

      const importId = await ReconciliationService.startImport({
        file,
        importSource,
        accountId: selectedTargetId,
        accountName: targetName,
        onProgress: setProgressStep
      });
      await ReconciliationService.pollImportStatus(importId, (imp) => {
        if (imp.status === 'processing') setProgressStep("IA analisando...");
      });
      await fetchData();
    } catch (err: any) { alert(err.message); } finally { setIsProcessing(false); setProgressStep(null); }
  };

  const startEditing = (item: ImportedTransaction) => {
    setEditingId(item.id);
    setEditForm({
      ...item,
      targetId: selectedTargetId,
      owner_name: item.owner_name || 'Pessoal',
      category: 'Conciliação'
    });
  };

  const saveEdit = async (id: string) => {
    try {
      await ReconciliationService.updateTransactionStatus(id, editForm.status, editForm.owner_name);
      setImported(prev => prev.map(t => t.id === id ? { ...t, owner_name: editForm.owner_name, category: editForm.category } : t));
      setEditingId(null);
    } catch (e) { alert("Erro ao salvar"); }
  };

  const handleSyncAll = async () => {
    if (!imported.length || !supabase) return;
    if (!selectedTargetId) return alert("Selecione um destino (Banco/Cartão) para aplicar a todas as transações, ou ajuste individualmente.");

    if (!window.confirm(`Deseja sincronizar todas as ${imported.length} transações para o destino selecionado?`)) return;

    setIsProcessing(true);
    setProgressStep("Sincronizando tudo...");

    try {
      const itemsToSync = [...imported];
      for (const item of itemsToSync) {
        await handleConfirm(item, true);
      }
      alert("Sincronização concluída com sucesso!");
    } catch (e) {
      console.error("Erro na sincronização em lote:", e);
      alert("Houve um erro em algumas transações. Verifique a fila.");
    } finally {
      setIsProcessing(false);
      setProgressStep(null);
      fetchData();
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(imported.map(t => t.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleIgnore = async (id: string) => {
    try {
      await ReconciliationService.updateTransactionStatus(id, 'IGNORED');
      setImported(prev => prev.filter(x => x.id !== id));
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (e) {
      alert("Erro ao ignorar transação");
    }
  };

  const handleBulkIgnore = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Deseja ignorar as ${selectedIds.size} transações selecionadas?`)) return;

    setIsProcessing(true);
    setProgressStep(`Ignorando ${selectedIds.size} itens...`);

    try {
      const idsArray = Array.from(selectedIds);
      for (const id of idsArray) {
        await ReconciliationService.updateTransactionStatus(id, 'IGNORED');
      }
      setImported(prev => prev.filter(t => !selectedIds.has(t.id)));
      setSelectedIds(new Set());
    } catch (e) {
      alert("Erro ao ignorar itens selecionados");
    } finally {
      setIsProcessing(false);
      setProgressStep(null);
    }
  };

  const handleBulkConfirm = async () => {
    if (selectedIds.size === 0) return;
    if (!selectedTargetId) return alert("Selecione um destino (Banco/Cartão) para confirmar a seleção.");

    if (!window.confirm(`Deseja confirmar as ${selectedIds.size} transações selecionadas?`)) return;

    setIsProcessing(true);
    setProgressStep(`Confirmando ${selectedIds.size} itens...`);

    try {
      const idsArray = Array.from(selectedIds);
      const itemsToConfirm = imported.filter(t => selectedIds.has(t.id));

      for (const item of itemsToConfirm) {
        await handleConfirm(item, true); // true = silent/bulk
      }

      setSelectedIds(new Set());
    } catch (e) {
      alert("Erro ao confirmar itens selecionados. Alguns podem não ter sido processados.");
    } finally {
      setIsProcessing(false);
      setProgressStep(null);
      fetchData(); // Recarrega para garantir saldos e lista limpa
    }
  };

  const handleConfirm = async (item: any, isBulk: boolean = false) => {
    if (!supabase) return;
    const isEditing = item.id === editingId && !isBulk;
    const targetId = isEditing ? editForm.targetId : selectedTargetId;
    const owner = isEditing ? editForm.owner_name : (item.owner_name || 'Pessoal');
    const categoryName = isEditing ? editForm.category : (item.category || 'Conciliação');
    const counterId = isEditing ? editForm.counterAccountId : counterAccountId;

    if (!targetId && !isBulk) return alert("Selecione um destino (Banco/Cartão)");
    if (!targetId) return; // Pula em bulk se não tiver destino

    setProcessingItemId(item.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Auto-provisionamento de categoria
      let finalCategoryId = null;
      if (categoryName) {
        finalCategoryId = await ReconciliationService.ensureCategoryExists(categoryName);
      }

      if (importSource === 'bank') {
        const acc = realAccounts.find(a => a.id === targetId);
        const isTransfer = categoryName.toLowerCase().includes('transferencia') || categoryName.toLowerCase().includes('transferência');

        // Transação principal
        await supabase.from('transactions').insert({
          user_id: user.id, date: item.date, description: item.description,
          amount: Math.abs(item.amount), type: item.amount < 0 ? 'EXPENSE' : 'INCOME',
          account_id: targetId, account_name: acc?.institution || 'Conta',
          category: categoryName,
          owner_name: owner, is_paid: true, paid_at: item.date,
          metadata: { category_id: finalCategoryId, is_transfer: isTransfer, counter_account_id: isTransfer ? counterId : null }
        });
        await supabase.rpc('recalculate_account_balance', { p_account_id: targetId });

        // Se for transferência e tiver conta de contrapartida, cria a perna espelhada
        if (isTransfer && counterId && counterId !== 'NONE') {
          const counterAcc = realAccounts.find(a => a.id === counterId);
          await supabase.from('transactions').insert({
            user_id: user.id, date: item.date,
            description: `[TRANSF] ${item.description}`,
            amount: Math.abs(item.amount),
            type: item.amount < 0 ? 'INCOME' : 'EXPENSE', // Inverte o tipo
            account_id: counterId,
            account_name: counterAcc?.institution || 'Conta Destino',
            category: categoryName,
            owner_name: owner, is_paid: true, paid_at: item.date,
            metadata: { category_id: finalCategoryId, is_transfer: true, source_transaction_id: item.id }
          });
          await supabase.rpc('recalculate_account_balance', { p_account_id: counterId });
        }
      } else {
        const stmtId = await FinanceService.getOrCreateStatement(targetId, item.date);
        await supabase.from('card_transactions').insert({
          user_id: user.id, card_id: targetId, used_card_id: targetId, statement_id: stmtId,
          date: item.date, description: item.description, amount: Math.abs(item.amount),
          source: 'IMPORT', status: 'POSTED', owner_name: owner,
          category_id: finalCategoryId,
          metadata: { category_name: categoryName }
        });
      }
      await ReconciliationService.updateTransactionStatus(item.id, 'OK');
      setImported(prev => prev.filter(x => x.id !== item.id));
      if (editingId === item.id) setEditingId(null);
    } catch (e) {
      if (!isBulk) alert("Erro na confirmação");
      throw e;
    } finally {
      setProcessingItemId(null);
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-10 py-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 italic">Conciliação Inteligente</h1>
          <p className="text-sm text-slate-400 font-medium">Refine e direcione suas transações para o destino correto.</p>
        </div>
        <div className="flex items-center gap-3">
          {imported.length > 0 && (
            <button
              onClick={handleSyncAll}
              disabled={isProcessing}
              className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 hover:scale-105 transition-transform active:scale-95 disabled:opacity-50 disabled:scale-100"
            >
              <CheckCircle2 size={18} /> Sincronizar Tudo
            </button>
          )}
          <button onClick={fetchData} className="p-3 bg-white border border-slate-100 text-slate-400 rounded-xl hover:text-slate-900 hover:rotate-180 transition-all duration-500 shadow-sm">
            <RefreshCw size={20} className={isLoadingQueue ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
        <div className="lg:col-span-1 space-y-8">
          <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-8">
            <div className="space-y-4">
              <p className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.2em]">Fluxo de Entrada</p>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => setImportSource('bank')} className={`flex flex-col items-center gap-3 p-4 rounded-3xl border text-[9px] font-bold uppercase transition-all ${importSource === 'bank' ? 'bg-slate-900 border-slate-900 text-white shadow-xl shadow-slate-200' : 'bg-slate-50 border-slate-50 text-slate-400'}`}>
                  <Building2 size={20} /> Banco
                </button>
                <button onClick={() => setImportSource('card')} className={`flex flex-col items-center gap-3 p-4 rounded-3xl border text-[9px] font-bold uppercase transition-all ${importSource === 'card' ? 'bg-slate-900 border-slate-900 text-white shadow-xl shadow-slate-200' : 'bg-slate-50 border-slate-50 text-slate-400'}`}>
                  <CreditCard size={20} /> Cartão
                </button>
                <button onClick={() => setImportSource('smart')} className={`flex flex-col items-center gap-3 p-4 rounded-3xl border text-[9px] font-bold uppercase transition-all ${importSource === 'smart' ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-200' : 'bg-slate-50 border-slate-50 text-slate-400'}`}>
                  <Sparkles size={20} /> Diversos
                </button>
              </div>
            </div>

            <div className="pt-2">
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} disabled={isProcessing} className={`w-full py-16 border-2 border-dashed rounded-[40px] flex flex-col items-center justify-center gap-4 transition-all active:scale-[0.98] ${isProcessing ? 'border-brand-500 bg-brand-50/20' : 'border-slate-100 hover:border-brand-200 hover:bg-slate-50/50'}`}>
                {isProcessing ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 size={32} className="animate-spin text-brand-600" />
                    <span className="text-[10px] font-bold text-brand-600 uppercase tracking-widest">{progressStep}</span>
                  </div>
                ) : (
                  <>
                    <div className="w-16 h-16 bg-white shadow-xl shadow-slate-100 rounded-[24px] flex items-center justify-center text-slate-400 group-hover:text-brand-600 transition-colors">
                      <UploadCloud size={32} />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold text-slate-900 uppercase tracking-widest">Importar Extrato</p>
                      <p className="text-[9px] font-bold text-slate-300 uppercase mt-1">Sincronização via IA</p>
                    </div>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-2">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                  checked={imported.length > 0 && selectedIds.size === imported.length}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                />
                <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.3em]">Operações Pendentes ({imported.length})</h3>
              </div>
            </div>

            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 animate-in slide-in-from-right-2 duration-300">
                <span className="text-[10px] font-bold text-slate-400 uppercase mr-2">{selectedIds.size} selecionado(s)</span>
                <button
                  onClick={handleBulkConfirm}
                  disabled={isProcessing}
                  className="px-4 py-2 bg-slate-900 text-white text-[9px] font-bold uppercase tracking-widest rounded-lg hover:bg-brand-600 transition-colors shadow-md shadow-slate-200"
                >
                  <Check size={14} className="inline mr-1" /> Confirmar Seleção
                </button>
                <button
                  onClick={handleBulkIgnore}
                  disabled={isProcessing}
                  className="px-4 py-2 bg-amber-500 text-white text-[9px] font-bold uppercase tracking-widest rounded-lg hover:bg-amber-600 transition-colors shadow-md shadow-amber-100"
                >
                  <X size={14} className="inline mr-1" /> Ignorar Seleção
                </button>
              </div>
            )}
          </div>

          {isLoadingQueue ? (
            <div className="py-40 bg-white rounded-[40px] border border-slate-100 flex flex-col items-center justify-center">
              <Loader2 size={40} className="animate-spin text-slate-200 mb-4" />
              <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Mapeando transações...</p>
            </div>
          ) : imported.length > 0 ? (
            <div className="space-y-4">
              {imported.map(item => {
                const isEditing = editingId === item.id;
                return (
                  <div key={item.id} className={`bg-white border transition-all duration-300 rounded-[32px] overflow-hidden ${isEditing ? 'border-brand-500 shadow-2xl ring-4 ring-brand-500/5' : 'border-slate-100 shadow-sm hover:shadow-md'} ${selectedIds.has(item.id) ? 'border-brand-200 bg-brand-50/5' : ''}`}>
                    <div className="p-8">
                      <div className="flex flex-col lg:flex-row gap-6">
                        {/* Multi-select Checkbox */}
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            className="w-5 h-5 rounded-lg border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                            checked={selectedIds.has(item.id)}
                            onChange={() => handleToggleSelect(item.id)}
                          />
                        </div>

                        {/* Status Icon */}
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${item.amount < 0 ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-500'}`}>
                          {processingItemId === item.id ? (
                            <Loader2 size={24} className="animate-spin" />
                          ) : (
                            <RefreshCw size={24} />
                          )}
                        </div>

                        {/* Data Sections */}
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                          {/* Col 1: Desc & Date */}
                          <div className="lg:col-span-1 space-y-1">
                            {isEditing ? (
                              <input
                                type="date"
                                value={editForm.date || item.date}
                                onChange={e => setEditForm({ ...editForm, date: e.target.value })}
                                className="w-full bg-slate-50 border-none rounded-xl text-[10px] font-bold p-2 outline-none focus:ring-2 focus:ring-brand-500 mb-1"
                              />
                            ) : (
                              <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{DateUtils.formatDisplayDate(item.date)}</p>
                            )}

                            {isEditing ? (
                              <input type="text" value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl text-xs font-bold p-2 outline-none focus:ring-2 focus:ring-brand-500" />
                            ) : (
                              <div className="space-y-1">
                                <h4 className="text-xs font-bold text-slate-900 truncate uppercase" title={item.description}>{item.description}</h4>
                                {item.potential_duplicate && (
                                  <div className="flex items-start gap-1 p-1.5 bg-amber-50 rounded-lg border border-amber-100">
                                    <AlertCircle size={10} className="text-amber-500 mt-0.5 shrink-0" />
                                    <p className="text-[8px] font-bold text-amber-600 uppercase leading-[1.2]">{item.duplicate_reason || "Possível Duplicidade"}</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Col 2: Target Selection */}
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Destino</p>
                            <select
                              value={isEditing ? editForm.targetId : selectedTargetId}
                              onChange={e => isEditing ? setEditForm({ ...editForm, targetId: e.target.value }) : setSelectedTargetId(e.target.value)}
                              className="w-full bg-slate-50 border-none rounded-xl text-[10px] font-bold p-2 outline-none appearance-none cursor-pointer"
                            >
                              <option value="">Selecionar...</option>
                              {importSource === 'bank' ? realAccounts.map(a => <option key={a.id} value={a.id}>{a.institution}</option>) : realCards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </div>

                          {/* Col 3: Category */}
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Categoria</p>
                            <div className="relative">
                              <Tag size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                              <select
                                value={isEditing ? editForm.category : (item.category || 'Conciliação')}
                                onChange={e => isEditing ? setEditForm({ ...editForm, category: e.target.value }) : startEditing(item)}
                                className="w-full pl-8 bg-slate-50 border-none rounded-xl text-[10px] font-bold p-2 outline-none"
                              >
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                          </div>

                          {/* Col 4: Entity (Owner) */}
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Entidade</p>
                            <div className="relative">
                              <Building2 size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                              <select
                                value={isEditing ? editForm.owner_name : (item.owner_name || 'Pessoal')}
                                onChange={e => isEditing ? setEditForm({ ...editForm, owner_name: e.target.value }) : startEditing(item)}
                                className="w-full pl-8 bg-slate-50 border-none rounded-xl text-[10px] font-bold p-2 outline-none"
                              >
                                {owners.map(o => <option key={o} value={o}>{o}</option>)}
                                <option value="NEW">+ Criar Nova...</option>
                              </select>
                            </div>
                          </div>

                          {/* Col 5: Counterparty (Transfer only) */}
                          {((isEditing ? editForm.category : (item.category || '')).toLowerCase().includes('transfer')) && (
                            <div className="space-y-1 animate-in zoom-in-95 duration-200">
                              <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest flex items-center gap-1">
                                <RefreshCw size={10} /> Conta Contrapartida
                              </p>
                              <select
                                value={isEditing ? editForm.counterAccountId : counterAccountId}
                                onChange={e => isEditing ? setEditForm({ ...editForm, counterAccountId: e.target.value }) : setCounterAccountId(e.target.value)}
                                className="w-full bg-amber-50 border border-amber-100 rounded-xl text-[10px] font-bold p-2 outline-none appearance-none cursor-pointer text-amber-900"
                              >
                                <option value="">Selecionar...</option>
                                <option value="NONE">- Nenhuma (Apenas Registrar) -</option>
                                {realAccounts.filter(a => a.id !== (isEditing ? editForm.targetId : selectedTargetId)).map(a => (
                                  <option key={a.id} value={a.id}>{a.institution}</option>
                                ))}
                              </select>
                            </div>
                          )}

                          {/* Col 6: Value */}
                          <div className={`text-right flex flex-col justify-center ${((isEditing ? editForm.category : (item.category || '')).toLowerCase().includes('transfer')) ? 'lg:col-span-1' : 'lg:col-span-1'}`}>
                            <span className={`text-lg font-bold tracking-tighter ${item.amount < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.amount)}
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 border-l border-slate-50 pl-6">
                          <div className="flex flex-col gap-2">
                            {/* Botão de Confirmar Principal (Sempre visível para facilitar) */}
                            <button
                              onClick={() => handleConfirm(item)}
                              disabled={processingItemId === item.id}
                              className={`h-12 px-6 ${item.amount < 0 ? 'bg-rose-600' : 'bg-emerald-600'} text-white text-[10px] font-bold uppercase tracking-[0.2em] rounded-xl hover:opacity-90 shadow-xl transition-all active:scale-95 disabled:opacity-50`}
                            >
                              {processingItemId === item.id ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Confirmar'}
                            </button>

                            <div className="flex items-center gap-2">
                              {isEditing && (
                                <button onClick={() => saveEdit(item.id)} title="Apenas salvar rascunho" className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-all"><Check size={16} /></button>
                              )}

                              {item.potential_duplicate && !isEditing && (
                                <button onClick={() => handleIgnore(item.id)} className="h-9 px-3 bg-amber-500 text-white text-[8px] font-bold uppercase rounded-lg hover:bg-amber-600 transition-all">Ignorar</button>
                              )}

                              <button onClick={() => handleIgnore(item.id)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors">
                                <XCircle size={18} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white border-2 border-dashed border-slate-100 rounded-[40px] p-32 text-center flex flex-col items-center">
              <div className="w-24 h-24 bg-brand-50 text-brand-500 rounded-[32px] flex items-center justify-center mb-6 shadow-inner">
                <CheckCircle2 size={48} />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 italic">Fluxo Limpo</h3>
              <p className="text-slate-400 font-medium text-sm mt-3 uppercase tracking-widest">Nada pendente para conciliação hoje.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Reconcile;
