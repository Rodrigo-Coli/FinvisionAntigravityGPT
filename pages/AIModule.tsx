import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, BarChart3, Store, Receipt, Check, Loader2, Tag, ArrowRight, ShoppingCart, Calculator, Hash, TrendingUp, TrendingDown, MapPin, Search, Filter, Calendar, Info, Box, LayoutGrid, Brain, ShieldCheck, AlertTriangle, Target, Lightbulb } from 'lucide-react';
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
      if (data && data.merchant) {
        const itemsWithSelection = (data.items || []).map((item: any) => ({ ...item, selected: true }));
        setReceipt({ ...data, items: itemsWithSelection });
      } else {
        alert('Não foi possível extrair o cupom. Tente outra imagem.');
      }
    } catch (err: any) {
      alert(err.message || 'Erro ao processar imagem.');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleItemSelection = (idx: number) => {
    if (!receipt) return;
    const items = receipt.items.map((item: any, i: number) =>
      i === idx ? { ...item, selected: !item.selected } : item
    );
    setReceipt({ ...receipt, items });
  };

  const getEffectiveTotal = () => {
    if (!receipt) return 0;
    if (reconcileMode === 'total') return receipt.total;
    if (reconcileMode === 'partial') return partialValue;
    return receipt.items
      .filter((i: any) => i.selected)
      .reduce((sum: number, i: any) => sum + i.total_price, 0);
  };

  const handleFinalize = async () => {
    if (!receipt) return;
    const selectedTarget = allTargets.find(t => t.id === targetId);
    const targetName = selectedTarget?.name || 'Destino';
    const effectiveTotal = getEffectiveTotal();

    setSaveStatus('saving');
    try {
      await AIReconcileService.saveReceiptToLabs(receipt);
      await AIReconcileService.saveToReconcileQueue(
        [{
          date: receipt.date,
          description: `Compras ${receipt.merchant}`,
          amount: effectiveTotal,
          type: 'debit',
          confidence: 1
        }],
        targetId,
        targetName,
        targetType
      );
      setSaveStatus('done');
      setTimeout(() => { setReceipt(null); setSaveStatus('idle'); }, 2000);
    } catch (err: any) { console.error('Erro ao finalizar:', err); alert(err.message || 'Erro ao processar.'); setSaveStatus('idle'); }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

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

      {/* NAVIGATION TABS */}
      {/* Mobile: grid 2 colunas; sm+: linha única horizontal */}
      <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 p-1.5 bg-slate-50 border border-slate-100 rounded-2xl w-full sm:w-fit">
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
            className={`flex items-center justify-center sm:justify-start gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
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
              {/* Upload Panel */}
              <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Scanner de Cupom</h2>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">Fotografe ou envie a imagem do seu cupom fiscal</p>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center text-brand-600">
                    <Receipt size={22} />
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                />

                {!receipt ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-100 rounded-[24px] p-16 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-brand-200 hover:bg-slate-50/50 transition-all"
                  >
                    {isProcessing ? (
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 size={40} className="animate-spin text-brand-500" />
                        <p className="text-xs font-bold text-brand-600 uppercase tracking-widest">Analisando cupom...</p>
                      </div>
                    ) : (
                      <>
                        <div className="w-20 h-20 bg-white shadow-xl shadow-slate-100 rounded-[24px] flex items-center justify-center text-slate-300">
                          <Receipt size={36} />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-bold text-slate-900 uppercase tracking-widest">Enviar Cupom</p>
                          <p className="text-xs text-slate-400 font-medium mt-1">JPG, PNG ou HEIC • Máx 10MB</p>
                        </div>
                        <button className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-xl transition-all hover:bg-brand-600">Selecionar Cupom</button>
                      </>
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
                            {item.is_promo && <span className="text-[9px] font-bold text-emerald-500 uppercase">Promo</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Panel: Destino + Reconcile Mode */}
            {receipt && (
              <div className="space-y-6">
                <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-8 space-y-6">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest">Destino</h3>
                  <select
                    value={targetId}
                    onChange={e => {
                      const t = allTargets.find(x => x.id === e.target.value);
                      setTargetId(e.target.value);
                      if (t) setTargetType(t.type);
                    }}
                    className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    {allTargets.map(t => (
                      <option key={t.id} value={t.id}>{t.type === 'card' ? '💳' : '🏦'} {t.name}</option>
                    ))}
                  </select>

                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Modo de Reconciliação</p>
                    {[
                      { id: 'total', label: 'Total do Cupom', desc: formatCurrency(receipt.total) },
                      { id: 'items', label: 'Itens Selecionados', desc: formatCurrency(receipt.items.filter((i: any) => i.selected).reduce((s: number, i: any) => s + i.total_price, 0)) },
                      { id: 'partial', label: 'Valor Manual', desc: '' },
                    ].map(mode => (
                      <button
                        key={mode.id}
                        onClick={() => setReconcileMode(mode.id as any)}
                        className={`w-full flex items-center justify-between p-4 rounded-2xl border text-left transition-all ${reconcileMode === mode.id ? 'bg-brand-50 border-brand-200 text-brand-700' : 'bg-slate-50 border-slate-50 text-slate-500'}`}
                      >
                        <span className="text-xs font-bold">{mode.label}</span>
                        {mode.desc && <span className="text-xs font-bold">{mode.desc}</span>}
                      </button>
                    ))}
                    {reconcileMode === 'partial' && (
                      <input
                        type="number"
                        value={partialValue}
                        onChange={e => setPartialValue(Number(e.target.value))}
                        placeholder="0,00"
                        className="w-full bg-slate-50 border border-brand-200 rounded-2xl p-4 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    )}
                  </div>

                  <div className="pt-2">
                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mb-1">Valor a Conciliar</p>
                    <p className="text-3xl font-bold text-slate-900 tracking-tighter">{formatCurrency(getEffectiveTotal())}</p>
                  </div>

                  <button
                    onClick={handleFinalize}
                    disabled={saveStatus === 'saving' || saveStatus === 'done'}
                    className={`w-full py-4 rounded-2xl text-sm font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                      saveStatus === 'done' ? 'bg-emerald-500 text-white' :
                      saveStatus === 'saving' ? 'bg-brand-400 text-white' :
                      'bg-slate-900 text-white hover:bg-brand-600 shadow-xl'
                    }`}
                  >
                    {saveStatus === 'done' ? <><Check size={18} /> Salvo!</> :
                     saveStatus === 'saving' ? <><Loader2 size={18} className="animate-spin" /> Salvando...</> :
                     <><ArrowRight size={18} /> Finalizar & Conciliar</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'comparative' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Comparador de Preços</h2>
                <p className="text-xs text-slate-400">Evolução e comparativo entre estabelecimentos</p>
              </div>
              <div className="flex gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input
                    type="text"
                    placeholder="Buscar produto..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-9 pr-4 py-2 bg-white border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500/20 shadow-sm"
                  />
                </div>
              </div>
            </div>

            {isLoadingIntelligence ? (
              <div className="py-32 flex flex-col items-center gap-3">
                <Loader2 size={32} className="animate-spin text-slate-200" />
                <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">Carregando inteligência...</p>
              </div>
            ) : comparisonData.length === 0 ? (
              <div className="py-32 flex flex-col items-center gap-4 text-center">
                <div className="w-16 h-16 bg-slate-50 rounded-[20px] flex items-center justify-center text-slate-300">
                  <BarChart3 size={28} />
                </div>
                <p className="text-sm font-bold text-slate-400">Nenhum dado ainda</p>
                <p className="text-xs text-slate-300">Escaneie cupons para ver o comparativo de preços</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {comparisonData
                  .filter(p => !searchTerm || p.name.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map((product: any) => (
                    <div key={product.id} className="bg-white border border-slate-100 rounded-[24px] p-6 shadow-sm space-y-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm uppercase leading-tight">{product.name}</h4>
                          <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-1">{product.category}</p>
                        </div>
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${product.trend === 'up' ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-500'}`}>
                          {product.trend === 'up' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-50 rounded-2xl p-3">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Médio</p>
                          <p className="text-sm font-bold text-slate-900 mt-0.5">{formatCurrency(product.avgPrice)}</p>
                        </div>
                        <div className="bg-emerald-50 rounded-2xl p-3">
                          <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">Menor</p>
                          <p className="text-sm font-bold text-emerald-700 mt-0.5">{formatCurrency(product.minPrice)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                        <MapPin size={10} />
                        <span className="truncate">{product.bestMerchant}</span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'shopping' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Lista de Compras Inteligente</h2>
              <p className="text-xs text-slate-400">Baseada nos seus padrões de consumo</p>
            </div>

            {isLoadingIntelligence ? (
              <div className="py-32 flex flex-col items-center gap-3">
                <Loader2 size={32} className="animate-spin text-slate-200" />
              </div>
            ) : comparisonData.length === 0 ? (
              <div className="py-32 flex flex-col items-center gap-4 text-center">
                <div className="w-16 h-16 bg-slate-50 rounded-[20px] flex items-center justify-center text-slate-300">
                  <ShoppingCart size={28} />
                </div>
                <p className="text-sm font-bold text-slate-400">Nenhum produto cadastrado</p>
                <p className="text-xs text-slate-300">Escaneie cupons para gerar sua lista automática</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {comparisonData.map((product: any) => (
                  <div key={product.id} className="bg-white border border-slate-100 rounded-[24px] p-6 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-brand-50 rounded-2xl flex items-center justify-center text-brand-500">
                        <ShoppingCart size={18} />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">{product.name}</h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{product.category}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900">{formatCurrency(product.minPrice)}</p>
                      <p className="text-[9px] font-bold text-emerald-500 uppercase">Melhor preço</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Minha Inflação</h2>
              <p className="text-xs text-slate-400">Evolução dos preços dos produtos que você compra</p>
            </div>

            {isLoadingIntelligence ? (
              <div className="py-32 flex flex-col items-center gap-3">
                <Loader2 size={32} className="animate-spin text-slate-200" />
              </div>
            ) : comparisonData.length === 0 ? (
              <div className="py-32 flex flex-col items-center gap-4 text-center">
                <div className="w-16 h-16 bg-slate-50 rounded-[20px] flex items-center justify-center text-slate-300">
                  <TrendingUp size={28} />
                </div>
                <p className="text-sm font-bold text-slate-400">Sem histórico ainda</p>
                <p className="text-xs text-slate-300">Escaneie cupons ao longo do tempo para ver sua inflação</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {comparisonData.map((product: any) => (
                  <div key={product.id} className="bg-white border border-slate-100 rounded-[24px] p-6 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-slate-900 text-sm uppercase">{product.name}</h4>
                      <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
                        product.trend === 'up' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
                      }`}>
                        {product.trend === 'up' ? '▲' : '▼'} {Math.abs(((product.lastPrice - product.avgPrice) / product.avgPrice) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <div>
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">Atual</p>
                        <p className="font-bold text-slate-900">{formatCurrency(product.lastPrice)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">Média</p>
                        <p className="font-bold text-slate-500">{formatCurrency(product.avgPrice)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'wealth' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Diagnóstico FinVision</h2>
                <p className="text-xs text-slate-400">Análise inteligente da sua saúde financeira</p>
              </div>
              <button
                onClick={generateWealthAnalysis}
                disabled={isLoadingWealth}
                className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl text-xs font-bold uppercase tracking-widest shadow-xl hover:bg-brand-600 transition-all disabled:opacity-50"
              >
                {isLoadingWealth ? <Loader2 size={16} className="animate-spin" /> : <Brain size={16} />}
                {isLoadingWealth ? 'Analisando...' : 'Gerar Diagnóstico'}
              </button>
            </div>

            {!wealthAnalysis && !isLoadingWealth && (
              <div className="py-32 flex flex-col items-center gap-4 text-center">
                <div className="w-20 h-20 bg-brand-50 rounded-[24px] flex items-center justify-center text-brand-400">
                  <Brain size={36} />
                </div>
                <p className="text-sm font-bold text-slate-400">Clique em "Gerar Diagnóstico"</p>
                <p className="text-xs text-slate-300 max-w-sm">Nossa IA analisará suas finanças e fornecerá recomendações personalizadas</p>
              </div>
            )}

            {isLoadingWealth && (
              <div className="py-32 flex flex-col items-center gap-3">
                <Loader2 size={40} className="animate-spin text-brand-400" />
                <p className="text-xs font-bold text-brand-600 uppercase tracking-widest">Analisando sua saúde financeira...</p>
              </div>
            )}

            {wealthAnalysis && (
              <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-8">
                <div className="prose prose-slate max-w-none text-sm">
                  {wealthAnalysis.split('\n').map((line, i) => (
                    <p key={i} className={line.startsWith('**') ? 'font-bold text-slate-900' : 'text-slate-600'}>
                      {line.replace(/\*\*/g, '')}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AIModule;
