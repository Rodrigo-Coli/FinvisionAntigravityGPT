
import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, BarChart3, Store, Receipt, Check, Loader2, Tag, ArrowRight, ShoppingCart, Calculator, Hash, TrendingUp, TrendingDown, MapPin, Search, Filter, Calendar, Info, X, ChevronRight } from 'lucide-react';
import { AIReconcileService } from '../services/aiReconcile.service';
import { ExtractedReceipt, Profile, ReceiptItem } from '../types';
import { supabase } from './../lib/supabase/client';

const AIModule: React.FC<{ user: Profile }> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'history' | 'comparative' | 'shopping'>('upload');
  const [isProcessing, setIsProcessing] = useState(false);
  const [receipt, setReceipt] = useState<ExtractedReceipt | null>(null);
  const [reconcileMode, setReconcileMode] = useState<'total' | 'partial' | 'items'>('total');
  const [partialValue, setPartialValue] = useState<number>(0);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'done'>('idle');
  const [selectedAccounts, setSelectedAccounts] = useState<any[]>([]);
  const [targetAccount, setTargetAccount] = useState('');

  // States para Dados de Inteligência
  const [comparisonData, setComparisonData] = useState<any[]>([]);
  const [isLoadingIntelligence, setIsLoadingIntelligence] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [targetSegment, setTargetSegment] = useState<string>('Mercado');
  const [shoppingList, setShoppingList] = useState<any[]>([]);

  // States para Conversão de Moeda
  const [exchangeQuote, setExchangeQuote] = useState<number>(1);
  const [userSettings, setUserSettings] = useState<any>(null);
  const [isApplyingTax, setIsApplyingTax] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

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
      setSelectedAccounts(data);
      if (data.length > 0) setTargetAccount(data[0].id);
    }
  };

  const fetchIntelligenceData = async () => {
    setIsLoadingIntelligence(true);
    try {
      const data = await AIReconcileService.getPriceComparison();

      // Agrupar por nome (Ex: Várias "COCA 350ML" viram um só card)
      const groupedByName = data.reduce((acc: any, prod: any) => {
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

      const processed = Object.values(groupedByName).map((group: any) => {
        const prices = group.allPrices || [];
        if (prices.length === 0) return null;

        const validPrices = prices.filter((p: any) => !p.exclude_from_stats);
        if (validPrices.length === 0) return null;

        const avgPrice = validPrices.reduce((sum: number, p: any) => sum + p.unit_price, 0) / (validPrices.length || 1);
        const minPriceObj = validPrices.reduce((min: any, p: any) => p.unit_price < min.unit_price ? p : min, validPrices[0]);

        // Ordenar histórico por data
        const sortedHistory = [...validPrices].sort((a: any, b: any) =>
          new Date(a.document_date).getTime() - new Date(b.document_date).getTime()
        );
        const lastPrice = sortedHistory[sortedHistory.length - 1];

        return {
          id: group.name, // Usamos o nome como ID único para o grupo
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
      }).filter(Boolean);

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
        data.items = data.items.map((it: any) => ({ ...it, selected: true }));
      }
      setReceipt(data);
      setPartialValue(data.total);

      // Ajuste inicial de cotação baseado na moeda
      setExchangeQuote(data.currency === 'USD' ? 5.20 : data.currency === 'EUR' ? 5.60 : 1);

      // Carrega settings se necessário
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

    // Recalcula total com base nos selecionados
    const newTotal = newItems.filter(i => i.selected).reduce((sum, i) => sum + i.total_price, 0);
    setReceipt({ ...receipt, items: newItems });
    // Se estiver em modo items, o valor parcial não importa tanto, mas vamos manter coerente
    if (reconcileMode === 'items') setPartialValue(newTotal);
  };

  const getReconcileAmount = () => {
    if (!receipt) return 0;
    let baseAmount = 0;
    if (reconcileMode === 'total') baseAmount = receipt.total;
    else if (reconcileMode === 'partial') baseAmount = partialValue;
    else baseAmount = receipt.items.filter((it: any) => it.selected).reduce((sum: number, it: any) => sum + it.total_price, 0);

    if (isApplyingTax && receipt.currency && receipt.currency !== 'BRL') {
      const iof = userSettings?.iof_rate || 6.38;
      const spread = userSettings?.spread_rate || 4.00;
      // Cálculo: (Valor Moeda * Cotação * (1 + Spread%)) * (1 + IOF%)
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
      const accountName = selectedAccounts.find((a: any) => a.id === targetAccount)?.institution || 'Conta';

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
    <div className="max-w-6xl mx-auto py-8 sm:py-12 px-4 sm:px-6 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">AI <span className="text-brand-600">& Labs</span></h1>
            <div className="px-2.5 py-1 bg-brand-50 text-brand-600 rounded-lg text-[10px] font-bold uppercase tracking-widest border border-brand-100/50 shadow-sm flex items-center gap-1.5">
              <Sparkles size={12} />
              <span>Inteligência</span>
            </div>
          </div>
          <p className="text-slate-500 font-medium text-sm sm:text-base">Sua central de economia inteligente e laboratório de preços.</p>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-8 border-b border-slate-100 overflow-x-auto scrollbar-hide">
        {[
          { id: 'upload', label: 'Scanner', icon: <Receipt size={14} /> },
          { id: 'comparative', label: 'Comparador', icon: <Store size={14} /> },
          { id: 'shopping', label: 'Lista', icon: <ShoppingCart size={14} /> },
          { id: 'history', label: 'Inflação', icon: <BarChart3 size={14} /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`pb-3 px-1 text-[10px] font-bold transition-all border-b-2 flex items-center gap-2 whitespace-nowrap uppercase tracking-widest ${activeTab === tab.id ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div className="pt-2">
        {activeTab === 'upload' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 xl:gap-14">
            <div className="lg:col-span-8 space-y-10">
              {!receipt ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`bg-white border-2 border-dashed rounded-[32px] p-12 sm:p-20 flex flex-col items-center justify-center transition-all min-h-[400px] cursor-pointer hover:bg-slate-50/50 ${isProcessing ? 'border-brand-400' : 'border-slate-100 hover:border-brand-200'}`}
                >
                  <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,application/pdf" multiple />
                  {isProcessing ? (
                    <div className="text-center space-y-6">
                      <div className="relative">
                        <div className="w-16 h-16 border-4 border-slate-100 border-t-brand-600 rounded-full animate-spin mx-auto" />
                        <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-brand-600 animate-pulse" size={20} />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-xl font-bold text-slate-900 tracking-tight">Processando Cupom...</h3>
                        <p className="text-slate-500 font-medium text-xs">A IA está analisando seus itens com precisão.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center space-y-8">
                      <div className="w-20 h-20 bg-slate-50 rounded-[24px] flex items-center justify-center text-slate-200 mx-auto">
                        <Receipt size={40} />
                      </div>
                      <div className="space-y-3">
                        <h3 className="text-2xl font-bold text-slate-900 tracking-tight">O que você comprou?</h3>
                        <p className="text-slate-500 font-medium max-w-sm mx-auto text-base leading-relaxed">Envie fotos dos seus cupons fiscais para extrair os itens e alimentar sua inteligência de preços.</p>
                      </div>
                      <button className="px-8 py-4 bg-slate-900 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-black/5">Selecionar Arquivos</button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-[48px] border border-slate-100 shadow-soft overflow-hidden animate-in slide-in-from-bottom-5 duration-700">
                  <div className="p-10 sm:p-14 border-b border-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-8">
                    <div className="space-y-2">
                      <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">{receipt.merchant}</h2>
                      <div className="flex items-center gap-3 text-slate-400 font-bold text-[10px] uppercase tracking-widest">
                        <span>{new Date(receipt.date).toLocaleDateString('pt-BR')}</span>
                        <span className="w-1 h-1 bg-slate-200 rounded-full" />
                        <span>{receipt.currency || 'BRL'}</span>
                      </div>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Total Extraído</p>
                      <p className="text-3xl font-bold text-brand-600 tracking-tight">
                        {receipt.currency === 'BRL' || !receipt.currency ? formatCurrency(receipt.total) : `${receipt.currency} ${receipt.total.toFixed(2)}`}
                      </p>
                    </div>
                  </div>

                  <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-50 scrollbar-hide">
                    {receipt.items.map((item: ReceiptItem, idx: number) => (
                      <div
                        key={idx}
                        onClick={() => toggleItemSelection(idx)}
                        className={`p-6 sm:p-8 flex items-center justify-between transition-all cursor-pointer group hover:bg-slate-50/30 ${item.selected ? 'bg-white' : 'bg-slate-50/50 opacity-40 grayscale'}`}
                      >
                        <div className="flex items-center gap-5">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${item.selected ? 'bg-slate-900 text-white shadow-lg shadow-black/5' : 'bg-slate-100 text-slate-400'}`}>
                            {item.selected ? <Check size={16} /> : <Tag size={16} />}
                          </div>
                          <div className="space-y-1">
                            <h4 className="font-bold text-slate-900 text-base sm:text-lg leading-tight tracking-tight">{item.description}</h4>
                            <div className="flex items-center gap-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                              <span>{item.quantity} {item.unit || 'UN'}</span>
                              <span className="w-1 h-1 bg-slate-200 rounded-full" />
                              <span>{item.currency === 'BRL' || !item.currency ? formatCurrency(item.unit_price) : `${item.currency} ${item.unit_price.toFixed(2)}`}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right space-y-1.5">
                          <p className="text-lg font-bold text-slate-900 tracking-tight">
                            {item.currency === 'BRL' || !item.currency ? formatCurrency(item.total_price) : `${item.currency} ${item.total_price.toFixed(2)}`}
                          </p>
                          {item.category_hint && (
                            <span className="inline-block text-[8px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg font-bold uppercase tracking-wider">
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

            <div className="lg:col-span-4 space-y-10">
              {receipt && (
                <div className="bg-white rounded-[32px] border border-slate-100 shadow-soft p-8 sticky top-28 animate-in fade-in zoom-in-95 duration-500 space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-lg shadow-black/5">
                      <Sparkles size={20} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 tracking-tight">Finalizar</h3>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Enviar para Conciliação</p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'total', label: 'Total', icon: <Hash size={16} /> },
                        { id: 'partial', label: 'Parcial', icon: <ArrowRight size={16} /> },
                        { id: 'items', label: 'Itens', icon: <ShoppingCart size={16} /> },
                      ].map(mode => (
                        <button
                          key={mode.id}
                          onClick={() => setReconcileMode(mode.id as any)}
                          className={`p-3 rounded-xl border transition-all flex flex-col items-center gap-2 ${reconcileMode === mode.id
                            ? 'border-brand-600 bg-brand-50 text-brand-600 shadow-sm'
                            : 'border-slate-100 bg-slate-50/50 text-slate-400 hover:border-slate-200'}`}
                        >
                          {mode.icon}
                          <span className="text-[9px] font-bold uppercase tracking-wider">{mode.label}</span>
                        </button>
                      ))}
                    </div>

                    {reconcileMode === 'partial' && (
                      <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 animate-in slide-in-from-top-2">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Valor para Conciliação ({receipt.currency || 'BRL'})</label>
                        <div className="relative">
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 text-lg font-bold text-slate-300 tracking-tight">{receipt.currency || 'R$'}</span>
                          <input
                            type="number"
                            value={partialValue}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPartialValue(Number(e.target.value))}
                            className="bg-transparent w-full text-3xl font-bold text-slate-900 pl-10 focus:outline-none tracking-tighter"
                          />
                        </div>
                      </div>
                    )}

                    {/* Taxas Internacionais */}
                    {receipt.currency && receipt.currency !== 'BRL' && (
                      <div className="p-5 bg-amber-50 rounded-2xl border border-amber-100 space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold text-amber-900 uppercase tracking-widest">Moeda: {receipt.currency}</span>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isApplyingTax}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIsApplyingTax(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                          </label>
                        </div>
                        {isApplyingTax && (
                          <div className="space-y-3">
                            <div className="space-y-1.5">
                              <label className="block text-[9px] font-bold text-amber-700 uppercase tracking-widest">Cotação do Dólar/Euro</label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-500">R$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={exchangeQuote}
                                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExchangeQuote(parseFloat(e.target.value))}
                                  className="w-full bg-white border border-amber-200 rounded-lg pl-8 pr-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                                />
                              </div>
                            </div>
                            <div className="flex items-start gap-2 p-3 bg-amber-100/50 rounded-xl">
                              <Info size={14} className="text-amber-700 shrink-0 mt-0.5" />
                              <span className="text-[9px] font-bold text-amber-900 leading-relaxed uppercase tracking-wider">
                                IOF ({userSettings?.iof_rate || 6.38}%) + Spread ({userSettings?.spread_rate || 4.0}%) inclusos.
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="p-6 bg-slate-900 rounded-[24px] text-white shadow-xl shadow-black/5">
                      <div className="flex justify-between items-center mb-1.5 opacity-60">
                        <span className="text-[9px] font-bold uppercase tracking-widest">Valor Final em BRL</span>
                        <Calculator size={14} />
                      </div>
                      <p className="text-3xl font-bold tracking-tight">
                        {formatCurrency(getReconcileAmount())}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Conta de Origem</label>
                      <div className="relative group">
                        <select
                          value={targetAccount}
                          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTargetAccount(e.target.value)}
                          className="w-full h-12 bg-slate-50 border border-slate-100 rounded-xl px-4 font-bold text-slate-900 text-xs focus:ring-2 focus:ring-brand-500 appearance-none transition-all group-hover:border-slate-200"
                        >
                          <option value="">Selecione uma conta...</option>
                          {selectedAccounts.map((acc: any) => (
                            <option key={acc.id} value={acc.id}>{acc.institution}</option>
                          ))}
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-hover:text-slate-900 transition-colors">
                          <ChevronRight size={14} className="rotate-90" />
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={handleFinalize}
                      disabled={saveStatus !== 'idle'}
                      className={`w-full h-14 rounded-2xl font-bold text-[10px] uppercase tracking-[0.2em] transition-all active:scale-95 flex items-center justify-center gap-3 ${saveStatus === 'done'
                        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                        : 'bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-black/5'}`}
                    >
                      {saveStatus === 'saving' ? <Loader2 className="animate-spin" size={16} /> : saveStatus === 'done' ? <Check size={16} /> : <Sparkles size={16} />}
                      {saveStatus === 'saving' ? 'Processando...' : saveStatus === 'done' ? 'Sucesso!' : 'Finalizar Lançamento'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'comparative' && (
          <div className="space-y-12 animate-in fade-in duration-700">
            <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-soft flex flex-col md:flex-row gap-8 items-center">
              <div className="relative flex-grow w-full group">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-900 transition-colors" size={18} />
                <input
                  type="text"
                  placeholder="Buscar produto ou categoria..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-14 bg-slate-50 border-none rounded-2xl pl-14 pr-8 font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200 transition-all placeholder:text-slate-400"
                />
              </div>
              <div className="flex gap-2 bg-slate-100 p-1.5 rounded-2xl shrink-0">
                {['Mercado', 'Restaurante', 'Loja'].map(seg => (
                  <button
                    key={seg}
                    onClick={() => setTargetSegment(seg)}
                    className={`px-6 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${targetSegment === seg ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    {seg}
                  </button>
                ))}
              </div>
              <button
                onClick={fetchIntelligenceData}
                className={`w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center hover:bg-slate-800 transition-all shrink-0 shadow-lg shadow-black/5 ${isLoadingIntelligence ? 'animate-spin' : ''}`}
              >
                <Sparkles size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {isLoadingIntelligence ? (
                Array(6).fill(0).map((_, i) => (
                  <div key={i} className="h-[320px] bg-white border border-slate-100 rounded-[32px] animate-pulse"></div>
                ))
              ) : (
                comparisonData
                  .filter((p: any) => !targetSegment || p.merchantCategory === targetSegment)
                  .filter((p: any) => !searchTerm || p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.category.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map((product: any) => (
                    <div
                      key={product.id}
                      onClick={() => setSelectedProduct(product)}
                      className="bg-white rounded-[24px] border border-slate-100 p-6 shadow-soft hover:shadow-soft-lg hover:border-brand-200 transition-all group relative cursor-pointer active:scale-95 flex flex-col justify-between min-h-[280px]"
                    >
                      <div className="space-y-4">
                        <div className="flex justify-between items-start">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${product.trend === 'down' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                            {product.trend === 'down' ? <TrendingDown size={20} /> : <TrendingUp size={20} />}
                          </div>
                          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.1em] bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">{product.category}</span>
                        </div>

                        <h3 className="text-lg font-bold text-slate-900 group-hover:text-brand-600 transition-colors uppercase tracking-tight leading-snug">{product.name}</h3>
                      </div>

                      <div className="space-y-4">
                        <div className="flex justify-between items-end border-t border-slate-50 pt-4">
                          <div className="space-y-1">
                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block">Melhor Preço</span>
                            <span className="text-[10px] font-bold text-slate-900 uppercase tracking-tight truncate max-w-[120px] block">{product.bestMerchant}</span>
                          </div>
                          <p className="text-xl font-bold text-emerald-600 tracking-tighter">
                            {formatCurrency(product.minPrice)}
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                              e.stopPropagation();
                              if (!shoppingList.find(i => i.id === product.id)) {
                                setShoppingList([...shoppingList, product]);
                              }
                            }}
                            className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold text-[9px] uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-lg shadow-black/5"
                          >
                            <ShoppingCart size={12} /> Adicionar
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </div>

            {comparisonData.length === 0 && !isLoadingIntelligence && (
              <div className="py-24 text-center space-y-8 bg-white border border-slate-100 rounded-[40px] shadow-soft">
                <div className="w-20 h-20 bg-slate-50 text-slate-200 rounded-[28px] flex items-center justify-center mx-auto">
                  <Store size={40} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Inflação Personalizada</h3>
                  <p className="text-slate-500 max-w-sm mx-auto font-medium text-lg">Escanear cupons fiscais para descobrir onde você paga menos.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'shopping' && (
          <div className="space-y-12 animate-in fade-in duration-700">
            <div className="bg-slate-900 rounded-[48px] p-12 sm:p-16 text-white relative overflow-hidden border border-slate-800 shadow-2xl">
              <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-white/5 to-transparent pointer-events-none" />

              <div className="relative z-10 flex flex-col xl:flex-row justify-between gap-16">
                <div className="max-w-md space-y-8">
                  <div className="space-y-4">
                    <h2 className="text-4xl font-bold tracking-tight">Sua Lista de <br /><span className="text-brand-400">Economia</span></h2>
                    <p className="text-slate-400 font-medium text-lg leading-relaxed">
                      Geramos automaticamente o roteiro mais barato para suas compras baseada no segmento
                      <span className="text-white font-bold uppercase tracking-widest ml-1.5 border-b border-white/20 pb-0.5">{targetSegment}</span>.
                    </p>
                  </div>

                  {shoppingList.length > 0 && (
                    <button
                      onClick={() => setShoppingList([])}
                      className="px-8 py-4 bg-white/10 hover:bg-rose-500/20 hover:text-rose-400 border border-white/10 rounded-2xl font-bold text-[11px] uppercase tracking-[0.2em] transition-all"
                    >
                      Limpar Lista
                    </button>
                  )}
                </div>

                <div className="flex-grow">
                  {shoppingList.length === 0 ? (
                    <div className="py-20 text-center border-2 border-dashed border-white/10 rounded-[32px] flex flex-col items-center justify-center space-y-6 hover:border-white/20 transition-all cursor-pointer group" onClick={() => setActiveTab('comparative')}>
                      <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center text-white/20 group-hover:text-brand-400 group-hover:bg-brand-400/10 transition-all">
                        <ShoppingCart size={32} />
                      </div>
                      <p className="font-bold text-slate-500 uppercase tracking-[0.2em] text-[10px]">Adicione produtos para otimizar</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {Array.from(new Set(shoppingList.map(i => i.bestMerchant))).map(merchant => (
                        <div key={merchant as string} className="bg-white/5 border border-white/5 rounded-[24px] p-8 space-y-6 hover:bg-white/[0.07] transition-all">
                          <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                            <div className="w-8 h-8 bg-brand-400/20 text-brand-400 rounded-lg flex items-center justify-center">
                              <Store size={16} />
                            </div>
                            <h3 className="font-bold uppercase text-[9px] tracking-[0.15em] truncate text-slate-200">{merchant as string}</h3>
                          </div>
                          <div className="space-y-4">
                            {shoppingList.filter((i: any) => i.bestMerchant === merchant).map((item: any) => (
                              <div key={item.id} className="flex justify-between items-center group">
                                <span className="text-slate-400 truncate max-w-[150px] font-medium text-xs transition-colors group-hover:text-white">{item.name}</span>
                                <span className="font-bold text-white text-sm">{formatCurrency(item.minPrice)}</span>
                              </div>
                            ))}
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              <div className="lg:col-span-2 bg-slate-900 rounded-[48px] p-12 sm:p-16 text-white relative overflow-hidden border border-slate-800 shadow-2xl">
                <div className="relative z-10 space-y-12">
                  <div className="flex items-center gap-5">
                    <div className="p-3 bg-brand-500/10 rounded-xl border border-white/5">
                      <Calendar size={24} className="text-brand-400" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">Análise de Consumo</h3>
                      <h2 className="text-3xl font-bold tracking-tight leading-tight">Laboratório de <br />Inflação</h2>
                    </div>
                  </div>
                  <p className="text-slate-400 max-w-sm font-medium text-base leading-relaxed">Acompanhe como os preços dos produtos que você realmente consome variam ao longo do tempo.</p>
                  <div className="pt-8 border-t border-white/5 flex gap-10">
                    <div>
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Produtos Monitorados</p>
                      <p className="text-3xl font-bold tracking-tight">{comparisonData.length}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Segmentação</p>
                      <p className="text-3xl font-bold tracking-tight text-brand-400">Smart</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-[32px] border border-slate-100 p-10 shadow-soft flex flex-col justify-center items-center text-center space-y-6">
                <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-900">
                  <BarChart3 size={32} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-slate-900 tracking-tight">Estatísticas</h3>
                  <p className="text-slate-500 font-medium text-sm leading-relaxed">Dados processados em tempo real com aceleração IA.</p>
                </div>
                <button
                  onClick={fetchIntelligenceData}
                  className="px-6 py-3 bg-slate-100 text-slate-950 rounded-xl font-bold text-[9px] uppercase tracking-widest hover:bg-slate-200 transition-all border border-slate-200/50"
                >
                  Atualizar Dados
                </button>
              </div>
            </div>

            <div className="bg-white rounded-[32px] border border-slate-100 shadow-soft overflow-hidden">
              <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                <h3 className="font-bold text-slate-900 uppercase tracking-[0.15em] text-[9px]">Variabilidade por Item</h3>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">Top 10 Itens</span>
              </div>
              <div className="divide-y divide-slate-50">
                {comparisonData.slice(0, 10).map((product: any, idx: number) => (
                  <div key={idx} className="p-8 flex items-center justify-between hover:bg-slate-50/50 transition-all group cursor-pointer" onClick={() => setSelectedProduct(product)}>
                    <div className="flex items-center gap-6">
                      <div className="text-3xl font-bold text-slate-100 group-hover:text-slate-200 transition-colors tracking-tighter">{(idx + 1).toString().padStart(2, '0')}</div>
                      <div className="space-y-1">
                        <h4 className="font-bold text-slate-900 uppercase text-sm tracking-tight leading-none group-hover:text-brand-600 transition-colors">{product.name}</h4>
                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{product.category}</p>
                      </div>
                    </div>
                    <div className="text-right space-y-1">
                      <p className={`text-lg font-bold tracking-tight ${product.trend === 'up' ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {product.trend === 'up' ? '+' : '-'}{Math.round(Math.abs((product.lastPrice - (product.avgPrice || 1)) / (product.avgPrice || 1)) * 100)}%
                      </p>
                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block">vs Média</span>
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-8">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md transition-opacity animate-in fade-in duration-300" onClick={() => setSelectedProduct(null)}></div>
          <div className="relative bg-white w-full max-w-xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-300">
            <div className="p-8 sm:p-10 border-b border-slate-50 flex justify-between items-start gap-6">
              <div className="space-y-2">
                <div className="px-2 py-1 bg-brand-50 text-brand-600 rounded-md text-[8px] font-bold uppercase tracking-widest border border-brand-100 w-fit">Analítico AI</div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight uppercase leading-tight">{selectedProduct.name}</h2>
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="w-10 h-10 bg-slate-50 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl flex items-center justify-center transition-all shrink-0"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 sm:p-10 space-y-10 scrollbar-hide">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-50/30 p-6 rounded-2xl border border-emerald-100/50 space-y-1">
                  <p className="text-[8px] font-bold text-emerald-600 uppercase tracking-widest">Mínimo Histórico</p>
                  <p className="text-2xl font-bold text-emerald-600 tracking-tighter">{formatCurrency(selectedProduct.minPrice)}</p>
                </div>
                <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100 space-y-1">
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Preço Médio</p>
                  <p className="text-2xl font-bold text-slate-900 tracking-tighter">{formatCurrency(selectedProduct.avgPrice)}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                  <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">Histórico de Lançamentos</h4>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{selectedProduct.history.length} Registros</span>
                </div>
                <div className="space-y-3">
                  {selectedProduct.history.map((price: any, i: number) => (
                    <div key={i} className="flex justify-between items-center p-5 bg-white border border-slate-100 rounded-xl hover:border-brand-100 transition-all hover:shadow-sm group">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-slate-300 group-hover:bg-slate-900 group-hover:text-white transition-all">
                          <Store size={18} />
                        </div>
                        <div className="space-y-0.5">
                          <p className="font-bold text-slate-900 text-xs uppercase truncate max-w-[150px] tracking-tight">{price.ai_documents?.merchant_raw || 'Ponto de Venda'}</p>
                          <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{new Date(price.document_date).toLocaleDateString('pt-BR')}</p>
                        </div>
                      </div>
                      <div className="text-right space-y-1">
                        <p className="font-bold text-slate-900 text-base tracking-tight">{formatCurrency(price.unit_price)}</p>
                        {price.is_promo && (
                          <span className="text-[7px] font-bold text-rose-500 uppercase tracking-widest bg-rose-50 px-1.5 py-0.5 rounded-md border border-rose-100">Promoção</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-8 bg-slate-50 border-t border-slate-100">
              <button
                onClick={() => {
                  if (!shoppingList.find((i: any) => i.id === selectedProduct.id)) {
                    setShoppingList([...shoppingList, selectedProduct]);
                  }
                  setSelectedProduct(null);
                }}
                className="w-full h-16 bg-slate-900 text-white rounded-2xl font-bold text-[10px] uppercase tracking-[0.2em] hover:bg-slate-800 transition-all flex items-center justify-center gap-2.5 active:scale-95 shadow-xl shadow-black/5"
              >
                <ShoppingCart size={16} /> Adicionar à Lista
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIModule;
