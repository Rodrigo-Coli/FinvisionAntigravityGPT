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
    <div className="max-w-6xl mx-auto py-8 sm:py-10 px-6 sm:px-8 space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-0.5 bg-brand-50 text-brand-600 rounded-md text-[8px] font-bold uppercase tracking-widest border border-brand-100/50 flex items-center gap-1.5">
              <Sparkles size={10} className="animate-pulse" />
              AI Studio
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">AI Labs</h1>
          </div>
          <p className="text-slate-500 text-sm max-w-xl">Escaneie notas fiscais e receba insights de mercado em tempo real.</p>
        </div>
      </header>

      {/* Tabs Compactas */}
      <div className="flex gap-6 border-b border-slate-100 overflow-x-auto scrollbar-hide">
        {[
          { id: 'upload', label: 'Scanner', icon: <Receipt size={14} /> },
          { id: 'comparative', label: 'Comparador', icon: <Store size={14} /> },
          { id: 'shopping', label: 'Roteiro', icon: <ShoppingCart size={14} /> },
          { id: 'history', label: 'Análise', icon: <BarChart3 size={14} /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`pb-3 px-0.5 text-[9px] font-bold transition-all border-b-2 flex items-center gap-2 whitespace-nowrap uppercase tracking-widest ${activeTab === tab.id
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div className="pt-2">
        {activeTab === 'upload' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 space-y-6">
              {!receipt ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`bg-white border-2 border-dashed rounded-3xl p-10 sm:p-14 flex flex-col items-center justify-center transition-all min-h-[300px] cursor-pointer group ${isProcessing ? 'border-brand-400 bg-brand-50/10' : 'border-slate-100 hover:border-slate-200'}`}
                >
                  <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,application/pdf" multiple />

                  {isProcessing ? (
                    <div className="text-center space-y-4">
                      <Loader2 className="animate-spin text-brand-600 mx-auto" size={32} />
                      <div className="space-y-0.5">
                        <h3 className="text-lg font-bold text-slate-900 tracking-tight">Processando Arquivos</h3>
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-[8px]">OCR em execução</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center space-y-6">
                      <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mx-auto">
                        <Receipt size={24} />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-xl font-bold text-slate-900 tracking-tight">Importar Comprovantes</h3>
                        <p className="text-slate-500 font-medium text-sm">Clique para selecionar ou arraste os arquivos aqui.</p>
                      </div>
                      <button className="px-8 py-3 bg-slate-900 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-md">Upload</button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden animate-in slide-in-from-bottom-2 duration-300">
                  <div className="p-6 border-b border-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/20">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Store size={16} className="text-slate-900" />
                        <h2 className="text-lg font-bold text-slate-900 uppercase tracking-tight">{receipt.merchant}</h2>
                      </div>
                      <div className="flex items-center gap-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                        <span className="bg-white px-2 py-0.5 rounded border border-slate-100">{new Date(receipt.date).toLocaleDateString('pt-BR')}</span>
                        <span className="bg-white px-2 py-0.5 rounded border border-slate-100">{receipt.currency || 'BRL'}</span>
                      </div>
                    </div>
                    <div className="text-left sm:text-right bg-white p-3 rounded-xl border border-slate-100">
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Total Nota</p>
                      <p className="text-xl font-black text-slate-900 tracking-tighter leading-none">
                        {receipt.currency === 'BRL' || !receipt.currency ? formatCurrency(receipt.total) : `${receipt.currency} ${receipt.total.toFixed(2)}`}
                      </p>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-50">
                    {receipt.items.map((item, idx) => (
                      <div
                        key={idx}
                        onClick={() => toggleItemSelection(idx)}
                        className={`p-4 flex items-center justify-between transition-all cursor-pointer hover:bg-slate-50 ${item.selected ? 'opacity-100' : 'opacity-40'}`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.selected ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-300'}`}>
                            {item.selected ? <Check size={14} strokeWidth={3} /> : <Tag size={14} />}
                          </div>
                          <div className="space-y-1">
                            <h4 className="font-bold text-slate-900 text-sm uppercase tracking-tight">{item.description}</h4>
                            <div className="flex items-center gap-2 text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                              <span>{item.quantity} {item.unit}</span>
                              <div className="w-0.5 h-0.5 bg-slate-100 rounded-full" />
                              <span>{formatCurrency(item.unit_price)}</span>
                            </div>
                          </div>
                        </div>
                        <p className="text-base font-bold text-slate-900 tracking-tight">
                          {formatCurrency(item.total_price)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-4 lg:sticky lg:top-6 space-y-6">
              {receipt && (
                <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-lg space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-white/10 text-brand-400 rounded-lg flex items-center justify-center border border-white/5">
                      <Sparkles size={16} />
                    </div>
                    <h3 className="text-base font-bold tracking-tight uppercase">Concluir Voto</h3>
                  </div>

                  <div className="space-y-6">
                    <div className="grid grid-cols-3 gap-2">
                      {['total', 'partial', 'items'].map(mode => (
                        <button
                          key={mode}
                          onClick={() => setReconcileMode(mode as any)}
                          className={`py-2 px-1 rounded-lg border text-[8px] font-bold uppercase tracking-widest transition-all ${reconcileMode === mode ? 'border-brand-500 bg-brand-500/10 text-brand-400' : 'border-white/5 bg-white/5 text-white/40'}`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>

                    <div className="p-4 bg-white text-slate-900 rounded-xl flex justify-between items-center group">
                      <div>
                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Projeção BRL</p>
                        <p className="text-2xl font-black tracking-tighter leading-none">{formatCurrency(getReconcileAmount())}</p>
                      </div>
                      <Calculator size={16} className="text-slate-200" />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[8px] font-bold text-white/40 uppercase tracking-widest block ml-0.5">Conta Origem</label>
                      <select
                        value={targetAccount}
                        onChange={(e) => setTargetAccount(e.target.value)}
                        className="w-full h-11 bg-white/5 border border-white/5 rounded-lg px-3 font-bold text-white text-[10px] tracking-tight outline-none"
                      >
                        <option value="" className="bg-slate-900">Selecione...</option>
                        {selectedAccounts.map((acc) => (
                          <option key={acc.id} value={acc.id} className="bg-slate-900">{acc.institution}</option>
                        ))}
                      </select>
                    </div>

                    <button
                      onClick={handleFinalize}
                      disabled={saveStatus !== 'idle'}
                      className={`w-full py-4 rounded-xl font-bold text-[9px] uppercase tracking-[0.2em] shadow-lg transition-all active:scale-95 ${saveStatus === 'done' ? 'bg-emerald-500' : 'bg-brand-600'}`}
                    >
                      {saveStatus === 'saving' ? 'PROCESSANDO...' : saveStatus === 'done' ? 'SUCESSO ✓' : 'CONFIRMAR'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'comparative' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 items-center">
              <div className="relative flex-grow w-full">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                <input
                  type="text"
                  placeholder="Pesquisar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-11 bg-slate-50 border-none rounded-xl pl-11 pr-4 font-bold text-slate-900 text-sm focus:ring-1 focus:ring-slate-100"
                />
              </div>
              <div className="flex gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-100">
                {['Mercado', 'Loja'].map(seg => (
                  <button
                    key={seg}
                    onClick={() => setTargetSegment(seg)}
                    className={`px-4 py-2 rounded-lg text-[9px] font-bold uppercase transition-all ${targetSegment === seg ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
                  >
                    {seg}
                  </button>
                ))}
              </div>
              <button
                onClick={fetchIntelligenceData}
                className={`w-11 h-11 bg-slate-900 text-white rounded-xl flex items-center justify-center shrink-0 shadow-md ${isLoadingIntelligence ? 'animate-spin' : ''}`}
              >
                <Sparkles size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {isLoadingIntelligence ? (
                Array(4).fill(0).map((_, i) => (
                  <div key={i} className="h-64 bg-slate-50 rounded-2xl animate-pulse"></div>
                ))
              ) : (
                comparisonData
                  .filter((p) => !targetSegment || p.merchantCategory === targetSegment)
                  .filter((p) => !searchTerm || p.name.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map((product) => (
                    <div
                      key={product.id}
                      onClick={() => setSelectedProduct(product)}
                      className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm hover:border-slate-200 transition-all cursor-pointer flex flex-col justify-between min-h-[260px]"
                    >
                      <div className="space-y-4">
                        <div className="flex justify-between items-start">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-sm ${product.trend === 'down' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                            {product.trend === 'down' ? <TrendingDown size={18} /> : <TrendingUp size={18} />}
                          </div>
                          <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-0.5 rounded border border-slate-100">{product.category}</span>
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight leading-tight line-clamp-2">{product.name}</h3>
                      </div>

                      <div className="space-y-4 pt-4 border-t border-slate-50">
                        <div className="flex justify-between items-end">
                          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-[80px]">{product.bestMerchant}</span>
                          <p className="text-lg font-black text-emerald-600 tracking-tighter leading-none">{formatCurrency(product.minPrice)}</p>
                        </div>
                        <button className="w-full py-2 bg-slate-900 text-white rounded-lg font-bold text-[8px] uppercase tracking-widest">
                          Adicionar
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}

        {/* Similar updates for Shopping and History tabs... */}
        {activeTab === 'shopping' && (
          <div className="bg-slate-900 rounded-3xl p-8 sm:p-10 text-white min-h-[400px] flex flex-col justify-center text-center space-y-4">
            <ShoppingCart size={32} className="mx-auto text-white/20 mb-2" />
            <h3 className="text-xl font-bold">Roteiro Inteligente</h3>
            <p className="text-slate-400 text-sm max-w-xs mx-auto">Em breve sua lista otimizada com economia real baseada em inteligência artificial.</p>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-10 text-center space-y-4">
            <BarChart3 size={32} className="mx-auto text-slate-200 mb-2" />
            <h3 className="text-xl font-bold text-slate-900">Análise de Inflação</h3>
            <p className="text-slate-500 text-sm max-w-sm mx-auto">Visualize a evolução dos preços do seu carrinho de compras ao longo do tempo.</p>
          </div>
        )}
      </div>

      {/* Modal Rescaled */}
      {selectedProduct && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setSelectedProduct(null)}></div>
          <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-6 border-b border-slate-50 flex justify-between items-start gap-4">
              <div className="space-y-1">
                <p className="text-[7px] font-bold text-brand-600 uppercase tracking-widest">Ativo Auditado</p>
                <h2 className="text-lg font-bold text-slate-900 uppercase tracking-tight">{selectedProduct.name}</h2>
              </div>
              <button onClick={() => setSelectedProduct(null)} className="p-2 text-slate-300 hover:text-slate-900"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-500 text-white p-4 rounded-xl">
                  <p className="text-[7px] font-bold text-white/60 uppercase tracking-widest mb-1">Mínimo</p>
                  <p className="text-xl font-black">{formatCurrency(selectedProduct.minPrice)}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <p className="text-[7px] font-bold text-slate-300 uppercase tracking-widest mb-1">Média</p>
                  <p className="text-xl font-black text-slate-900">{formatCurrency(selectedProduct.avgPrice)}</p>
                </div>
              </div>
              <div className="space-y-3">
                <h4 className="text-[8px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-2">Histórico</h4>
                {selectedProduct.history.map((price, i) => (
                  <div key={i} className="flex justify-between items-center text-xs py-1">
                    <span className="text-slate-500">{new Date(price.document_date).toLocaleDateString()}</span>
                    <span className="font-bold text-slate-900">{formatCurrency(price.unit_price)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-100">
              <button className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold text-[9px] uppercase tracking-widest">Adicionar ao Roteiro</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIModule;
