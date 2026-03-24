import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, BarChart3, Store, Receipt, Check, Loader2, Tag, ArrowRight, ShoppingCart, Calculator, Hash, TrendingUp, TrendingDown, MapPin, Search, Filter, Calendar, Info, Box, LayoutGrid, Brain, ShieldCheck, AlertTriangle, Target, Lightbulb, Trophy, ChevronRight, ChevronDown } from 'lucide-react';
import { AIReconcileService } from '../services/aiReconcile.service';
import { ExtractedReceipt, Profile } from '../types';
import { supabase } from './../lib/supabase/client';
import { DateUtils } from '../lib/dateUtils';

const AIModule: React.FC<{ user: Profile }> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'history' | 'comparative' | 'shopping' | 'wealth'>('upload');
  const [isProcessing, setIsProcessing] = useState(false);
  const [receipt, setReceipt] = useState<ExtractedReceipt | null>(null);
  const [reconcileMode, setReconcileMode] = useState<'total' | 'partial' | 'items'>('total');
  const [partialValue, setPartialValue] = useState<number>(0);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'done'>('idle');
  const [targetId, setTargetId] = useState('');
  const [targetType, setTargetType] = useState<'account' | 'card'>('account');
  const [allTargets, setAllTargets] = useState<{ id: string; name: string; type: 'account' | 'card' }[]>([]);

  // States para Dados de Inteligência
  const [comparisonData, setComparisonData] = useState<any[]>([]);
  const [isLoadingIntelligence, setIsLoadingIntelligence] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [targetSegment, setTargetSegment] = useState<string>('Mercado');
  const [shoppingList, setShoppingList] = useState<any[]>([]);

  // Vista por estabelecimento
  const [comparatorView, setComparatorView] = useState<'product' | 'merchant'>('product');
  const [merchantData, setMerchantData] = useState<any[]>([]);
  const [isLoadingMerchants, setIsLoadingMerchants] = useState(false);
  const [expandedMerchant, setExpandedMerchant] = useState<string | null>(null);
  const [merchantSearch, setMerchantSearch] = useState('');

  // Wealth Advisor states
  const [wealthAnalysis, setWealthAnalysis] = useState<string>('');
  const [wealthMeta, setWealthMeta] = useState<any>(null);
  const [isLoadingWealth, setIsLoadingWealth] = useState(false);

  // States para Conversão de Moeda
  const [exchangeQuote, setExchangeQuote] = useState<number>(1);
  const [userSettings, setUserSettings] = useState<any>(null);
  const [isApplyingTax, setIsApplyingTax] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchAccounts();
    if (activeTab !== 'upload') {
      fetchIntelligenceData();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'comparative' && comparatorView === 'merchant' && merchantData.length === 0) {
      fetchMerchantData();
    }
  }, [comparatorView, activeTab]);

  const fetchAccounts = async () => {
    if (!supabase || !user) return;

    const [accRes, cardRes] = await Promise.all([
      supabase.from('accounts').select('id, institution').eq('user_id', user.id).eq('is_archived', false),
      supabase.from('cards').select('id, name').eq('user_id', user.id).eq('is_archived', false)
    ]);

    const combined: { id: string; name: string; type: 'account' | 'card' }[] = [];
    if (accRes.data) {
      accRes.data.forEach((a: any) => combined.push({ id: a.id, name: a.institution, type: 'account' }));
    }
    if (cardRes.data) {
      cardRes.data.forEach((c: any) => combined.push({ id: c.id, name: c.name, type: 'card' }));
    }

    setAllTargets(combined.sort((a, b) => a.name.localeCompare(b.name)));
    if (combined.length > 0) {
      setTargetId(combined[0].id);
      setTargetType(combined[0].type);
    }
  };

  const fetchIntelligenceData = async () => {
    setIsLoadingIntelligence(true);
    try {
      const data = await AIReconcileService.getPriceComparison();
      const processed = data.map((prod: any) => {
        const prices = prod.product_prices || [];
        if (prices.length === 0) return null;
        const validPrices = prices.filter((p: any) => !p.exclude_from_stats);
        if (validPrices.length === 0) return null;
        const avgPrice = validPrices.reduce((sum: number, p: any) => sum + p.unit_price, 0) / (validPrices.length || 1);
        const minPriceObj = validPrices.reduce((min: any, p: any) => p.unit_price < min.unit_price ? p : min, validPrices[0]);
        const lastPrice = validPrices[validPrices.length - 1];
        return {
          id: prod.id, name: prod.name, category: prod.category || 'Geral', merchantCategory: minPriceObj.ai_documents?.ocr_structured?.merchant_category || 'Mercado',
          avgPrice, minPrice: minPriceObj.unit_price, bestMerchant: minPriceObj.ai_documents?.merchant_raw || 'N/A', lastPrice: lastPrice.unit_price, trend: lastPrice.unit_price > avgPrice ? 'up' : 'down'
        };
      }).filter(Boolean);
      setComparisonData(processed);
    } catch (err) {
      console.error('Erro ao carregar inteligência:', err);
    } finally {
      setIsLoadingIntelligence(false);
    }
  };

  const fetchMerchantData = async () => {
    setIsLoadingMerchants(true);
    try {
      const data = await AIReconcileService.getMerchantView();
      setMerchantData(data);
    } catch (err) {
      console.error('Erro ao carregar lojas:', err);
    } finally {
      setIsLoadingMerchants(false);
    }
  };

  const generateWealthAnalysis = async () => {
    if (!user?.id) return;
    setIsLoadingWealth(true);
    setWealthAnalysis('');
    try {
      const resp = await fetch('/api/handle-wealth-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro ao gerar diagnóstico');
      setWealthAnalysis(data.analysis);
      setWealthMeta(data.metadata);
    } catch (err: any) {
      setWealthAnalysis(`**Erro:** ${err.message}`);
    } finally {
      setIsLoadingWealth(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsProcessing(true);
    setReceipt(null);
    try {
      const data = await AIReconcileService.processReceiptItems(Array.from(files));
      if (data.items) data.items = data.items.map((it: any) => ({ ...it, selected: true }));
      setReceipt(data);
      setPartialValue(data.total);
      setExchangeQuote(data.currency === 'USD' ? 5.20 : data.currency === 'EUR' ? 5.60 : 1);
      if (!userSettings && supabase) {
        const { data: settings } = await supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle();
        setUserSettings(settings || { iof_rate: 6.38, spread_rate: 4.00 });
      }
      setIsApplyingTax(data.currency && data.currency !== 'BRL');
    } catch (err: any) { alert(err.message || 'Erro ao processar cupons.'); } finally { setIsProcessing(false); }
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
    let baseAmount = reconcileMode === 'total' ? receipt.total : reconcileMode === 'partial' ? partialValue : receipt.items.filter((it: any) => it.selected).reduce((sum: number, it: any) => sum + it.total_price, 0);
    if (isApplyingTax && receipt.currency && receipt.currency !== 'BRL') {
      const iof = userSettings?.iof_rate || 6.38;
      const spread = userSettings?.spread_rate || 4.00;
      return (baseAmount * exchangeQuote * (1 + spread / 100)) * (1 + iof / 100);
    }
    return baseAmount;
  };

  const handleFinalize = async () => {
    if (!receipt || !targetId) { alert("Selecione um destino (Banco ou Cartão)."); return; }
    setSaveStatus('saving');
    try {
      await AIReconcileService.saveReceiptToLabs(receipt);
      const finalAmount = getReconcileAmount();
      const target = allTargets.find((t: any) => t.id === targetId);
      const targetName = target?.name || 'Destino';
      const description = `Labs: ${receipt.merchant} ${receipt.currency !== 'BRL' ? '[' + receipt.currency + ']' : ''}`;

      if (targetType === 'card') {
        await AIReconcileService.saveDirectToCard({
          cardId: targetId,
          date: receipt.date || new Date().toISOString().split('T')[0],
          description,
          amount: finalAmount,
        });
      } else {
        await AIReconcileService.saveToReconcileQueue(
          [{
            date: receipt.date,
            description,
            amount: finalAmount,
            type: 'debit',
            source: 'AI Labs',
            confidence: 1
          }],
          targetId,
          targetName,
          targetType
        );
      }
      setSaveStatus('done');
      setTimeout(() => { setReceipt(null); setSaveStatus('idle'); }, 2000);
    } catch (err: any) { console.error('Erro ao finalizar:', err); alert(err.message || 'Erro ao processar.'); setSaveStatus('idle'); }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  // Merchant view: filtra lojas pelo search
  const filteredMerchants = merchantData.filter(m =>
    !merchantSearch || m.name.toLowerCase().includes(merchantSearch.toLowerCase())
  );

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-10 py-8 space-y-8 animate-in fade-in duration-500">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">AI & Insights</h1>
            <span className="px-2.5 py-1 bg-brand-50 text-brand-600 rounded-lg text-[10px] font-bold uppercase tracking-widest border border-brand-100">Inteligência Labs</span>
          </div>
          <p className="text-sm text-slate-400 font-medium">Scanner de cupons e laboratório de comparação de preços.</p>
        </div>
      </div>

      {/* NAVIGATION TABS — flex-wrap: 2 por linha no mobile, linha única no sm+ */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-slate-50 border border-slate-100 rounded-2xl w-full">
        {[
          { id: 'upload', label: 'Escanear Cupom', icon: <Receipt size={16} /> },
          { id: 'comparative', label: 'Comparador', icon: <Store size={16} /> },
          { id: 'shopping', label: 'Lista de Compras', icon: <ShoppingCart size={16} /> },
          { id: 'history', label: 'Minha Inflação', icon: <BarChart3 size={16} /> },
          { id: 'wealth', label: 'Diagnóstico', icon: <Brain size={16} /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex-1 min-w-[calc(50%-0.25rem)] sm:flex-none sm:min-w-0 justify-center sm:justify-start ${activeTab === tab.id ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="animate-in fade-in duration-700">
        {activeTab === 'upload' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            <div className="lg:col-span-2 space-y-8">
              {!receipt ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`bg-white border-2 border-dashed rounded-[40px] p-20 flex flex-col items-center justify-center transition-all min-h-[400px] cursor-pointer hover:bg-brand-50/10 ${isProcessing ? 'border-brand-500 animate-pulse' : 'border-slate-100 hover:border-brand-300'}`}
                >
                  <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,application/pdf" multiple />
                  {isProcessing ? (
                    <div className="text-center">
                      <Loader2 className="w-16 h-16 text-brand-600 animate-spin mx-auto mb-6" />
                      <h3 className="text-2xl font-bold text-slate-900">Analisando Cupom...</h3>
                      <p className="text-sm text-slate-400 mt-2 font-bold uppercase tracking-widest text-[10px]">A IA está extraindo os itens</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="w-20 h-20 bg-slate-50 rounded-[32px] flex items-center justify-center text-slate-300 mx-auto mb-8 shadow-inner">
                        <Box size={40} />
                      </div>
                      <h3 className="text-3xl font-bold text-slate-900 mb-3 tracking-tight">O que você comprou?</h3>
                      <p className="text-slate-400 font-medium mb-10 max-w-xs mx-auto text-lg leading-relaxed">Envie um Cupom Fiscal para extrair itens e comparar preços.</p>
                      <button className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-xl transition-all hover:bg-brand-600">Selecionar Cupom</button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden border-b-4 border-b-slate-50">
                  <div className="p-8 border-b border-slate-50 bg-slate-50/20 flex justify-between items-center">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900 tracking-tight uppercase italic">{receipt.merchant}</h2>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                        {DateUtils.formatDateTime(new Date(receipt.date))} • {receipt.currency || 'BRL'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mb-1">Total Extraído</p>
                      <p className="text-3xl font-bold text-brand-600 tracking-tighter">
                        {receipt.currency === 'BRL' || !receipt.currency ? formatCurrency(receipt.total) : `${receipt.currency} ${receipt.total.toFixed(2)}`}
                      </p>
                    </div>
                  </div>

                  <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-50">
                    {receipt.items.map((item: any, idx: number) => (
                      <div
                        key={idx}
                        onClick={() => toggleItemSelection(idx)}
                        className={`p-6 flex items-center justify-between transition-colors cursor-pointer ${item.selected ? 'bg-white' : 'bg-slate-50/30 opacity-40 hover:opacity-100'}`}
                      >
                        <div className="flex items-center gap-5">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${item.selected ? 'bg-brand-50 text-brand-600' : 'bg-slate-100 text-slate-400'}`}>
                            {item.selected ? <ShoppingCart size={20} /> : <Tag size={20} />}
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-900 leading-tight">{item.description}</h4>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                              {item.quantity} {item.unit || 'UN'} × {item.currency === 'BRL' || !item.currency ? formatCurrency(item.unit_price) : `${item.currency} ${item.unit_price.toFixed(2)}`}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-slate-900">
                            {item.currency === 'BRL' || !item.currency ? formatCurrency(item.total_price) : `${item.currency} ${item.total_price.toFixed(2)}`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-8">
              {receipt && (
                <div className="bg-white rounded-[40px] border border-slate-100 shadow-xl p-8 sticky top-24 space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg"><Check size={24} /></div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-xl">Confirmar</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {targetType === 'card' ? 'Salvar no Cartão' : 'Enviar p/ Conciliação'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'total', label: 'Total', icon: <Hash size={14} /> },
                      { id: 'partial', label: 'Parcial', icon: <ArrowRight size={14} /> },
                      { id: 'items', label: 'Itens', icon: <ShoppingCart size={14} /> },
                    ].map(mode => (
                      <button
                        key={mode.id}
                        onClick={() => setReconcileMode(mode.id as any)}
                        className={`p-4 rounded-2xl border transition-all flex flex-col items-center gap-2 ${reconcileMode === mode.id ? 'bg-brand-50 border-brand-200 text-brand-600 shadow-sm' : 'bg-slate-50 border-slate-50 text-slate-400 hover:bg-slate-100'}`}
                      >
                        {mode.icon}
                        <span className="text-[9px] font-bold uppercase tracking-widest">{mode.label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="p-6 bg-slate-900 rounded-[32px] text-white space-y-2">
                    <div className="flex justify-between items-center opacity-40">
                      <span className="text-[10px] font-bold uppercase tracking-widest">Valor Conciliado</span>
                      <Calculator size={14} />
                    </div>
                    <p className="text-4xl font-bold tracking-tighter italic">{formatCurrency(getReconcileAmount())}</p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Conta Financeira</label>
                      <select
                        value={targetId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTargetId(val);
                          const t = allTargets.find(x => x.id === val);
                          if (t) setTargetType(t.type);
                        }}
                        className="w-full h-14 bg-slate-50 border-none rounded-2xl px-5 font-bold text-slate-900 text-sm focus:ring-2 focus:ring-brand-500"
                      >
                        <option value="">Selecione...</option>
                        <optgroup label="Contas de Banco">
                          {allTargets.filter(t => t.type === 'account').map((acc: any) => (<option key={acc.id} value={acc.id}>{acc.name}</option>))}
                        </optgroup>
                        <optgroup label="Cartões de Crédito">
                          {allTargets.filter(t => t.type === 'card').map((card: any) => (<option key={card.id} value={card.id}>{card.name}</option>))}
                        </optgroup>
                      </select>
                    </div>

                    <button
                      onClick={handleFinalize}
                      disabled={saveStatus !== 'idle'}
                      className={`w-full h-16 rounded-2xl font-bold text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 ${saveStatus === 'done' ? 'bg-emerald-500 text-white' : 'bg-brand-600 text-white hover:bg-brand-700 shadow-brand-500/20'}`}
                    >
                      {saveStatus === 'saving' ? <Loader2 className="animate-spin" /> : saveStatus === 'done' ? <Check /> : <Sparkles />}
                      {saveStatus === 'saving' ? 'SALVANDO...' : saveStatus === 'done' ? 'SUCESSO!' : 'FINALIZAR'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'comparative' && (
          <div className="space-y-6">
            {/* Toggle Por Produto / Por Estabelecimento */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
                <button
                  onClick={() => setComparatorView('product')}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold transition-all ${comparatorView === 'product' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <Tag size={14} />
                  Por Produto
                </button>
                <button
                  onClick={() => { setComparatorView('merchant'); if (merchantData.length === 0) fetchMerchantData(); }}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold transition-all ${comparatorView === 'merchant' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <Store size={14} />
                  Por Estabelecimento
                </button>
              </div>

              {/* Search bar contextual */}
              {comparatorView === 'product' ? (
                <div className="flex flex-col sm:flex-row gap-3 flex-grow sm:max-w-2xl">
                  <div className="relative flex-grow">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="text"
                      placeholder="Buscar produto..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full h-12 bg-white border border-slate-100 rounded-2xl pl-12 pr-5 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 shadow-sm text-sm"
                    />
                  </div>
                  <div className="flex gap-1 p-1 bg-slate-50 rounded-2xl border border-slate-100">
                    {['Mercado', 'Restaurante', 'Loja'].map(seg => (
                      <button
                        key={seg}
                        onClick={() => setTargetSegment(seg)}
                        className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${targetSegment === seg ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        {seg}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="relative flex-grow sm:max-w-xs">
                  <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    placeholder="Buscar estabelecimento..."
                    value={merchantSearch}
                    onChange={(e) => setMerchantSearch(e.target.value)}
                    className="w-full h-12 bg-white border border-slate-100 rounded-2xl pl-12 pr-5 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 shadow-sm text-sm"
                  />
                </div>
              )}
            </div>

            {/* Vista Por Produto */}
            {comparatorView === 'product' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {isLoadingIntelligence ? (
                  Array(6).fill(0).map((_, i) => <div key={i} className="h-64 bg-slate-50 animate-pulse rounded-[40px]" />)
                ) : comparisonData
                  .filter((p: any) => !targetSegment || p.merchantCategory === targetSegment)
                  .filter((p: any) => !searchTerm || p.name.toLowerCase().includes(searchTerm.toLowerCase()))
                  .length === 0 ? (
                  <div className="col-span-3 py-20 border-2 border-dashed border-slate-100 rounded-[40px] flex flex-col items-center justify-center text-slate-300 gap-4">
                    <Store size={48} />
                    <p className="font-bold uppercase tracking-widest text-xs">Nenhum produto encontrado</p>
                    <p className="text-[10px] text-slate-400 font-medium">Escaneia cupons para comparar preços entre lojas.</p>
                  </div>
                ) : (
                  comparisonData
                    .filter((p: any) => !targetSegment || p.merchantCategory === targetSegment)
                    .filter((p: any) => !searchTerm || p.name.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map((product: any) => (
                      <div key={product.id} className="bg-white rounded-[32px] border border-slate-100 p-8 shadow-sm hover:border-brand-200 transition-all group overflow-hidden relative">
                        <div className="flex justify-between items-start mb-6">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${product.trend === 'down' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                            {product.trend === 'down' ? <TrendingDown size={24} /> : <TrendingUp size={24} />}
                          </div>
                          <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest bg-slate-50 px-3 py-1 rounded-lg">{product.category}</span>
                        </div>

                        <h3 className="text-xl font-bold text-slate-900 mb-6 uppercase truncate">{product.name}</h3>

                        <div className="space-y-4 pt-6 border-t border-slate-50">
                          <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl">
                            <div className="space-y-0.5">
                              <span className="text-[9px] font-bold text-slate-400 uppercase">Melhor Oferta</span>
                              <p className="text-xs font-bold text-slate-900 uppercase truncate max-w-[140px]">{product.bestMerchant}</p>
                            </div>
                            <span className="text-xl font-bold text-emerald-600">{formatCurrency(product.minPrice)}</span>
                          </div>
                          <button
                            onClick={() => !shoppingList.find(i => i.id === product.id) && setShoppingList([...shoppingList, product])}
                            className="w-full h-12 bg-slate-900 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-brand-600 transition-all"
                          >
                            Adicionar à Lista
                          </button>
                        </div>
                      </div>
                    ))
                )}
              </div>
            )}

            {/* Vista Por Estabelecimento */}
            {comparatorView === 'merchant' && (
              <div className="space-y-4">
                {isLoadingMerchants ? (
                  Array(3).fill(0).map((_, i) => <div key={i} className="h-24 bg-slate-50 animate-pulse rounded-[28px]" />)
                ) : filteredMerchants.length === 0 ? (
                  <div className="py-20 border-2 border-dashed border-slate-100 rounded-[40px] flex flex-col items-center justify-center text-slate-300 gap-4">
                    <Store size={48} />
                    <p className="font-bold uppercase tracking-widest text-xs">Nenhum estabelecimento encontrado</p>
                    <p className="text-[10px] text-slate-400 font-medium">Escaneia cupons fiscais para popular sua base de lojas.</p>
                  </div>
                ) : filteredMerchants.map((merchant: any) => {
                  const isExpanded = expandedMerchant === merchant.name;
                  const cheapestCount = merchant.items.filter((i: any) => i.isCheapest).length;

                  return (
                    <div key={merchant.name} className="bg-white rounded-[28px] border border-slate-100 shadow-sm overflow-hidden transition-all hover:border-brand-100">
                      {/* Merchant header — clicável para expandir */}
                      <button
                        className="w-full p-6 flex items-center justify-between gap-4 text-left"
                        onClick={() => setExpandedMerchant(isExpanded ? null : merchant.name)}
                      >
                        <div className="flex items-center gap-5">
                          <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shrink-0">
                            <Store size={20} />
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900 uppercase tracking-tight text-base">{merchant.name}</h3>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                {merchant.visitCount} {merchant.visitCount === 1 ? 'visita' : 'visitas'} · {merchant.items.length} {merchant.items.length === 1 ? 'produto' : 'produtos'}
                              </span>
                              {merchant.lastVisit && (
                                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                                  · Última: {new Date(merchant.lastVisit).toLocaleDateString('pt-BR')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 shrink-0">
                          {cheapestCount > 0 && (
                            <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-xl">
                              <Trophy size={12} />
                              <span className="text-[10px] font-bold uppercase tracking-wider">
                                {cheapestCount} mais barato{cheapestCount > 1 ? 's' : ''}
                              </span>
                            </div>
                          )}
                          <div className="text-slate-400">
                            {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                          </div>
                        </div>
                      </button>

                      {/* Items list — expandido */}
                      {isExpanded && (
                        <div className="border-t border-slate-50 divide-y divide-slate-50">
                          {merchant.items
                            .sort((a: any, b: any) => (b.isCheapest ? 1 : 0) - (a.isCheapest ? 1 : 0))
                            .map((item: any, idx: number) => (
                              <div key={idx} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/50 transition-all">
                                <div className="flex items-center gap-4">
                                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${item.isCheapest ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-50 text-slate-400'}`}>
                                    {item.isCheapest ? <Trophy size={14} /> : <Tag size={14} />}
                                  </div>
                                  <div>
                                    <p className="font-bold text-slate-900 text-sm uppercase">{item.name}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.category}{item.is_promo ? ' · 🏷 Promoção' : ''}</p>
                                  </div>
                                </div>
                                <div className="text-right shrink-0 pl-4">
                                  <p className={`font-bold text-base ${item.isCheapest ? 'text-emerald-600' : 'text-slate-900'}`}>
                                    {formatCurrency(item.unit_price)}
                                  </p>
                                  <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">por {item.unit}</p>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'shopping' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-slate-900 rounded-[40px] p-12 text-white relative overflow-hidden">
              <div className="relative z-10">
                <h2 className="text-4xl font-bold tracking-tighter mb-4 italic">Lista Otimizada</h2>
                <p className="text-slate-400 text-lg max-w-lg mb-12">Economize comprando itens onde eles são mais baratos.</p>

                {shoppingList.length === 0 ? (
                  <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-[32px] text-slate-600 font-bold uppercase text-xs tracking-widest">Lista Vazia</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {Array.from(new Set(shoppingList.map(i => i.bestMerchant))).map((merchant: any) => (
                      <div key={merchant} className="bg-white/5 border border-white/10 rounded-[32px] p-8 space-y-6">
                        <div className="flex items-center gap-3">
                          <Store size={18} className="text-brand-400" />
                          <h3 className="font-bold uppercase text-[10px] tracking-[0.2em]">{merchant}</h3>
                        </div>
                        <div className="space-y-3">
                          {shoppingList.filter(i => i.bestMerchant === merchant).map((item: any) => (
                            <div key={item.id} className="flex justify-between items-center text-sm">
                              <span className="text-slate-400">{item.name}</span>
                              <span className="font-bold">{formatCurrency(item.minPrice)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {shoppingList.length > 0 && (
              <div className="bg-white border border-slate-100 rounded-[40px] p-8 flex flex-col justify-between h-fit space-y-8">
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resumo da Lista</p>
                  <h3 className="text-3xl font-bold text-slate-900 italic">Economia Total</h3>
                  <p className="text-2xl font-bold text-brand-600">{formatCurrency(shoppingList.reduce((acc, i) => acc + (i.avgPrice - i.minPrice), 0))}</p>
                </div>
                <button onClick={() => setShoppingList([])} className="w-full h-14 bg-rose-50 text-rose-500 rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all">Limpar Tudo</button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-slate-900 rounded-[40px] p-12 text-white overflow-hidden relative">
                <div className="relative z-10 space-y-4">
                  <div className="flex items-center gap-3">
                    <BarChart3 size={20} className="text-brand-400" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">Consumer Analytics</span>
                  </div>
                  <h2 className="text-4xl font-bold tracking-tighter">Inflação Pessoal</h2>
                  <p className="text-slate-400 max-w-xs font-medium">Análise de variabilidade baseada nas suas compras.</p>
                </div>
              </div>

              <div className="bg-white border border-slate-100 rounded-[40px] p-12 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Variabilidade Média</p>
                  <h3 className="text-4xl font-bold text-slate-900 tracking-tighter">+4.8% <span className="text-sm font-bold text-rose-500 uppercase ml-2 tracking-widest">Alta</span></h3>
                </div>
                <TrendingUp size={48} className="text-rose-500 opacity-20" />
              </div>
            </div>

            <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm">
              <div className="p-8 border-b border-slate-50 font-bold text-slate-900 uppercase tracking-widest text-[10px]">Histórico de Preços por Item</div>
              <div className="divide-y divide-slate-50">
                {comparisonData.slice(0, 10).map((product: any, idx: number) => (
                  <div key={idx} className="p-8 flex items-center justify-between hover:bg-slate-50/30 transition-all">
                    <div className="flex items-center gap-8">
                      <span className="text-2xl font-bold text-slate-100 italic">{String(idx + 1).padStart(2, '0')}</span>
                      <div>
                        <h4 className="font-bold text-slate-900 uppercase tracking-tight">{product.name}</h4>
                        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{product.category}</p>
                      </div>
                    </div>
                    <div className="text-right space-y-1">
                      <p className={`text-xl font-bold ${product.trend === 'up' ? 'text-rose-600' : 'text-emerald-600'}`}>{product.trend === 'up' ? '+' : '-'}{Math.round(Math.abs((product.lastPrice - product.avgPrice) / product.avgPrice) * 100)}%</p>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Variação Real</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'wealth' && (
          <div className="space-y-8">
            <div className="bg-slate-900 rounded-[40px] p-10 md:p-16 text-white relative overflow-hidden">
              <div className="absolute -top-10 -right-10 w-64 h-64 bg-brand-500/10 rounded-full blur-3xl" />
              <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
                <div className="w-20 h-20 bg-white/5 border border-white/10 rounded-[28px] flex items-center justify-center shrink-0">
                  <Brain size={40} className="text-brand-400" />
                </div>
                <div className="text-center md:text-left">
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500 mb-1">FinVision Private Banking</p>
                  <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Diagnóstico Patrimonial Completo</h2>
                  <p className="text-slate-400 mt-2 font-medium">Análise de toda a sua vida financeira: dívidas, investimentos, fluxo de caixa e oportunidades.</p>
                </div>
                <button
                  onClick={generateWealthAnalysis}
                  disabled={isLoadingWealth}
                  className="shrink-0 flex items-center gap-3 px-8 py-4 bg-brand-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-xl shadow-brand-600/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                >
                  {isLoadingWealth ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                  {isLoadingWealth ? 'Analisando...' : 'Gerar Diagnóstico'}
                </button>
              </div>
            </div>

            {wealthMeta && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {[
                  { label: 'Patrimônio Líquido', value: `R$ ${Math.round(wealthMeta.netWorth).toLocaleString('pt-BR')}`, color: wealthMeta.netWorth >= 0 ? 'text-emerald-600' : 'text-red-600', icon: <ShieldCheck size={20} /> },
                  { label: 'Total de Dívidas', value: `R$ ${Math.round(wealthMeta.totalLiabilities).toLocaleString('pt-BR')}`, color: 'text-red-600', icon: <AlertTriangle size={20} /> },
                  { label: 'Poupança Mensal', value: `R$ ${Math.round(wealthMeta.avgMonthlySavings).toLocaleString('pt-BR')}`, color: wealthMeta.avgMonthlySavings >= 0 ? 'text-brand-600' : 'text-orange-600', icon: <Target size={20} /> },
                  { label: 'Compromissão de Renda', value: `${wealthMeta.debtToIncome}%`, color: wealthMeta.debtToIncome > 30 ? 'text-red-600' : 'text-emerald-600', icon: <Lightbulb size={20} /> },
                ].map((card, i) => (
                  <div key={i} className="bg-white border border-slate-100 rounded-[28px] p-6 shadow-sm">
                    <div className={`${card.color} mb-3`}>{card.icon}</div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{card.label}</p>
                    <p className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value}</p>
                  </div>
                ))}
              </div>
            )}

            {wealthAnalysis && (
              <div className="bg-white border border-slate-100 rounded-[40px] shadow-sm overflow-hidden">
                <div className="px-10 py-6 border-b border-slate-50 flex items-center gap-3">
                  <Sparkles size={18} className="text-brand-500" />
                  <h3 className="font-bold text-slate-900 uppercase tracking-widest text-[10px]">Relatório FinVision Advisor</h3>
                </div>
                <div className="p-10 prose prose-slate max-w-none">
                  {wealthAnalysis.split('\n').map((line, i) => {
                    if (line.startsWith('# ')) return <h1 key={i} className="text-2xl font-bold text-slate-900 mt-6 mb-3">{line.replace('# ', '')}</h1>;
                    if (line.startsWith('## ')) return <h2 key={i} className="text-xl font-bold text-slate-900 mt-6 mb-3 border-b border-slate-100 pb-2">{line.replace('## ', '')}</h2>;
                    if (line.startsWith('### ')) return <h3 key={i} className="text-base font-bold text-brand-700 mt-4 mb-2">{line.replace('### ', '')}</h3>;
                    if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="ml-4 text-slate-600 mb-1 font-medium">{line.replace(/^[-*] /, '').replace(/\*\*(.*?)\*\*/g, '$1')}</li>;
                    if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="font-bold text-slate-900 mt-2">{line.replace(/\*\*(.*?)\*\*/g, '$1')}</p>;
                    if (line.trim() === '') return <div key={i} className="h-3" />;
                    return <p key={i} className="text-slate-600 mb-2 leading-relaxed" dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />;
                  })}
                </div>
              </div>
            )}

            {!wealthAnalysis && !isLoadingWealth && (
              <div className="py-20 border-2 border-dashed border-slate-100 rounded-[40px] flex flex-col items-center justify-center text-slate-300 gap-4">
                <Brain size={48} />
                <p className="font-bold uppercase tracking-widest text-xs">Clique em "Gerar Diagnóstico" para começar</p>
                <p className="text-[10px] text-slate-400 font-medium max-w-xs text-center">O FinVision irá analisar todos seus ativos, passivos, fluxo de caixa e te dar um plano de ação preciso.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AIModule;
