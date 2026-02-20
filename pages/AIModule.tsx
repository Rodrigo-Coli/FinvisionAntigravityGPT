import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, BarChart3, Store, Receipt, Check, Loader2, Tag, ArrowRight, ShoppingCart, Calculator, Hash, TrendingUp, TrendingDown, Search, X, ChevronRight, Plus, Info } from 'lucide-react';
import { AIReconcileService } from '../services/aiReconcile.service';
import { ExtractedReceipt, Profile, ReceiptItem } from '../types';
import { supabase } from './../lib/supabase/client';

interface PriceHistoryItem {
  unit_price: number;
  document_date: string;
  is_promo?: boolean;
  exclude_from_stats?: boolean;
  ai_documents?: {
    merchant_raw?: string;
    ocr_structured?: {
      merchant_category?: string;
    }
  };
}

interface ProductComparison {
  id: string;
  name: string;
  category: string;
  merchantCategory: string;
  avgPrice: number;
  minPrice: number;
  bestMerchant: string;
  lastPrice: number;
  lastMerchant: string;
  trend: 'up' | 'down';
  history: PriceHistoryItem[];
}

interface Account {
  id: string;
  institution: string;
}

interface UserSettings {
  iof_rate?: number;
  spread_rate?: number;
  [key: string]: any;
}

