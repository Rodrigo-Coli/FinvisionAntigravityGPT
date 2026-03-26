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
  const [categories, setCategories] = useState<string[]>([]);
  const [subcategories, setSubcategories] = useState<{ id: string; name: string; category_name?: string }[]>([]);

  // Novos estados para o Editor Inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [owners, setOwners] = useState<string[]>(['Pessoal']);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [counterAccountId, setCounterAccountId] = useState<string>('');
  const [processingItemId, setProcessingItemId] = useState<string | null>(null);
  const [selectedTargetName, setSelectedTargetName] = useState('');
  const [globalCounterpartName, setGlobalCounterpartName] = useState('');

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnlyDuplicates, setShowOnlyDuplicates] = useState(false);
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkSubcategory, setBulkSubcategory] = useState('');
  const [bulkOwner, setBulkOwner] = useState('');
  const [bulkTarget, setBulkTarget] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isCategorizingAI, setIsCategorizingAI] = useState(false);

  const handleSmartCategorize = async () => {
    setIsCategorizingAI(true);
    try {
      const needsCategory = imported.filter(t => !t.category || t.category === '' || t.category === 'Conciliação');
      const uniqueDescriptions = Array.from(new Set(needsCategory.map(t => t.description)));

      if (uniqueDescriptions.length === 0) {
        alert("Nenhuma transação que necessite de categorização encontrada.");
        return;
      }

      const res = await fetch('/api/categorize-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descriptions: uniqueDescriptions, categories: subcategories })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message);

      const mapping = new Map(data.data.map((d: any) => [d.description, d]));
      
      setImported(prev => prev.map(t => {
        const match = mapping.get(t.description);
        if (match && (match as any).category) {
             return { ...t, category: (match as any).category, subcategory: (match as any).subcategory || (t as any).subcategory || '' } as any;
        }
        return t;
      }));

    } catch (err: any) {
      console.error(err);
      alert("Erro na IA: " + err.message);
    } finally {
      setIsCategorizingAI(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchRealAccounts();
    fetchRealCards();
    fetchOwners();
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    const dbCategories = await FinanceService.getCategories();
    setCategories(dbCategories);
  };

  const fetchSubcategories = async () => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: cats } = await supabase.from('categories').select('id, name').eq('user_id', user.id);
    const { data: subs } = await supabase.from('subcategories').select('*').eq('user_id', user.id);
    if (subs && cats) {
      const mapped = subs.map((s: any) => {
        const p = cats.find((c: any) => c.id === s.category_id);
        return { ...s, category_name: p?.name };
      });
      setSubcategories(mapped);
    }
  };

  const fetchOwners = async () => {
    const dbEntities = await FinanceService.getEntities();
    setOwners(dbEntities);
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
      } as any)).sort((a: any, b: any) => a.institution.localeCompare(b.institution));
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
      setRealCards((data || []).sort((a: any, b: any) => a.name.localeCompare(b.name)));
    } catch (err) { console.error(err); }
  };

  const fetchData = async () => {
    setIsLoadingQueue(true);
    await Promise.all([
      fetchQueue(),
      fetchRecentImports(),
      fetchCategories(),
      fetchSubcategories(),
      fetchOwners(),
      fetchRealAccounts(),
      fetchRealCards()
    ]);
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
        duplicate_reason: t.duplicate_reason,
        metadata: t.metadata
      })));
    } catch (err) { console.error(err); }
  };

  const fetchRecentImports = async () => {
    if (!supabase) return;
    try {
      const { data: imports } = await supabase.from('imports').select('id, status, created_at, document_id').order('created_at', { ascending: false }).limit(5);
      if (!imports) return;
      const docIds = imports.filter((i: any) => i.document_id).map((i: any) => i.document_id);
      let docs: any[] = [];
      if (docIds.length > 0) {
        const { data } = await supabase.from('documents').select('id, original_name').in('id', docIds);
        docs = data || [];
      }
      setRecentImports(imports.map((imp: any) => ({ ...imp, original_name: docs.find((d: any) => d.id === imp.document_id)?.original_name || 'Arquivo' })));
    } catch (e) { }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !supabase) return;

    // Extrai a logica para uma funcao recursiva para permitir force
    const attemptUpload = async (force: boolean = false) => {
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
          onProgress: setProgressStep,
          force
        });
        await ReconciliationService.pollImportStatus(importId, (imp) => {
          if (imp.status === 'processing') setProgressStep("IA analisando...");
        });
        await fetchData();
        // Clear input se sucesso
        if (fileInputRef.current) fileInputRef.current.value = '';
      } catch (err: any) {
        if (err.message === "ALREADY_PROCESSED") {
          // Trava o retry
          if (window.confirm("Atenção: Este arquivo já foi processado anteriormente!\n\nImportar de novo pode duplicar TODOS os seus lançamentos no banco de dados.\n\nDeseja forçar a importação deste mesmo arquivo?")) {
            await attemptUpload(true);
          }
        } else {
          alert(err.message);
        }
      } finally {
        setIsProcessing(false); setProgressStep(null);
        // Em caso de cancelamento da sobreposiçao
        if (fileInputRef.current && !force) fileInputRef.current.value = '';
      }
    };

    await attemptUpload(false);
  };

  const startEditing = (item: ImportedTransaction, initialCategory?: string) => {
    const isTrans = initialCategory?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('transfer') ||
      item.category?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('transfer');

    setEditingId(item.id);
    setEditForm({
      ...item,
      targetId: selectedTargetId,
      targetName: getTargetName(selectedTargetId),
      owner_name: item.owner_name || 'Pessoal',
      category: initialCategory || item.category || 'Conciliação',
      subcategory: (item as any).subcategory || '',
      counterAccountId: counterAccountId,
      counterAccountName: getCounterpartName(counterAccountId)
    });
  };

  const saveEdit = async (id: string) => {
    try {
      await ReconciliationService.updateTransactionStatus(id, editForm.status, editForm.owner_name);
      setImported(prev => prev.map(t => t.id === id ? { ...t, owner_name: editForm.owner_name, category: editForm.category, subcategory: editForm.subcategory } as any : t));
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
      setSelectedIds(new Set(filteredImported.map(t => t.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const applyBulkEdit = (field: string, value: any) => {
    if (!value) return;
    setImported(prev => prev.map(item =>
      selectedIds.has(item.id) ? { ...item, [field]: value } : item
    ));
  };

  const handleEntityChange = async (val: string, item?: any) => {
    let finalValue = val;
    if (val === 'NEW') {
      const name = window.prompt("Nome da nova Entidade (ex: Empresa, Família, Pessoal):");
      if (!name) return;
      await FinanceService.ensureEntityExists(name);
      await fetchOwners();
      finalValue = name;
    }

    if (item) {
      if (editingId === item.id) {
        setEditForm({ ...editForm, owner_name: finalValue });
      } else {
        setImported(prev => prev.map(tx => tx.id === item.id ? { ...tx, owner_name: finalValue } : tx));
      }
    } else {
      applyBulkEdit('owner_name', finalValue);
    }
  };

  const getTargetName = (id: string) => {
    if (importSource === 'bank') {
      return realAccounts.find(a => a.id === id)?.institution || '';
    }
    return realCards.find(c => c.id === id)?.name || '';
  };

  const handleTargetChange = (name: string, isEdit: boolean, item?: any) => {
    let foundId = '';
    const list = importSource === 'bank' ? realAccounts : realCards;
    const match = list.find(a => (a.institution || a.name) === name);
    if (match) foundId = match.id;

    if (isEdit && item) {
      setEditForm((prev: any) => ({ ...prev, targetName: name, targetId: foundId || prev.targetId }));
    } else {
      setSelectedTargetName(name);
      if (foundId) setSelectedTargetId(foundId);
    }
  };

  const getCounterpartName = (id: string) => {
    if (id === 'NONE') return '- Apenas Registrar -';
    return realAccounts.find(a => a.id === id)?.institution || '';
  };

  const handleCounterpartChange = (name: string, isEdit: boolean, item?: any) => {
    let foundId = '';
    if (name === '- Apenas Registrar -') foundId = 'NONE';
    else {
      foundId = realAccounts.find(a => a.institution === name)?.id || '';
    }

    if (isEdit && item) {
      setEditForm((prev: any) => ({ ...prev, counterAccountName: name, counterAccountId: foundId || prev.counterAccountId }));
    } else {
      setGlobalCounterpartName(name);
      if (foundId) setCounterAccountId(foundId);
    }
  };

  const filteredImported = imported.filter(item => {
    const matchesSearch = item.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDuplicate = showOnlyDuplicates ? item.potential_duplicate : true;
    return matchesSearch && matchesDuplicate;
  });

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
      setBulkCategory(''); setBulkSubcategory(''); setBulkOwner(''); setBulkTarget('');
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

      setBulkCategory(''); setBulkSubcategory(''); setBulkOwner(''); setBulkTarget('');
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

    // If the item was created by AI Labs, use its original destination from metadata.
    // Otherwise fall back to the user's current panel selection (importSource + selectedTargetId).
    const hasOriginalDest = !!item.metadata?.original_account_id;
    const targetId = hasOriginalDest
      ? item.metadata.original_account_id
      : (isEditing ? editForm.targetId : selectedTargetId);
    const effectiveIsCard = hasOriginalDest
      ? item.metadata.target_type === 'card'
      : (item.metadata?.target_type === 'card' || (item.metadata?.target_type !== 'account' && importSource === 'card'));

    const owner = isEditing ? editForm.owner_name : (item.owner_name || 'Pessoal');
    const categoryName = isEditing ? editForm.category : (item.category || 'Conciliação');
    const subcategoryName = isEditing ? editForm.subcategory : (item.subcategory || null);
    const counterId = isEditing ? editForm.counterAccountId : counterAccountId;

    if (!targetId && !isBulk) return alert("Selecione um destino (Banco/Cartão)");
    if (!targetId) return; // Pula em bulk se não tiver destino

    setProcessingItemId(item.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Auto-provisionamento de categoria e entidade
      let finalCategoryId = null;
      if (categoryName) {
        finalCategoryId = await ReconciliationService.ensureCategoryExists(categoryName);
      }
      if (finalCategoryId && subcategoryName) {
        await (ReconciliationService as any).ensureSubcategoryExists(finalCategoryId, subcategoryName);
      }
      if (owner && owner !== 'Pessoal') {
        await FinanceService.ensureEntityExists(owner);
      }

      if (!effectiveIsCard) {
        const acc = realAccounts.find(a => a.id === targetId);
        const isTransfer = categoryName.toLowerCase().includes('transferencia') || categoryName.toLowerCase().includes('transferência');

        // Determine the absolute amount for storage
        const absoluteAmount = Math.abs(Number(item.amount));

        // Define which side is the SOURCE (who sent the money) and DESTINATION (who received it)
        // If the imported item amount is negative (or it's a known expense), this account is the SOURCE.
        const thisSideIsSource = Number(item.amount) < 0;

        // Transação principal (a perna do arquivo/banco atual)
        await supabase.from('transactions').insert({
          user_id: user.id, date: item.date, description: item.description,
          amount: absoluteAmount,
          type: isTransfer ? 'TRANSFER' : (thisSideIsSource ? 'EXPENSE' : 'INCOME'),
          account_id: targetId, account_name: acc?.institution || 'Conta',
          category: categoryName, subcategory: subcategoryName || null,
          owner_name: owner, is_paid: true, paid_at: item.date,
          metadata: {
            category_id: finalCategoryId,
            is_transfer: isTransfer,
            transfer_side: isTransfer ? (thisSideIsSource ? 'SOURCE' : 'DESTINATION') : null,
            counter_account_id: isTransfer ? counterId : null
          }
        });
        await supabase.rpc('recalculate_account_balance', { p_account_id: targetId });

        // Se for transferência e tiver conta de contrapartida, cria a perna espelhada
        if (isTransfer && counterId && counterId !== 'NONE') {
          const counterAcc = realAccounts.find(a => a.id === counterId);
          await supabase.from('transactions').insert({
            user_id: user.id, date: item.date,
            description: `[TRANSF] ${item.description}`,
            amount: absoluteAmount,
            type: 'TRANSFER',
            account_id: counterId,
            account_name: counterAcc?.institution || 'Conta Destino',
            category: categoryName, subcategory: subcategoryName || null,
            owner_name: owner, is_paid: true, paid_at: item.date,
            metadata: {
              category_id: finalCategoryId,
              is_transfer: true,
              transfer_side: thisSideIsSource ? 'DESTINATION' : 'SOURCE', // The opposite of the main leg
              counter_account_id: targetId, // The other side is the main account
              source_transaction_id: item.id
            }
          });
          await supabase.rpc('recalculate_account_balance', { p_account_id: counterId });
        }
      } else {
        let parsedCardAmt = typeof item.amount === 'string'
          ? Number(item.amount.replace(/\./g, '').replace(',', '.'))
          : Number(item.amount);
        if (isNaN(parsedCardAmt)) parsedCardAmt = 0;

        const stmtId = await FinanceService.getOrCreateStatement(targetId, item.date);
        await supabase.from('card_transactions').insert({
          user_id: user.id, card_id: targetId, used_card_id: targetId, statement_id: stmtId,
          date: item.date, description: item.description, amount: Math.abs(parsedCardAmt),
          source: 'IMPORT', status: 'POSTED', owner_name: owner,
          category_id: finalCategoryId,
          metadata: { category_name: categoryName }
        });
      }
      await ReconciliationService.updateTransactionStatus(item.id, 'OK');

      // Refresh lists if new items were likely created (only for single confirm, bulk handles at end via fetchData)
      if (!isBulk) {
        if (categoryName && !categories.includes(categoryName)) fetchCategories();
        if (owner && !owners.includes(owner)) fetchOwners();
      }

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

              <div className="hidden md:block w-64">
                <div className="relative">
                  <Landmark size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input
                    list="targets-list"
                    value={selectedTargetName}
                    onFocus={e => e.target.select()}
                    onChange={e => handleTargetChange(e.target.value, false)}
                    placeholder={importSource === 'bank' ? "Filtrar por Banco..." : "Filtrar por Cartão..."}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-100 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-brand-500/20 transition-all shadow-sm"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto mt-4 sm:mt-0">
              <div className="relative w-full sm:w-64">
                <Tag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                <input
                  type="text"
                  placeholder="Buscar por nome..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-100 rounded-xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all shadow-sm"
                />
              </div>
              <button
                onClick={() => setShowOnlyDuplicates(!showOnlyDuplicates)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border shadow-sm ${showOnlyDuplicates ? 'bg-amber-500 border-amber-500 text-white shadow-amber-200' : 'bg-white border-slate-100 text-slate-400 hover:border-amber-200'}`}
              >
                <AlertCircle size={14} /> {showOnlyDuplicates ? 'Mostrando Duplicados' : 'Filtrar Duplicados'}
              </button>
              <button
                onClick={handleSmartCategorize}
                disabled={isCategorizingAI || imported.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all shadow-sm bg-gradient-to-r from-brand-600 to-indigo-600 text-white border-transparent hover:shadow-[0_0_15px_rgba(79,70,229,0.3)] hover:scale-105 disabled:opacity-50"
              >
                {isCategorizingAI ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} 
                {isCategorizingAI ? 'IA Analisando...' : 'Auto-Categorizar (IA)'}
              </button>
            </div>

            {selectedIds.size > 0 && (
              <div className="sticky top-4 z-[50] mt-4 flex flex-wrap items-center gap-2 p-4 bg-slate-900 rounded-[24px] shadow-2xl animate-in zoom-in duration-300 w-full mb-6">
                <div className="flex items-center gap-2 px-3 border-r border-slate-700 mr-2">
                  <span className="text-[10px] font-black text-brand-400 uppercase tracking-widest">{selectedIds.size}</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Selecionados</span>
                </div>

                <div className="flex flex-wrap items-center gap-2 flex-1">
                  <input
                    list="categories-list"
                    value={bulkCategory}
                    className="bg-slate-800 text-white text-[9px] font-bold uppercase p-2 rounded-lg outline-none focus:ring-1 focus:ring-brand-500 w-full sm:w-auto min-w-[120px] placeholder:text-slate-500"
                    onChange={(e) => {
                      setBulkCategory(e.target.value);
                      applyBulkEdit('category', e.target.value);
                    }}
                    placeholder="Definir Categoria..."
                  />

                  {bulkCategory && (
                    <input
                      list="subcategories-bulk-list"
                      value={bulkSubcategory}
                      className="bg-slate-800 text-white text-[9px] font-bold uppercase p-2 rounded-lg outline-none focus:ring-1 focus:ring-brand-500 w-full sm:w-auto min-w-[120px] placeholder:text-slate-500"
                      onChange={(e) => {
                        setBulkSubcategory(e.target.value);
                        applyBulkEdit('subcategory', e.target.value);
                      }}
                      placeholder="Definir Subcategoria..."
                    />
                  )}

                  <input
                    list="targets-list"
                    value={bulkTarget}
                    className="bg-slate-800 text-white text-[9px] font-bold uppercase p-2 rounded-lg outline-none focus:ring-1 focus:ring-brand-500 w-full sm:w-auto min-w-[120px] placeholder:text-slate-500"
                    onChange={(e) => {
                      setBulkTarget(e.target.value);
                      handleTargetChange(e.target.value, false);
                    }}
                    placeholder="Definir Destino..."
                  />

                  <input
                    list="entities-list"
                    value={bulkOwner}
                    className="bg-slate-800 text-white text-[9px] font-bold uppercase p-2 rounded-lg outline-none focus:ring-1 focus:ring-brand-500 w-full sm:w-auto min-w-[120px] placeholder:text-slate-500"
                    onChange={(e) => {
                      setBulkOwner(e.target.value);
                      const val = e.target.value;
                      if (val === '+ Criar Nova...') handleEntityChange('NEW');
                      else handleEntityChange(val);
                    }}
                    placeholder="Definir Entidade..."
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto ml-auto justify-end mt-2 sm:mt-0">
                  <button
                    onClick={handleBulkConfirm}
                    disabled={isProcessing}
                    className="px-4 py-2 bg-brand-600 text-white text-[9px] font-black uppercase tracking-widest rounded-lg hover:bg-brand-500 transition-colors"
                  >
                    Confirmar Tudo
                  </button>
                  <button
                    onClick={handleBulkIgnore}
                    disabled={isProcessing}
                    className="px-4 py-2 bg-slate-800 text-slate-400 text-[9px] font-bold uppercase tracking-widest rounded-lg hover:bg-rose-600 hover:text-white transition-all"
                  >
                    Ignorar
                  </button>
                </div>
              </div>
            )}
          </div>

          {isLoadingQueue ? (
            <div className="py-40 bg-white rounded-[40px] border border-slate-100 flex flex-col items-center justify-center">
              <Loader2 size={40} className="animate-spin text-slate-200 mb-4" />
              <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Mapeando transações...</p>
            </div>
          ) : filteredImported.length > 0 ? (
            <div className="space-y-4">
              {filteredImported.map(item => {
                const isEditing = editingId === item.id;
                const categoryValue = isEditing ? editForm.category : (item.category || 'Conciliação');
                const isTransfer = categoryValue.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('transfer');
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
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
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
                            <div className="relative">
                              <Landmark size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                              <input
                                list="targets-list"
                                value={isEditing ? editForm.targetName : getTargetName(selectedTargetId)}
                                onFocus={e => e.target.select()}
                                onChange={e => handleTargetChange(e.target.value, isEditing, item)}
                                placeholder={importSource === 'bank' ? "Buscar banco..." : "Buscar cartão..."}
                                className="w-full pl-8 bg-slate-50 border-none rounded-xl text-[10px] font-bold p-2 outline-none focus:ring-1 focus:ring-brand-500"
                              />
                            </div>
                          </div>

                          {/* Col 3: Category */}
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Categoria</p>
                            <div className="relative">
                              <Tag size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                              <input
                                list="categories-list"
                                value={categoryValue}
                                onFocus={e => e.target.select()}
                                onChange={e => {
                                  const val = e.target.value;
                                  if (isEditing) setEditForm({ ...editForm, category: val });
                                  else {
                                    startEditing(item, val);
                                  }
                                }}
                                placeholder="Categoria..."
                                className="w-full pl-8 bg-slate-50 border-none rounded-xl text-[10px] font-bold p-2 outline-none focus:ring-1 focus:ring-brand-500 mb-2"
                              />
                            </div>

                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Subcategoria</p>
                            <div className="relative">
                              <Tag size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                              <input
                                list={`subcategories-list-${item.id}`}
                                value={isEditing ? editForm.subcategory : ((item as any).subcategory || '')}
                                onFocus={e => e.target.select()}
                                onChange={e => {
                                  const val = e.target.value;
                                  if (isEditing) setEditForm({ ...editForm, subcategory: val });
                                  else {
                                    startEditing(item, categoryValue);
                                    setEditForm((prev: any) => ({ ...prev, subcategory: val }));
                                  }
                                }}
                                placeholder="Subcategoria..."
                                className="w-full pl-8 bg-slate-50 border-none rounded-xl text-[10px] font-bold p-2 outline-none focus:ring-1 focus:ring-brand-500"
                              />
                            </div>
                            <datalist id={`subcategories-list-${item.id}`}>
                              {subcategories.filter(s => s.category_name === categoryValue).sort((a, b) => a.name.localeCompare(b.name)).map((s: any) => (
                                <option key={s.id} value={s.name} />
                              ))}
                            </datalist>
                          </div>

                          {/* Col 4: Entity (Owner) */}
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Entidade</p>
                            <div className="relative">
                              <Building2 size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                              <input
                                list="entities-list"
                                value={isEditing ? editForm.owner_name : (item.owner_name || 'Pessoal')}
                                onFocus={e => e.target.select()}
                                onChange={e => {
                                  const val = e.target.value;
                                  if (val === '+ Criar Nova...') handleEntityChange('NEW', item);
                                  else handleEntityChange(val, item);
                                }}
                                placeholder="Entidade..."
                                className="w-full pl-8 bg-slate-50 border-none rounded-xl text-[10px] font-bold p-2 outline-none focus:ring-1 focus:ring-brand-500"
                              />
                            </div>
                          </div>

                          {/* Col 5: Counterparty (Transfer only) */}
                          {isTransfer && (
                            <div className="space-y-1 animate-in zoom-in-95 duration-200">
                              <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest flex items-center gap-1">
                                <RefreshCw size={10} /> Contrapartida
                              </p>
                              <input
                                list="counterparts-list"
                                value={isEditing ? editForm.counterAccountName : getCounterpartName(counterAccountId)}
                                onFocus={e => e.target.select()}
                                onChange={e => {
                                  const val = e.target.value;
                                  if (isEditing) handleCounterpartChange(val, true, item);
                                  else {
                                    startEditing(item);
                                    handleCounterpartChange(val, true, item);
                                  }
                                }}
                                placeholder="Contrapartida..."
                                className="w-full bg-amber-50 border border-amber-100 rounded-xl text-[10px] font-bold p-2 outline-none appearance-none cursor-pointer text-amber-900 focus:ring-1 focus:ring-amber-500"
                              />
                            </div>
                          )}

                          {/* Col 6: Value */}
                          <div className="text-right flex flex-col justify-center">
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
      <datalist id="categories-list">
        {categories.map(c => <option key={c} value={c} />)}
      </datalist>

      <datalist id="targets-list">
        {importSource === 'bank'
          ? realAccounts.map(a => <option key={a.id} value={a.institution} />)
          : realCards.map(c => <option key={c.id} value={c.name} />)}
      </datalist>

      <datalist id="entities-list">
        {owners.map(o => <option key={o} value={o} />)}
        <option value="+ Criar Nova..." />
      </datalist>

      <datalist id="counterparts-list">
        <option value="- Apenas Registrar -" />
        {realAccounts.map(a => <option key={a.id} value={a.institution} />)}
      </datalist>
    </div>
  );
};

export default Reconcile;
