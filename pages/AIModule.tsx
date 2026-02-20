import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, BarChart3, Store, Receipt, Check, Loader2, Tag, ArrowRight, ShoppingCart, Calculator, Hash, TrendingUp, TrendingDown, Search, X, ChevronRight, Plus } from 'lucide-react';
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
    <div className="max-w-7xl mx-auto py-12 sm:py-24 px-6 sm:px-10 space-y-16 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-10">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-5">
            <div className="px-5 py-2 bg-brand-50 text-brand-600 rounded-full text-[11px] font-black uppercase tracking-[0.2em] border border-brand-100/50 shadow-sm flex items-center gap-2">
              <Sparkles size={12} className="animate-pulse" />
              Inteligência Artificial
            </div>
            <h1 className="text-5xl sm:text-7xl font-black text-slate-900 tracking-tighter leading-none">AI <span className="text-slate-200">/</span> Labs</h1>
          </div>
          <p className="text-slate-500 font-medium text-xl leading-relaxed max-w-2xl">Sua central de economia inteligente. Escaneie, analise e descubra onde seu dinheiro rende mais.</p>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-12 border-b border-slate-100 overflow-x-auto scrollbar-hide pb-1">
        {[
          { id: 'upload', label: 'Scanner', icon: <Receipt size={16} /> },
          { id: 'comparative', label: 'Comparador', icon: <Store size={16} /> },
          { id: 'shopping', label: 'Lista', icon: <ShoppingCart size={16} /> },
          { id: 'history', label: 'Inflação', icon: <BarChart3 size={16} /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`pb-5 px-1 text-[11px] font-black transition-all border-b-2 flex items-center gap-3 whitespace-nowrap uppercase tracking-[0.2em] ${activeTab === tab.id
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-400 hover:text-slate-900 hover:translate-y-[-1px]'}`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div className="pt-2">
        {activeTab === 'upload' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 xl:gap-16 items-start">
            <div className="lg:col-span-8 space-y-12">
              {!receipt ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`bg-white border-[3px] border-dashed rounded-[64px] p-20 flex flex-col items-center justify-center transition-all min-h-[500px] cursor-pointer group relative overflow-hidden ${isProcessing ? 'border-brand-400 bg-brand-50/10' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50/50'}`}
                >
                  <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,application/pdf" multiple />
                  <div className="absolute inset-0 bg-gradient-to-tr from-brand-50/0 via-brand-50/0 to-brand-50/30 opacity-0 group-hover:opacity-100 transition-opacity" />

                  {isProcessing ? (
                    <div className="text-center space-y-10 relative z-10">
                      <div className="relative">
                        <div className="w-24 h-24 border-[6px] border-slate-100 border-t-brand-600 rounded-full animate-spin mx-auto shadow-2xl shadow-brand-500/10" />
                        <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-brand-600" size={28} />
                      </div>
                      <div className="space-y-3">
                        <h3 className="text-3xl font-black text-slate-900 tracking-tighter">Sincronizando Metadados...</h3>
                        <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[10px]">A IA está processando as notas fiscais</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center space-y-12 relative z-10">
                      <div className="w-32 h-32 bg-slate-50 rounded-[40px] flex items-center justify-center text-slate-200 mx-auto border border-slate-100 shadow-sm group-hover:scale-110 group-hover:bg-white group-hover:text-slate-900 transition-all duration-500">
                        <Receipt size={56} />
                      </div>
                      <div className="space-y-6">
                        <h3 className="text-4xl font-black text-slate-900 tracking-tighter">O que vamos mapear hoje?</h3>
                        <p className="text-slate-500 font-medium max-w-sm mx-auto text-xl leading-relaxed">Arraste seus comprovantes ou clique para iniciar o escaneamento inteligente.</p>
                      </div>
                      <div className="flex items-center justify-center gap-6">
                        <div className="h-px w-12 bg-slate-100" />
                        <button className="px-12 py-6 bg-slate-900 text-white rounded-[24px] font-black text-[11px] uppercase tracking-[0.3em] hover:bg-brand-600 transition-all shadow-2xl shadow-black/10 active:scale-95">Selecionar Arquivos</button>
                        <div className="h-px w-12 bg-slate-100" />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-[56px] border border-slate-100 shadow-premium overflow-hidden animate-in slide-in-from-bottom-5 duration-1000">
                  <div className="p-12 sm:p-16 border-b border-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-10 bg-gradient-to-br from-white to-slate-50/30">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-lg">
                          <Store size={18} />
                        </div>
                        <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tighter uppercase">{receipt.merchant}</h2>
                      </div>
                      <div className="flex items-center gap-4 text-slate-400 font-black text-[10px] uppercase tracking-[0.2em]">
                        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-100 shadow-sm">
                          <span className="text-[10px] uppercase tracking-widest">{new Date(receipt.date).toLocaleDateString('pt-BR')}</span>
                        </div>
                        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-100 shadow-sm">
                          <span className="text-[10px] uppercase tracking-widest">{receipt.currency || 'BRL'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-left sm:text-right bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2 leading-none">Total Consolidado</p>
                      <p className="text-4xl font-black text-slate-900 tracking-tighter leading-none">
                        {receipt.currency === 'BRL' || !receipt.currency ? formatCurrency(receipt.total) : `${receipt.currency} ${receipt.total.toFixed(2)}`}
                      </p>
                    </div>
                  </div>

                  <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-100 scrollbar-hide py-4 px-6">
                    {receipt.items.map((item: ReceiptItem, idx: number) => (
                      <div
                        key={idx}
                        onClick={() => toggleItemSelection(idx)}
                        className={`group relative p-8 flex items-center justify-between transition-all cursor-pointer rounded-[32px] mb-2 ${item.selected ? 'bg-white hover:bg-slate-50/50' : 'bg-slate-50/30 opacity-40 hover:opacity-60'}`}
                      >
                        <div className="flex items-center gap-10">
                          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 ${item.selected ? 'bg-slate-900 text-white shadow-xl shadow-black/10 scale-110' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'}`}>
                            {item.selected ? <Check size={22} strokeWidth={3} /> : <Tag size={22} />}
                          </div>
                          <div className="space-y-2">
                            <h4 className="font-black text-slate-900 text-xl sm:text-2xl leading-none tracking-tighter uppercase">{item.description}</h4>
                            <div className="flex items-center gap-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                              <span className="bg-slate-50 px-2 py-1 rounded-md">{item.quantity} {item.unit || 'UN'}</span>
                              <div className="w-1 h-1 bg-slate-200 rounded-full" />
                              <span>{item.currency === 'BRL' || !item.currency ? formatCurrency(item.unit_price) : `${item.currency} ${item.unit_price.toFixed(2)}`}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right space-y-3">
                          <p className="text-2xl font-black text-slate-900 tracking-tighter">
                            {item.currency === 'BRL' || !item.currency ? formatCurrency(item.total_price) : `${item.currency} ${item.total_price.toFixed(2)}`}
                          </p>
                          {item.category_hint && (
                            <span className="inline-block text-[9px] bg-brand-50 text-brand-600 px-3 py-1.5 rounded-lg font-black uppercase tracking-[0.1em] border border-brand-100/50 shadow-sm transition-all group-hover:bg-brand-600 group-hover:text-white group-hover:border-brand-600">
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

            <div className="lg:col-span-4 lg:sticky lg:top-28 space-y-12">
              {receipt && (
                <div className="bg-slate-900 rounded-[56px] p-10 sm:p-14 text-white shadow-premium-dark animate-in fade-in zoom-in-95 duration-700 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/10 blur-[100px] -mr-32 -mt-32 rounded-full group-hover:bg-brand-500/20 transition-all duration-1000" />

                  <div className="relative z-10 space-y-12">
                    <div className="flex items-center gap-5">
                      <div className="w-14 h-14 bg-white/10 text-brand-400 rounded-3xl flex items-center justify-center border border-white/10 backdrop-blur-md shadow-2xl">
                        <Sparkles size={28} />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-brand-400 uppercase tracking-[0.3em]">AI Engine</p>
                        <h3 className="text-2xl font-black tracking-tighter uppercase">Finalizar</h3>
                      </div>
                    </div>

                    <div className="space-y-10">
                      <div className="grid grid-cols-3 gap-4">
                        {[
                          { id: 'total', label: 'Total', icon: <Hash size={18} /> },
                          { id: 'partial', label: 'Parcial', icon: <ArrowRight size={18} /> },
                          { id: 'items', label: 'Itens', icon: <ShoppingCart size={18} /> },
                        ].map(mode => (
                          <button
                            key={mode.id}
                            onClick={() => setReconcileMode(mode.id as any)}
                            className={`p-5 rounded-[24px] border transition-all flex flex-col items-center gap-3 active:scale-95 ${reconcileMode === mode.id
                              ? 'border-brand-500 bg-brand-500/20 text-brand-400 shadow-2xl shadow-brand-500/20'
                              : 'border-white/5 bg-white/5 text-white/40 hover:border-white/20 hover:text-white'}`}
                          >
                            {mode.icon}
                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">{mode.label}</span>
                          </button>
                        ))}
                      </div>

                      {reconcileMode === 'partial' && (
                        <div className="p-8 bg-white/5 rounded-[32px] border border-white/5 animate-in slide-in-from-top-2">
                          <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] block mb-4 leading-none">Ajuste de Valor ({receipt.currency || 'BRL'})</label>
                          <div className="relative">
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 text-2xl font-black text-white/20 tracking-tighter">{receipt.currency || 'R$'}</span>
                            <input
                              type="number"
                              value={partialValue}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPartialValue(Number(e.target.value))}
                              className="bg-transparent w-full text-5xl font-black text-white pl-16 focus:outline-none tracking-tighter"
                            />
                          </div>
                        </div>
                      )}

                      {/* Taxas Internacionais */}
                      {receipt.currency && receipt.currency !== 'BRL' && (
                        <div className="p-8 bg-amber-500/10 rounded-[32px] border border-amber-500/20 space-y-8">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-black text-amber-400 uppercase tracking-[0.3em]">Câmbio: {receipt.currency}</span>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isApplyingTax}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIsApplyingTax(e.target.checked)}
                                className="sr-only peer"
                              />
                              <div className="w-12 h-7 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                            </label>
                          </div>
                          {isApplyingTax && (
                            <div className="space-y-6">
                              <div className="space-y-3">
                                <label className="block text-[10px] font-black text-amber-500 uppercase tracking-[0.2em]">Cotação do Dólar/Euro</label>
                                <div className="relative">
                                  <span className="absolute left-5 top-1/2 -translate-y-1/2 text-sm font-black text-amber-500/40">R$</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={exchangeQuote}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExchangeQuote(parseFloat(e.target.value))}
                                    className="w-full bg-white/5 border border-amber-500/20 rounded-2xl pl-12 pr-6 py-4 text-sm font-black text-white outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                                  />
                                </div>
                              </div>
                              <div className="flex items-start gap-3 p-5 bg-amber-500/5 rounded-2xl border border-amber-500/10">
                                <Info size={16} className="text-amber-500 shrink-0 mt-0.5" />
                                <span className="text-[10px] font-black text-amber-500/60 leading-relaxed uppercase tracking-wider">
                                  IOF ({userSettings?.iof_rate || 6.38}%) + Spread ({userSettings?.spread_rate || 4.0}%) inclusos.
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="p-10 bg-white text-slate-900 rounded-[40px] shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rotate-12 -mr-16 -mt-16 rounded-[40px] opacity-50" />
                        <div className="relative z-10">
                          <div className="flex justify-between items-center mb-4 opacity-40">
                            <span className="text-[11px] font-black uppercase tracking-[0.3em]">BRL Convergência</span>
                            <Calculator size={18} />
                          </div>
                          <p className="text-5xl font-black tracking-tighter leading-none">
                            {formatCurrency(getReconcileAmount())}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] block ml-2">Conta de Destino</label>
                        <div className="relative group">
                          <select
                            value={targetAccount}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTargetAccount(e.target.value)}
                            className="w-full h-20 bg-white/5 border border-white/5 rounded-[28px] px-8 font-black text-white text-sm focus:ring-2 focus:ring-brand-500 appearance-none transition-all group-hover:bg-white/10 group-hover:border-white/10"
                          >
                            <option value="" className="bg-slate-900">Selecione uma conta...</option>
                            {selectedAccounts.map((acc: Account) => (
                              <option key={acc.id} value={acc.id} className="bg-slate-900">{acc.institution}</option>
                            ))}
                          </select>
                          <div className="absolute right-8 top-1/2 -translate-y-1/2 pointer-events-none text-white/20 group-hover:text-white transition-colors">
                            <ChevronRight size={20} className="rotate-90" />
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={handleFinalize}
                        disabled={saveStatus !== 'idle'}
                        className={`w-full h-24 rounded-[32px] font-black text-[12px] uppercase tracking-[0.4em] transition-all active:scale-95 flex items-center justify-center gap-5 shadow-2xl ${saveStatus === 'done'
                          ? 'bg-emerald-500 text-white shadow-emerald-500/40'
                          : 'bg-brand-600 text-white hover:bg-brand-500 shadow-brand-600/20'}`}
                      >
                        {saveStatus === 'saving' ? <Loader2 className="animate-spin" /> : saveStatus === 'done' ? <Check strokeWidth={3} /> : <Sparkles size={20} />}
                        {saveStatus === 'saving' ? 'Processing...' : saveStatus === 'done' ? 'Sucesso!' : 'Confirmar'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'comparative' && (
          <div className="space-y-16 animate-in fade-in duration-1000">
            <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-premium flex flex-col md:flex-row gap-10 items-center">
              <div className="relative flex-grow w-full group">
                <Search className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-900 transition-colors" size={20} />
                <input
                  type="text"
                  placeholder="O que você está procurando hoje?..."
                  value={searchTerm}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                  className="w-full h-20 bg-slate-50 border-none rounded-[24px] pl-20 pr-10 font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/5 transition-all placeholder:text-slate-300 text-lg uppercase tracking-tight"
                />
              </div>
              <div className="flex gap-4 bg-slate-100 p-2 rounded-3xl shrink-0">
                {['Mercado', 'Restaurante', 'Loja'].map(seg => (
                  <button
                    key={seg}
                    onClick={() => setTargetSegment(seg)}
                    className={`px-8 py-5 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all ${targetSegment === seg ? 'bg-white text-slate-900 shadow-xl' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    {seg}
                  </button>
                ))}
              </div>
              <button
                onClick={fetchIntelligenceData}
                className={`w-20 h-20 bg-slate-900 text-white rounded-[28px] flex items-center justify-center hover:bg-brand-600 transition-all shrink-0 shadow-2xl shadow-black/10 active:scale-90 ${isLoadingIntelligence ? 'animate-spin' : ''}`}
              >
                <Sparkles size={24} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
              {isLoadingIntelligence ? (
                Array(6).fill(0).map((_, i) => (
                  <div key={i} className="h-[400px] bg-white border border-slate-100 rounded-[56px] animate-pulse"></div>
                ))
              ) : (
                comparisonData
                  .filter((p: ProductComparison) => !targetSegment || p.merchantCategory === targetSegment)
                  .filter((p: ProductComparison) => !searchTerm || p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.category.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map((product: ProductComparison) => (
                    <div
                      key={product.id}
                      onClick={() => setSelectedProduct(product)}
                      className="bg-white rounded-[56px] border border-slate-100 p-10 shadow-premium hover:shadow-premium-hover hover:border-slate-200 transition-all group relative cursor-pointer active:scale-95 flex flex-col justify-between min-h-[400px] overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rotate-45 -mr-16 -mt-16 group-hover:bg-brand-50 transition-colors" />

                      <div className="space-y-8 relative z-10">
                        <div className="flex justify-between items-start">
                          <div className={`w-16 h-16 rounded-3xl flex items-center justify-center transition-all duration-500 shadow-sm ${product.trend === 'down' ? 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white' : 'bg-rose-50 text-rose-600 group-hover:bg-rose-500 group-hover:text-white'}`}>
                            {product.trend === 'down' ? <TrendingDown size={32} /> : <TrendingUp size={32} />}
                          </div>
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 group-hover:bg-white transition-colors">{product.category}</span>
                        </div>

                        <div className="space-y-2">
                          <h3 className="text-3xl font-black text-slate-900 group-hover:text-brand-600 transition-colors uppercase tracking-tighter leading-tight">{product.name}</h3>
                          <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] group-hover:text-slate-400 transition-colors">ID: {product.id.slice(0, 8)}</p>
                        </div>
                      </div>

                      <div className="space-y-8 relative z-10">
                        <div className="flex justify-between items-end border-t border-slate-50 pt-8">
                          <div className="space-y-2">
                            <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] block">Benchmarking</span>
                            <span className="text-sm font-black text-slate-900 uppercase tracking-tight truncate max-w-[160px] block">{product.bestMerchant}</span>
                          </div>
                          <div className="text-right">
                            <p className="text-3xl font-black text-emerald-600 tracking-tighter leading-none">
                              {formatCurrency(product.minPrice)}
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            if (!shoppingList.find(i => i.id === product.id)) {
                              setShoppingList([...shoppingList, product]);
                            }
                          }}
                          className={`w-full py-6 rounded-[24px] font-black text-[11px] uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-3 shadow-lg ${shoppingList.find(i => i.id === product.id)
                            ? 'bg-emerald-50 text-emerald-600 cursor-default'
                            : 'bg-slate-900 text-white hover:bg-brand-600 shadow-black/5 active:scale-95'}`}
                        >
                          {shoppingList.find(i => i.id === product.id) ? (
                            <><Check size={16} strokeWidth={3} /> Na Lista</>
                          ) : (
                            <><ShoppingCart size={16} /> Adicionar</>
                          )}
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>

            {comparisonData.length === 0 && !isLoadingIntelligence && (
              <div className="py-32 text-center space-y-10 bg-white border border-slate-100 rounded-[64px] shadow-premium max-w-4xl mx-auto">
                <div className="w-32 h-32 bg-slate-50 text-slate-200 rounded-[48px] flex items-center justify-center mx-auto border border-slate-100 shadow-sm">
                  <Store size={64} />
                </div>
                <div className="space-y-4">
                  <h3 className="text-4xl font-black text-slate-900 tracking-tighter">Radar de Preços</h3>
                  <p className="text-slate-400 max-w-sm mx-auto font-medium text-xl leading-relaxed">Escaneie seus primeiros cupons para começar a mapear o mercado.</p>
                </div>
                <button onClick={() => setActiveTab('upload')} className="px-12 py-6 bg-slate-900 text-white rounded-[24px] font-black text-[11px] uppercase tracking-[0.3em] hover:bg-brand-600 transition-all shadow-2xl shadow-black/10">Ir para Scanner</button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'shopping' && (
          <div className="space-y-16 animate-in fade-in duration-1000">
            <div className="bg-slate-900 rounded-[64px] p-16 sm:p-24 text-white relative overflow-hidden border border-slate-800 shadow-premium-dark">
              <div className="absolute top-0 right-0 w-2/3 h-full bg-gradient-to-l from-brand-600/10 to-transparent pointer-events-none" />
              <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-brand-500/10 blur-[120px] rounded-full pointer-events-none" />

              <div className="relative z-10 flex flex-col xl:flex-row justify-between gap-24">
                <div className="max-w-lg space-y-12">
                  <div className="space-y-8">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-white/10 rounded-3xl flex items-center justify-center text-brand-400 border border-white/5">
                        <ShoppingCart size={32} />
                      </div>
                      <span className="px-5 py-2 bg-white/5 border border-white/10 rounded-full text-[11px] font-black uppercase tracking-[0.3em] text-white/40">Market Strategist</span>
                    </div>
                    <h2 className="text-6xl sm:text-7xl font-black tracking-tighter leading-tight">Lista de <br /><span className="text-brand-500">Otimização</span></h2>
                    <p className="text-slate-400 font-medium text-2xl leading-relaxed">
                      Roteiro inteligente gerado para o segmento
                      <span className="text-white font-black uppercase tracking-[0.2em] ml-3 px-4 py-2 bg-white/10 rounded-xl border border-white/10">{targetSegment}</span>.
                    </p>
                  </div>

                  {shoppingList.length > 0 && (
                    <div className="flex items-center gap-8">
                      <button
                        onClick={() => setShoppingList([])}
                        className="px-10 py-5 bg-white/5 hover:bg-rose-500/10 hover:text-rose-400 border border-white/5 rounded-2xl font-black text-[11px] uppercase tracking-[0.3em] transition-all active:scale-95"
                      >
                        Limpar Plano
                      </button>
                      <button className="flex items-center gap-3 text-[11px] font-black uppercase tracking-[0.3em] text-brand-400 hover:text-brand-300 transition-colors">
                        Exportar PDF <ArrowRight size={16} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex-grow">
                  {shoppingList.length === 0 ? (
                    <div className="py-32 text-center border-2 border-dashed border-white/10 rounded-[48px] flex flex-col items-center justify-center space-y-10 hover:border-white/20 transition-all cursor-pointer group" onClick={() => setActiveTab('comparative')}>
                      <div className="w-24 h-24 bg-white/5 rounded-[32px] flex items-center justify-center text-white/10 group-hover:text-brand-400 group-hover:bg-brand-400/10 transition-all duration-500 scale-125">
                        <Plus size={48} />
                      </div>
                      <div className="space-y-3">
                        <p className="font-black text-slate-500 uppercase tracking-[0.4em] text-[11px]">Adicione produtos ao Radar</p>
                        <p className="text-white/20 font-medium text-lg">Seu plano de economia aparecerá aqui.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                      {Array.from(new Set(shoppingList.map(i => i.bestMerchant))).map(merchant => (
                        <div key={merchant} className="bg-white/5 border border-white/5 rounded-[48px] p-12 space-y-10 hover:bg-white/[0.08] transition-all group backdrop-blur-3xl">
                          <div className="flex items-center gap-5 border-b border-white/10 pb-8">
                            <div className="w-12 h-12 bg-brand-500/20 text-brand-400 rounded-2xl flex items-center justify-center border border-brand-500/20 shadow-lg shadow-brand-500/10">
                              <Store size={22} />
                            </div>
                            <h3 className="font-black uppercase text-[12px] tracking-[0.3em] truncate text-white">{merchant}</h3>
                          </div>
                          <div className="space-y-8">
                            {shoppingList.filter((i: ProductComparison) => i.bestMerchant === merchant).map((item: ProductComparison) => (
                              <div key={item.id} className="flex justify-between items-center group/item scale-100 hover:scale-[1.02] transition-transform">
                                <div className="space-y-1">
                                  <span className="text-slate-400 truncate max-w-[200px] font-black uppercase text-[11px] tracking-tight group-hover/item:text-white transition-colors">{item.name}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">{item.category}</span>
                                  </div>
                                </div>
                                <span className="font-black text-white text-xl tracking-tighter">{formatCurrency(item.minPrice)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="pt-8 border-t border-white/10 flex justify-between items-center">
                            <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">Subtotal</span>
                            <span className="text-2xl font-black text-brand-400 tracking-tighter">
                              {formatCurrency(shoppingList.filter(i => i.bestMerchant === merchant).reduce((s, i) => s + i.minPrice, 0))}
                            </span>
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
          <div className="space-y-16 animate-in fade-in duration-1000">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
              <div className="lg:col-span-2 bg-slate-900 rounded-[64px] p-16 sm:p-24 text-white relative overflow-hidden border border-slate-800 shadow-premium-dark max-h-[500px] flex items-center">
                <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.1),transparent)] pointer-events-none" />
                <div className="relative z-10 space-y-14 w-full">
                  <div className="flex items-center gap-8">
                    <div className="p-5 bg-brand-500/10 rounded-3xl border border-white/5 shadow-2xl">
                      <BarChart3 size={36} className="text-brand-400" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-500">Analysis Engine</h3>
                      <h2 className="text-5xl sm:text-6xl font-black tracking-tighter leading-tight">Laboratório de <br />Inflação</h2>
                    </div>
                  </div>
                  <p className="text-slate-400 max-w-lg font-medium text-2xl leading-relaxed">Acompanhe como os preços dos produtos que você realmente consome variam no tempo.</p>
                  <div className="pt-12 border-t border-white/5 flex gap-16">
                    <div>
                      <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] mb-3">Monitorados</p>
                      <p className="text-5xl font-black tracking-tighter">{comparisonData.length}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] mb-3">Segmentação</p>
                      <p className="text-5xl font-black tracking-tighter text-brand-400">SMART</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-[56px] border border-slate-100 p-16 shadow-premium flex flex-col justify-center items-center text-center space-y-10 group">
                <div className="w-24 h-24 bg-slate-50 rounded-[40px] flex items-center justify-center text-slate-900 border border-slate-100 shadow-sm group-hover:scale-110 transition-all duration-500">
                  <BarChart3 size={48} />
                </div>
                <div className="space-y-4">
                  <h3 className="text-3xl font-black text-slate-900 tracking-tighter">Big Data</h3>
                  <p className="text-slate-500 font-medium leading-relaxed text-lg">Métricas processadas em tempo real com hardware de aceleração IA.</p>
                </div>
                <button
                  onClick={fetchIntelligenceData}
                  className="px-10 py-5 bg-slate-100 text-slate-950 rounded-[20px] font-black text-[11px] uppercase tracking-[0.3em] hover:bg-slate-200 transition-all border border-slate-200 shadow-sm active:scale-95"
                >
                  Sincronizar
                </button>
              </div>
            </div>

            <div className="bg-white rounded-[64px] border border-slate-100 shadow-premium overflow-hidden">
              <div className="p-12 border-b border-slate-50 flex items-center justify-between bg-gradient-to-r from-white to-slate-50/50">
                <h3 className="font-black text-slate-900 uppercase tracking-[0.4em] text-[12px]">Variabilidade por Item</h3>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] bg-white px-5 py-2.5 rounded-xl border border-slate-100 shadow-sm">Top 10 Itens</span>
              </div>
              <div className="divide-y divide-slate-50">
                {comparisonData.slice(0, 10).map((product: ProductComparison, idx: number) => (
                  <div key={idx} className="p-12 flex items-center justify-between hover:bg-slate-50/50 transition-all group cursor-pointer" onClick={() => setSelectedProduct(product)}>
                    <div className="flex items-center gap-10">
                      <div className="text-6xl font-black text-slate-50 group-hover:text-slate-100 transition-colors tracking-tighter w-20">{(idx + 1).toString().padStart(2, '0')}</div>
                      <div className="space-y-3">
                        <h4 className="font-black text-slate-900 uppercase text-xl sm:text-2xl tracking-tighter leading-none group-hover:text-brand-600 transition-colors">{product.name}</h4>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">{product.category}</span>
                          <div className="w-1 h-1 bg-slate-100 rounded-full" />
                          <span className="text-[10px] font-black text-brand-400 uppercase tracking-[0.2em]">{product.bestMerchant}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right space-y-2">
                      <div className={`flex items-center justify-end gap-2 text-2xl font-black tracking-tighter ${product.trend === 'up' ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {product.trend === 'up' ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                        {product.trend === 'up' ? '+' : '-'}{Math.round(Math.abs((product.lastPrice - product.avgPrice) / product.avgPrice) * 100)}%
                      </div>
                      <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] block">Desvio Padrão</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Detalhes do Produto */}
      {selectedProduct && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-12">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-2xl transition-opacity animate-in fade-in duration-500" onClick={() => setSelectedProduct(null)}></div>
          <div className="relative bg-white w-full max-w-3xl rounded-[64px] shadow-premium-dark overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
            <div className="p-14 sm:p-20 border-b border-slate-50 flex justify-between items-start gap-12 bg-gradient-to-br from-white to-slate-50/50">
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 bg-brand-500 rounded-full animate-pulse" />
                  <span className="text-[11px] font-black text-brand-600 uppercase tracking-[0.4em]">Product Intelligence</span>
                </div>
                <h2 className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tighter uppercase leading-none">{selectedProduct.name}</h2>
                <div className="flex items-center gap-4">
                  <span className="px-4 py-2 bg-slate-100 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] border border-slate-200/50">{selectedProduct.category}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="w-16 h-16 bg-slate-50 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-[28px] flex items-center justify-center transition-all shrink-0 border border-slate-100 shadow-sm active:scale-90"
              >
                <X size={32} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-14 sm:p-20 space-y-16 scrollbar-hide">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-10">
                <div className="bg-emerald-500 text-white p-10 rounded-[40px] shadow-xl shadow-emerald-500/20 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rotate-12 -mr-16 -mt-16 rounded-[40px] group-hover:scale-110 transition-transform duration-700" />
                  <div className="relative z-10 space-y-4">
                    <p className="text-[11px] font-black text-white/60 uppercase tracking-[0.3em]">Cotação Mínima</p>
                    <p className="text-5xl font-black tracking-tighter leading-none">{formatCurrency(selectedProduct.minPrice)}</p>
                    <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                      <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">{selectedProduct.bestMerchant}</span>
                      <TrendingDown size={20} className="text-white/40" />
                    </div>
                  </div>
                </div>
                <div className="bg-slate-50 p-10 rounded-[40px] border border-slate-100 space-y-4 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white rotate-12 -mr-16 -mt-16 rounded-[40px] group-hover:bg-brand-50 transition-colors duration-700" />
                  <div className="relative z-10 space-y-4">
                    <p className="text-[11px] font-black text-slate-300 uppercase tracking-[0.3em]">Média Móvel</p>
                    <p className="text-5xl font-black text-slate-900 tracking-tighter leading-none">{formatCurrency(selectedProduct.avgPrice)}</p>
                    <div className="pt-4 border-t border-slate-200/50 flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{selectedProduct.history.length} Lançamentos</span>
                      <BarChart3 size={20} className="text-slate-200" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-10">
                <div className="flex items-center justify-between border-b border-slate-100 pb-8">
                  <h4 className="text-[12px] font-black text-slate-900 uppercase tracking-[0.4em]">Audit Log</h4>
                  <div className="flex gap-2">
                    <div className="w-2 h-2 bg-brand-500 rounded-full" />
                    <div className="w-2 h-2 bg-brand-500/30 rounded-full" />
                    <div className="w-2 h-2 bg-brand-500/10 rounded-full" />
                  </div>
                </div>
                <div className="space-y-6">
                  {selectedProduct.history.map((price, i) => (
                    <div key={i} className="flex justify-between items-center p-10 bg-white border border-slate-100 rounded-[32px] hover:border-brand-200 transition-all hover:shadow-premium group/item relative overflow-hidden">
                      <div className="absolute inset-0 bg-brand-50/0 group-hover/item:bg-brand-50/30 transition-colors" />
                      <div className="flex items-center gap-8 relative z-10">
                        <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 group-hover/item:bg-slate-900 group-hover/item:text-white transition-all duration-500 shadow-sm">
                          <Store size={28} />
                        </div>
                        <div className="space-y-2">
                          <p className="font-black text-slate-900 text-lg uppercase truncate max-w-[240px] tracking-tight">{price.ai_documents?.merchant_raw || 'Merchant Name'}</p>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">{new Date(price.document_date).toLocaleDateString('pt-BR')}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right space-y-3 relative z-10">
                        <p className="font-black text-slate-900 text-3xl tracking-tighter leading-none">{formatCurrency(price.unit_price)}</p>
                        {price.is_promo && (
                          <span className="inline-block text-[9px] font-black text-rose-500 uppercase tracking-[0.2em] bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-100">Flash Sale</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-14 sm:p-20 bg-slate-900 border-t border-white/5">
              <button
                onClick={() => {
                  if (selectedProduct && !shoppingList.find((i: ProductComparison) => i.id === selectedProduct.id)) {
                    setShoppingList([...shoppingList, selectedProduct]);
                  }
                  setSelectedProduct(null);
                }}
                className="w-full h-24 bg-brand-600 text-white rounded-[32px] font-black text-[12px] uppercase tracking-[0.4em] hover:bg-brand-500 transition-all flex items-center justify-center gap-5 active:scale-95 shadow-2xl shadow-brand-600/20"
              >
                <ShoppingCart size={24} /> Add to Market Plan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIModule;