const AIModule: React.FC<{ user: Profile }> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'history' | 'comparative' | 'shopping'>('upload');
  const [isProcessing, setIsProcessing] = useState(false);
  const [receipt, setReceipt] = useState<ExtractedReceipt | null>(null);
  const [reconcileMode, setReconcileMode] = useState<'total' | 'partial' | 'items'>('total');
  const [partialValue, setPartialValue] = useState<number>(0);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'done'>('idle');
  const [selectedAccounts, setSelectedAccounts] = useState<Account[]>([]);
  const [targetAccount, setTargetAccount] = useState('');

  // States para Dados de Inteligência
  const [comparisonData, setComparisonData] = useState<ProductComparison[]>([]);
  const [isLoadingIntelligence, setIsLoadingIntelligence] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [targetSegment, setTargetSegment] = useState<string>('Mercado');
  const [shoppingList, setShoppingList] = useState<ProductComparison[]>([]);

  // States para Conversão de Moeda
  const [exchangeQuote, setExchangeQuote] = useState<number>(1);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [isApplyingTax, setIsApplyingTax] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductComparison | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchAccounts();
    if (activeTab !== 'upload') {
      fetchIntelligenceData();
    }
  }, [activeTab]);

  const fetchAccounts = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('accounts').select('id, institution').eq('user_id', user.id);
    if (data) {
      setSelectedAccounts(data as Account[]);
      if (data.length > 0) setTargetAccount(data[0].id);
    }
  };

  const fetchIntelligenceData = async () => {
    setIsLoadingIntelligence(true);
    try {
      const data = await AIReconcileService.getPriceComparison();

      interface GroupedItems {
        [key: string]: {
          name: string;
          category: string;
          allPrices: PriceHistoryItem[];
        }
      }

      const groupedByName = data.reduce((acc: GroupedItems, prod: any) => {
        const normalizedName = prod.name.toUpperCase().trim();
        if (!acc[normalizedName]) {
          acc[normalizedName] = {
            name: prod.name,
            category: prod.category || 'Geral',
            allPrices: []
          };
        }
        const prices = prod.product_prices || [];
        acc[normalizedName].allPrices.push(...prices);
        return acc;
      }, {});

      const processed = Object.values(groupedByName).map((group): ProductComparison | null => {
        const prices = group.allPrices || [];
        if (prices.length === 0) return null;

        const validPrices = prices.filter((p) => !p.exclude_from_stats);
        if (validPrices.length === 0) return null;

        const avgPrice = validPrices.reduce((sum: number, p) => sum + p.unit_price, 0) / (validPrices.length || 1);
        const minPriceObj = validPrices.reduce((min, p) => p.unit_price < min.unit_price ? p : min, validPrices[0]);

        const sortedHistory = [...validPrices].sort((a, b) =>
          new Date(a.document_date).getTime() - new Date(b.document_date).getTime()
        );
        const lastPrice = sortedHistory[sortedHistory.length - 1];

        return {
          id: group.name,
          name: group.name,
          category: group.category,
          merchantCategory: minPriceObj.ai_documents?.ocr_structured?.merchant_category || 'Mercado',
          avgPrice,
          minPrice: minPriceObj.unit_price,
          bestMerchant: minPriceObj.ai_documents?.merchant_raw || 'N/A',
          lastPrice: lastPrice.unit_price,
          lastMerchant: lastPrice.ai_documents?.merchant_raw || 'N/A',
          trend: lastPrice.unit_price > avgPrice ? 'up' : 'down',
          history: sortedHistory
        };
      }).filter((p): p is ProductComparison => p !== null);

      setComparisonData(processed);
    } catch (err) {
      console.error('Erro ao carregar inteligência:', err);
    } finally {
      setIsLoadingIntelligence(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    setReceipt(null);

    try {
      const data = await AIReconcileService.processReceiptItems(Array.from(files));
      if (data.items) {
        data.items = data.items.map((it: ReceiptItem) => ({ ...it, selected: true }));
      }
      setReceipt(data);
      setPartialValue(data.total);

      setExchangeQuote(data.currency === 'USD' ? 5.20 : data.currency === 'EUR' ? 5.60 : 1);

      if (!userSettings && supabase) {
        const { data: settings } = await supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle();
        setUserSettings(settings || { iof_rate: 6.38, spread_rate: 4.00 });
      }

      if (data.currency && data.currency !== 'BRL') {
        setIsApplyingTax(true);
      } else {
        setIsApplyingTax(false);
      }
    } catch (err: any) {
      alert(err.message || 'Erro ao processar cupons.');
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleItemSelection = (index: number) => {
    if (!receipt) return;
    const newItems = [...receipt.items];
    newItems[index].selected = !newItems[index].selected;

    const newTotal = newItems.filter(i => i.selected).reduce((sum, i) => sum + i.total_price, 0);
    setReceipt({ ...receipt, items: newItems });
    if (reconcileMode === 'items') setPartialValue(newTotal);
  };

  const getReconcileAmount = () => {
    if (!receipt) return 0;
    let baseAmount = 0;
    if (reconcileMode === 'total') baseAmount = receipt.total;
    else if (reconcileMode === 'partial') baseAmount = partialValue;
    else baseAmount = receipt.items.filter((it: ReceiptItem) => it.selected).reduce((sum: number, it: ReceiptItem) => sum + it.total_price, 0);

    if (isApplyingTax && receipt.currency && receipt.currency !== 'BRL') {
      const iof = userSettings?.iof_rate || 6.38;
      const spread = userSettings?.spread_rate || 4.00;
      return (baseAmount * exchangeQuote * (1 + spread / 100)) * (1 + iof / 100);
    }
    return baseAmount;
  };

  const handleFinalize = async () => {
    if (!receipt || !targetAccount) {
      alert("Por favor, selecione uma conta de origem.");
      return;
    }
    setSaveStatus('saving');

    try {
      await AIReconcileService.saveReceiptToLabs(receipt);

      const finalAmount = getReconcileAmount();
      const accountName = selectedAccounts.find((a: Account) => a.id === targetAccount)?.institution || 'Conta';

      await AIReconcileService.saveToReconcileQueue([{
        date: receipt.date,
        description: `Labs: ${receipt.merchant} (${reconcileMode}) ${receipt.currency !== 'BRL' ? '[' + receipt.currency + ']' : ''}`,
        amount: finalAmount,
        type: 'debit',
        source: 'AI Labs',
        confidence: 1
      }], targetAccount, accountName);

      setSaveStatus('done');
      setTimeout(() => {
        setReceipt(null);
        setSaveStatus('idle');
      }, 2000);
    } catch (err: any) {
      console.error('Erro ao finalizar:', err);
      alert(err.message || 'Erro ao processar.');
      setSaveStatus('idle');
    }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <div className="max-w-6xl mx-auto py-10 sm:py-16 px-6 sm:px-8 space-y-12 animate-in fade-in duration-700">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-8">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="px-3 py-1 bg-brand-50 text-brand-600 rounded-full text-[9px] font-black uppercase tracking-wider border border-brand-100/50 flex items-center gap-2">
              <Sparkles size={10} className="animate-pulse" />
              AI Studio
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">AI Labs</h1>
          </div>
          <p className="text-slate-500 font-medium text-lg max-w-xl leading-relaxed">Sua inteligência de compras. Escaneie notas e otimize seu fluxo financeiro.</p>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-8 border-b border-slate-100 overflow-x-auto scrollbar-hide">
        {[
          { id: 'upload', label: 'Scanner', icon: <Receipt size={14} /> },
          { id: 'comparative', label: 'Comparador', icon: <Store size={14} /> },
          { id: 'shopping', label: 'Lista', icon: <ShoppingCart size={14} /> },
          { id: 'history', label: 'Análise', icon: <BarChart3 size={14} /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`pb-4 px-1 text-[10px] font-bold transition-all border-b-2 flex items-center gap-2 whitespace-nowrap uppercase tracking-widest ${activeTab === tab.id
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-400 hover:text-slate-900'}`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div className="pt-2">
        {activeTab === 'upload' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-8 space-y-8">
              {!receipt ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`bg-white border-2 border-dashed rounded-[32px] p-12 sm:p-20 flex flex-col items-center justify-center transition-all min-h-[400px] cursor-pointer group ${isProcessing ? 'border-brand-400 bg-brand-50/10' : 'border-slate-100 hover:border-brand-200 hover:bg-slate-50/50'}`}
                >
                  <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,application/pdf" multiple />

                  {isProcessing ? (
                    <div className="text-center space-y-6">
                      <div className="relative inline-block">
                        <Loader2 className="animate-spin text-brand-600" size={48} />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-xl font-bold text-slate-900">Processando...</h3>
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">Análise via GenAI v2</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center space-y-8">
                      <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mx-auto border border-slate-100 group-hover:scale-105 transition-transform duration-500">
                        <Receipt size={32} />
                      </div>
                      <div className="space-y-3">
                        <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Escanear Comprovante</h3>
                        <p className="text-slate-500 font-medium max-w-xs mx-auto text-base">Arraste seus comprovantes ou clique aqui para processar.</p>
                      </div>
                      <button className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-brand-600 transition-all shadow-lg active:scale-95">Selecionar Arquivos</button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden animate-in slide-in-from-bottom-2 duration-500">
                  <div className="p-8 sm:p-10 border-b border-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 bg-slate-50/30">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Store size={18} className="text-slate-900" />
                        <h2 className="text-xl font-bold text-slate-900 uppercase tracking-tight">{receipt.merchant}</h2>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        <span className="bg-white px-2 py-1 rounded border border-slate-100">{new Date(receipt.date).toLocaleDateString('pt-BR')}</span>
                        <span className="bg-white px-2 py-1 rounded border border-slate-100">{receipt.currency || 'BRL'}</span>
                      </div>
                    </div>
                    <div className="text-left sm:text-right bg-white p-4 rounded-2xl border border-slate-100">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Consolidado</p>
                      <p className="text-2xl font-black text-slate-900 tracking-tighter">
                        {receipt.currency === 'BRL' || !receipt.currency ? formatCurrency(receipt.total) : `${receipt.currency} ${receipt.total.toFixed(2)}`}
                      </p>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-50 px-4">
                    {receipt.items.map((item: ReceiptItem, idx: number) => (
                      <div
                        key={idx}
                        onClick={() => toggleItemSelection(idx)}
                        className={`group p-6 flex items-center justify-between transition-all cursor-pointer rounded-2xl my-1 ${item.selected ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 opacity-40'}`}
                      >
                        <div className="flex items-center gap-6">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${item.selected ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-100 text-slate-300'}`}>
                            {item.selected ? <Check size={16} strokeWidth={3} /> : <Tag size={16} />}
                          </div>
                          <div className="space-y-1">
                            <h4 className="font-bold text-slate-900 text-base uppercase tracking-tight">{item.description}</h4>
                            <div className="flex items-center gap-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                              <span>{item.quantity} {item.unit || 'UN'}</span>
                              <div className="w-1 h-1 bg-slate-100 rounded-full" />
                              <span>{item.currency === 'BRL' || !item.currency ? formatCurrency(item.unit_price) : `${item.currency} ${item.unit_price.toFixed(2)}`}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right space-y-2">
                          <p className="text-lg font-bold text-slate-900 tracking-tight">
                            {item.currency === 'BRL' || !item.currency ? formatCurrency(item.total_price) : `${item.currency} ${item.total_price.toFixed(2)}`}
                          </p>
                          {item.category_hint && (
                            <span className="inline-block text-[8px] bg-brand-50 text-brand-600 px-2 py-0.5 rounded font-bold uppercase tracking-widest border border-brand-100/50">
                              {item.category_hint}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-4 lg:sticky lg:top-8 space-y-8">
              {receipt && (
                <div className="bg-slate-900 rounded-[32px] p-8 text-white shadow-xl animate-in fade-in zoom-in-95 duration-500 overflow-hidden relative group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/10 blur-[60px] rounded-full pointer-events-none" />

                  <div className="relative z-10 space-y-8">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-white/10 text-brand-400 rounded-xl flex items-center justify-center border border-white/5 backdrop-blur-md">
                        <Sparkles size={20} />
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[9px] font-bold text-brand-400 uppercase tracking-widest">Finalizar Ciclo</p>
                        <h3 className="text-lg font-bold tracking-tight uppercase">AI Finalizer</h3>
                      </div>
                    </div>

                    <div className="space-y-8">
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { id: 'total', label: 'Total', icon: <Hash size={14} /> },
                          { id: 'partial', label: 'Valor', icon: <ArrowRight size={14} /> },
                          { id: 'items', label: 'Itens', icon: <ShoppingCart size={14} /> },
                        ].map(mode => (
                          <button
                            key={mode.id}
                            onClick={() => setReconcileMode(mode.id as any)}
                            className={`p-4 rounded-xl border transition-all flex flex-col items-center gap-2 active:scale-95 ${reconcileMode === mode.id
                              ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                              : 'border-white/5 bg-white/5 text-white/40 hover:text-white'}`}
                          >
                            {mode.icon}
                            <span className="text-[9px] font-bold uppercase tracking-widest">{mode.label}</span>
                          </button>
                        ))}
                      </div>

                      {reconcileMode === 'partial' && (
                        <div className="p-5 bg-white/5 rounded-2xl border border-white/5 space-y-2">
                          <label className="text-[9px] font-bold text-white/40 uppercase tracking-widest block">Ajuste Manual ({receipt.currency || 'BRL'})</label>
                          <input
                            type="number"
                            value={partialValue}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPartialValue(Number(e.target.value))}
                            className="bg-transparent w-full text-3xl font-bold text-white focus:outline-none tracking-tighter"
                          />
                        </div>
                      )}

                      {receipt.currency && receipt.currency !== 'BRL' && (
                        <div className="p-6 bg-amber-500/5 rounded-2xl border border-amber-500/10 space-y-6">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-amber-500/80 uppercase tracking-widest">Câmbio: {receipt.currency}</span>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input type="checkbox" checked={isApplyingTax} onChange={(e) => setIsApplyingTax(e.target.checked)} className="sr-only peer" />
                              <div className="w-9 h-5 bg-white/10 rounded-full peer peer-checked:bg-amber-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
                            </label>
                          </div>
                          {isApplyingTax && (
                            <div className="space-y-4">
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-amber-500/40">R$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={exchangeQuote}
                                  onChange={(e) => setExchangeQuote(parseFloat(e.target.value))}
                                  className="w-full bg-white/5 border border-amber-500/20 rounded-xl pl-8 pr-4 py-3 text-xs font-bold text-white outline-none focus:ring-1 focus:ring-amber-500"
                                />
                              </div>
                              <div className="flex items-start gap-2 p-3 bg-amber-500/5 rounded-xl border border-amber-500/10">
                                <Info size={12} className="text-amber-500 shrink-0 mt-0.5" />
                                <span className="text-[8px] font-bold text-amber-500/60 uppercase leading-normal tracking-wider">IOF + Spread inclusos nas configurações.</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="p-6 bg-white text-slate-900 rounded-2xl shadow-xl flex justify-between items-center">
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Valor em BRL</p>
                          <p className="text-3xl font-black tracking-tighter leading-none">{formatCurrency(getReconcileAmount())}</p>
                        </div>
                        <Calculator size={20} className="text-slate-200" />
                      </div>

                      <div className="space-y-3">
                        <label className="text-[9px] font-bold text-white/40 uppercase tracking-widest block ml-1">Débito em Conta</label>
                        <div className="relative">
                          <select
                            value={targetAccount}
                            onChange={(e) => setTargetAccount(e.target.value)}
                            className="w-full h-14 bg-white/5 border border-white/5 rounded-xl px-4 font-bold text-white text-xs focus:ring-1 focus:ring-brand-500 appearance-none transition-all"
                          >
                            <option value="" className="bg-slate-900">Selecione...</option>
                            {selectedAccounts.map((acc: Account) => (
                              <option key={acc.id} value={acc.id} className="bg-slate-900">{acc.institution}</option>
                            ))}
                          </select>
                          <ChevronRight size={14} className="absolute right-4 top-1/2 -translate-y-1/2 rotate-90 text-white/20 pointer-events-none" />
                        </div>
                      </div>

                      <button
                        onClick={handleFinalize}
                        disabled={saveStatus !== 'idle'}
                        className={`w-full h-16 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-3 shadow-lg ${saveStatus === 'done'
                          ? 'bg-emerald-500 text-white'
                          : 'bg-brand-600 text-white hover:bg-brand-500'}`}
                      >
                        {saveStatus === 'saving' ? <Loader2 className="animate-spin" size={16} /> : saveStatus === 'done' ? <Check size={16} strokeWidth={3} /> : <Sparkles size={16} />}
                        {saveStatus === 'saving' ? 'PROCESSANDO...' : saveStatus === 'done' ? 'SUCESSO!' : 'FINALIZAR'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'comparative' && (
          <div className="space-y-12 animate-in fade-in duration-700">
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-6 items-center">
              <div className="relative flex-grow w-full">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                <input
                  type="text"
                  placeholder="Pesquisar produto..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-14 bg-slate-50 border-none rounded-2xl pl-14 pr-6 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-100 transition-all placeholder:text-slate-300 text-base uppercase tracking-tight"
                />
              </div>
              <div className="flex gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-100 shrink-0">
                {['Mercado', 'Loja'].map(seg => (
                  <button
                    key={seg}
                    onClick={() => setTargetSegment(seg)}
                    className={`px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${targetSegment === seg ? 'bg-white text-slate-900 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    {seg}
                  </button>
                ))}
              </div>
              <button
                onClick={fetchIntelligenceData}
                className={`w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center hover:bg-brand-600 transition-all shrink-0 shadow-lg active:scale-90 ${isLoadingIntelligence ? 'animate-spin' : ''}`}
              >
                <Sparkles size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {isLoadingIntelligence ? (
                Array(6).fill(0).map((_, i) => (
                  <div key={i} className="h-80 bg-slate-100 rounded-3xl animate-pulse"></div>
                ))
              ) : (
                comparisonData
                  .filter((p) => !targetSegment || p.merchantCategory === targetSegment)
                  .filter((p) => !searchTerm || p.name.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map((product) => (
                    <div
                      key={product.id}
                      onClick={() => setSelectedProduct(product)}
                      className="bg-white rounded-[32px] border border-slate-100 p-8 shadow-sm hover:shadow-md hover:border-slate-200 transition-all group relative cursor-pointer active:scale-95 flex flex-col justify-between min-h-[320px]"
                    >
                      <div className="space-y-6 relative z-10">
                        <div className="flex justify-between items-start">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-sm ${product.trend === 'down' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                            {product.trend === 'down' ? <TrendingDown size={24} /> : <TrendingUp size={24} />}
                          </div>
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">{product.category}</span>
                        </div>

                        <div className="space-y-1">
                          <h3 className="text-xl font-bold text-slate-900 group-hover:text-brand-600 transition-colors uppercase tracking-tight leading-tight">{product.name}</h3>
                          <p className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">RANK #{(comparisonData.indexOf(product) + 1).toString().padStart(2, '0')}</p>
                        </div>
                      </div>

                      <div className="space-y-6 relative z-10 border-t border-slate-50 pt-6">
                        <div className="flex justify-between items-end">
                          <div className="space-y-1">
                            <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest block">Best Merchant</span>
                            <span className="text-xs font-bold text-slate-900 uppercase tracking-tight truncate max-w-[120px] block">{product.bestMerchant}</span>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-black text-emerald-600 tracking-tighter leading-none">{formatCurrency(product.minPrice)}</p>
                          </div>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!shoppingList.find(i => i.id === product.id)) setShoppingList([...shoppingList, product]);
                          }}
                          className={`w-full py-4 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${shoppingList.find(i => i.id === product.id)
                            ? 'bg-emerald-50 text-emerald-600'
                            : 'bg-slate-900 text-white shadow-lg'}`}
                        >
                          {shoppingList.find(i => i.id === product.id) ? <><Check size={14} strokeWidth={3} /> Na Lista</> : <><ShoppingCart size={14} /> Adicionar</>}
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'shopping' && (
          <div className="animate-in fade-in duration-700">
            <div className="bg-slate-900 rounded-[32px] p-10 sm:p-14 text-white relative overflow-hidden border border-slate-800 shadow-xl">
              <div className="relative z-10 flex flex-col xl:flex-row justify-between gap-12">
                <div className="max-w-md space-y-8">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-brand-400 border border-white/5">
                        <ShoppingCart size={24} />
                      </div>
                      <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[9px] font-bold uppercase tracking-widest text-white/40">Market Roteiro</span>
                    </div>
                    <h2 className="text-4xl font-bold tracking-tight leading-tight">Lista de Otimização</h2>
                    <p className="text-slate-400 font-medium text-lg leading-relaxed">Itens mapeados para <span className="text-white font-bold">{targetSegment}</span>.</p>
                  </div>

                  {shoppingList.length > 0 && (
                    <div className="flex items-center gap-6">
                      <button onClick={() => setShoppingList([])} className="px-6 py-3 bg-white/5 hover:bg-rose-500/10 hover:text-rose-400 border border-white/5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all">Limpar</button>
                      <button className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-brand-400">Exportar <ArrowRight size={14} /></button>
                    </div>
                  )}
                </div>

                <div className="flex-grow">
                  {shoppingList.length === 0 ? (
                    <div className="py-20 text-center border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center space-y-6 hover:border-white/20 transition-all cursor-pointer" onClick={() => setActiveTab('comparative')}>
                      <Plus size={32} className="text-white/20" />
                      <div className="space-y-1">
                        <p className="font-bold text-slate-500 uppercase tracking-widest text-[10px]">Lista Vazia</p>
                        <p className="text-white/20 text-sm">Adicione itens do comparador.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {Array.from(new Set(shoppingList.map(i => i.bestMerchant))).map(merchant => (
                        <div key={merchant} className="bg-white/5 border border-white/5 rounded-3xl p-8 space-y-6">
                          <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                            <Store size={16} className="text-brand-400" />
                            <h3 className="font-bold uppercase text-[10px] tracking-widest truncate text-white">{merchant}</h3>
                          </div>
                          <div className="space-y-4">
                            {shoppingList.filter(i => i.bestMerchant === merchant).map(item => (
                              <div key={item.id} className="flex justify-between items-center group/item transition-transform">
                                <span className="text-slate-400 truncate max-w-[150px] font-bold uppercase text-[9px] tracking-tight group-hover/item:text-white transition-colors">{item.name}</span>
                                <span className="font-bold text-white text-base tracking-tight">{formatCurrency(item.minPrice)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="pt-4 border-t border-white/10 flex justify-between items-center text-brand-400">
                            <span className="text-[9px] font-bold uppercase tracking-widest">Subtotal</span>
                            <span className="text-xl font-black tracking-tighter">{formatCurrency(shoppingList.filter(i => i.bestMerchant === merchant).reduce((s, i) => s + i.minPrice, 0))}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-12 animate-in fade-in duration-700">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-slate-900 rounded-[32px] p-10 sm:p-14 text-white relative overflow-hidden border border-slate-800 shadow-xl">
                <div className="relative z-10 space-y-8 w-full">
                  <div className="flex items-center gap-6">
                    <div className="p-4 bg-brand-500/10 rounded-2xl border border-white/5 flex items-center justify-center">
                      <BarChart3 size={24} className="text-brand-400" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Analytics Engine</h3>
                      <h2 className="text-3xl font-bold tracking-tight leading-tight">Painel de Inflação</h2>
                    </div>
                  </div>
                  <p className="text-slate-400 max-w-sm font-medium text-lg leading-relaxed">Mapeamento granular da variação de preços nos itens do seu cotidiano.</p>
                  <div className="pt-8 border-t border-white/5 flex gap-12">
                    <div>
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Itens Mapeados</p>
                      <p className="text-3xl font-black tracking-tighter">{comparisonData.length}</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-[32px] border border-slate-100 p-10 shadow-sm flex flex-col justify-center items-center text-center space-y-6">
                <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-900 border border-slate-100 shadow-sm">
                  <BarChart3 size={32} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-slate-900 tracking-tight">Estatísticas</h3>
                  <p className="text-slate-500 font-medium text-sm">Dados consolidados em tempo real.</p>
                </div>
                <button onClick={fetchIntelligenceData} className="px-8 py-3 bg-slate-50 text-slate-900 rounded-xl font-bold text-[10px] uppercase tracking-widest border border-slate-100 shadow-sm hover:bg-slate-100 transition-all">Sincronizar</button>
              </div>
            </div>

            <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
                <h3 className="font-bold text-slate-900 uppercase tracking-widest text-[10px]">Variabilidade Recente</h3>
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest bg-white px-3 py-1.5 rounded-lg border border-slate-100">Top 10 Itens</span>
              </div>
              <div className="divide-y divide-slate-50">
                {comparisonData.slice(0, 10).map((product, idx) => (
                  <div key={idx} className="p-8 flex items-center justify-between hover:bg-slate-50 transition-all cursor-pointer" onClick={() => setSelectedProduct(product)}>
                    <div className="flex items-center gap-6">
                      <div className="text-4xl font-black text-slate-100 tracking-tighter w-12">{(idx + 1).toString().padStart(2, '0')}</div>
                      <div className="space-y-1">
                        <h4 className="font-bold text-slate-900 uppercase text-lg tracking-tight leading-none">{product.name}</h4>
                        <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">{product.category} • {product.bestMerchant}</p>
                      </div>
                    </div>
                    <div className="text-right space-y-1">
                      <div className={`flex items-center justify-end gap-1.5 text-xl font-black tracking-tighter ${product.trend === 'up' ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {product.trend === 'up' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                        {Math.round(Math.abs((product.lastPrice - product.avgPrice) / product.avgPrice) * 100)}%
                      </div>
                      <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest block">Variação Média</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal Detalhes */}
      {selectedProduct && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md animate-in fade-in" onClick={() => setSelectedProduct(null)}></div>
          <div className="relative bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95">
            <div className="p-8 sm:p-12 border-b border-slate-50 flex justify-between items-start gap-8 bg-slate-50/30">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-brand-500 rounded-full" />
                  <span className="text-[9px] font-bold text-brand-600 uppercase tracking-widest">Inteligência de Ativo</span>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight uppercase leading-none">{selectedProduct.name}</h2>
                <span className="inline-block px-3 py-1 bg-white text-slate-400 rounded-lg text-[9px] font-bold uppercase tracking-widest border border-slate-100">{selectedProduct.category}</span>
              </div>
              <button onClick={() => setSelectedProduct(null)} className="w-10 h-10 bg-white text-slate-400 hover:text-slate-900 rounded-xl flex items-center justify-center transition-all border border-slate-100 shadow-sm"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 sm:p-12 space-y-12 scrollbar-hide">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="bg-emerald-500 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden group">
                  <p className="text-[9px] font-bold text-white/60 uppercase tracking-widest mb-1">Cotação Mínima</p>
                  <p className="text-3xl font-black tracking-tighter leading-none">{formatCurrency(selectedProduct.minPrice)}</p>
                  <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
                    <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest">{selectedProduct.bestMerchant}</span>
                    <TrendingDown size={16} className="text-white/40" />
                  </div>
                </div>
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
                  <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest mb-1">Média Móvel</p>
                  <p className="text-3xl font-black text-slate-900 tracking-tighter leading-none">{formatCurrency(selectedProduct.avgPrice)}</p>
                  <div className="mt-4 pt-4 border-t border-slate-200/50 flex items-center justify-between text-[8px] font-bold text-slate-300 uppercase tracking-widest">
                    <span>{selectedProduct.history.length} Amostras</span>
                    <BarChart3 size={16} className="text-slate-200" />
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <h4 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-4">Histórico de Auditoria</h4>
                <div className="space-y-3">
                  {selectedProduct.history.map((price, i) => (
                    <div key={i} className="flex justify-between items-center p-5 bg-white border border-slate-100 rounded-2xl hover:border-brand-100 transition-all group">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300 group-hover:bg-slate-900 group-hover:text-white transition-all shadow-sm">
                          <Store size={18} />
                        </div>
                        <div className="space-y-1">
                          <p className="font-bold text-slate-900 text-sm uppercase tracking-tight truncate max-w-[150px]">{price.ai_documents?.merchant_raw || 'Merchant'}</p>
                          <p className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">{new Date(price.document_date).toLocaleDateString('pt-BR')}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-900 text-xl tracking-tight leading-none">{formatCurrency(price.unit_price)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-8 sm:p-12 bg-slate-900 border-t border-white/5">
              <button
                onClick={() => {
                  if (selectedProduct && !shoppingList.find(i => i.id === selectedProduct.id)) setShoppingList([...shoppingList, selectedProduct]);
                  setSelectedProduct(null);
                }}
                className="w-full h-16 bg-brand-600 text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-brand-500 transition-all flex items-center justify-center gap-3 active:scale-95 shadow-xl"
              >
                <ShoppingCart size={18} /> Adicionar à Lista
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIModule;
