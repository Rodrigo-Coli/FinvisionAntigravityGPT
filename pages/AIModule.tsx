
import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, BarChart3, Store, Receipt, Check, Loader2, Tag, ArrowRight, ShoppingCart, Calculator, Hash, TrendingUp, TrendingDown, MapPin, Search, Filter, Calendar } from 'lucide-react';
import { AIReconcileService } from '../services/aiReconcile.service';
import { ExtractedReceipt, ReceiptItem, Profile } from '../types';
import { supabase } from './../lib/supabase/client';

const AIModule: React.FC<{ user: Profile }> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'history' | 'comparative'>('upload');
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

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchAccounts();
    if (activeTab !== 'upload') {
      fetchIntelligenceData();
    }
  }, [activeTab]);

  const fetchAccounts = async () => {
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

      // Processar dados para o comparativo
      const processed = data.map((prod: any) => {
        const prices = prod.product_prices || [];
        if (prices.length === 0) return null;

        const validPrices = prices.filter((p: any) => !p.exclude_from_stats);
        const avgPrice = validPrices.reduce((sum: number, p: any) => sum + p.unit_price, 0) / (validPrices.length || 1);
        const minPriceObj = prices.reduce((min: any, p: any) => p.unit_price < min.unit_price ? p : min, prices[0]);
        const lastPrice = prices[prices.length - 1];

        return {
          id: prod.id,
          name: prod.name,
          category: prod.category || 'Geral',
          avgPrice,
          minPrice: minPriceObj.unit_price,
          bestMerchant: minPriceObj.ai_documents?.merchant_raw || 'N/A',
          lastPrice: lastPrice.unit_price,
          lastMerchant: lastPrice.ai_documents?.merchant_raw || 'N/A',
          trend: lastPrice.unit_price > avgPrice ? 'up' : 'down',
          history: prices
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
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setReceipt(null);

    try {
      const data = await AIReconcileService.processReceiptItems(file);
      if (data.items) {
        data.items = data.items.map((it: any) => ({ ...it, selected: true }));
      }
      setReceipt(data);
      setPartialValue(data.total);
    } catch (err: any) {
      alert(err.message || 'Erro ao processar cupom.');
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleItemSelection = (index: number) => {
    if (!receipt) return;
    const newItems = [...receipt.items];
    newItems[index].selected = !newItems[index].selected;
    setReceipt({ ...receipt, items: newItems });
  };

  const getReconcileAmount = () => {
    if (!receipt) return 0;
    if (reconcileMode === 'total') return receipt.total;
    if (reconcileMode === 'partial') return partialValue;
    return receipt.items.filter(it => it.selected).reduce((sum, it) => sum + it.total_price, 0);
  };

  const handleFinalize = async () => {
    if (!receipt) return;
    setSaveStatus('saving');

    try {
      await AIReconcileService.saveReceiptToLabs(receipt);
      const finalAmount = getReconcileAmount();

      await AIReconcileService.saveToReconcileQueue([{
        date: receipt.date,
        description: `Compra: ${receipt.merchant} (${reconcileMode})`,
        amount: finalAmount,
        type: 'debit',
        source: 'AI Labs',
        confidence: 1
      }], 'null', 'A Conciliar'); // Enviando para um alvo genérico de conciliação

      setSaveStatus('done');
      setTimeout(() => {
        setReceipt(null);
        setSaveStatus('idle');
      }, 2000);
    } catch (err: any) {
      alert(err.message);
      setSaveStatus('idle');
    }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <div className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8 space-y-10">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-display font-black text-slate-900 tracking-tight">AI & <span className="text-brand-600 italic">Labs</span></h1>
            <div className="px-3 py-1 bg-brand-50 text-brand-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-brand-100">Inteligência de Varejo</div>
          </div>
          <p className="text-slate-500 font-medium text-lg">Central de Economia e Laboratório de Preços</p>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-10 border-b border-slate-200/50 overflow-x-auto scrollbar-hide">
        {[
          { id: 'upload', label: 'Scanner de Cupom', icon: <Receipt size={14} /> },
          { id: 'comparative', label: 'Comparador de Preços', icon: <Store size={14} /> },
          { id: 'history', label: 'Laboratório de Inflação', icon: <BarChart3 size={14} /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`pb-4 px-1 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === tab.id ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div className="pt-4">
        {activeTab === 'upload' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            {/* Esquerda: Upload e Lista de Itens */}
            <div className="lg:col-span-2 space-y-8">
              {!receipt ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`bg-white border-2 border-dashed rounded-[40px] p-20 flex flex-col items-center justify-center transition-all min-h-[400px] cursor-pointer hover:bg-slate-50/50 ${isProcessing ? 'border-brand-400 animate-pulse' : 'border-slate-200 hover:border-brand-400'}`}
                >
                  <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,application/pdf" />
                  {isProcessing ? (
                    <div className="text-center group">
                      <Loader2 className="w-16 h-16 text-brand-600 animate-spin mx-auto mb-6" />
                      <h3 className="text-2xl font-black text-slate-900 uppercase tracking-widest">Lendo Itens...</h3>
                      <p className="text-sm text-slate-400 mt-2 font-bold uppercase">A IA está decifrando o cupom fiscal</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="w-20 h-20 bg-slate-50 rounded-[28px] flex items-center justify-center text-slate-400 mx-auto mb-8 shadow-inner">
                        <Hash size={40} />
                      </div>
                      <h3 className="text-3xl font-black text-slate-900 mb-3 tracking-tight">O que você comprou?</h3>
                      <p className="text-slate-500 font-medium mb-10 max-w-xs mx-auto text-lg leading-relaxed">Envie um Cupom Fiscal para extrair itens e comparar preços.</p>
                      <button className="px-10 py-4 bg-slate-900 text-white rounded-[20px] font-black text-xs uppercase tracking-widest shadow-2xl hover:bg-brand-600 transition-all">Selecionar Documento</button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-[40px] border border-slate-100 shadow-xl overflow-hidden animate-in slide-in-from-bottom-5 duration-500">
                  <div className="p-8 border-b border-slate-50 bg-slate-50/30 flex justify-between items-center">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase italic">{receipt.merchant}</h2>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">{new Date(receipt.date).toLocaleDateString('pt-BR')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Total do Cupom</p>
                      <p className="text-3xl font-black text-brand-600 tracking-tighter">{formatCurrency(receipt.total)}</p>
                    </div>
                  </div>

                  <div className="max-h-[500px] overflow-y-auto divide-y divide-slate-50">
                    {receipt.items.map((item, idx) => (
                      <div
                        key={idx}
                        onClick={() => toggleItemSelection(idx)}
                        className={`p-6 flex items-center justify-between transition-colors cursor-pointer ${item.selected ? 'bg-white' : 'bg-slate-50/50 opacity-40 hover:opacity-100'}`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${item.selected ? 'bg-brand-50 text-brand-600' : 'bg-slate-100 text-slate-400'}`}>
                            {item.selected ? <ShoppingCart size={20} /> : <Tag size={20} />}
                          </div>
                          <div>
                            <h4 className="font-black text-slate-900 leading-tight">{item.description}</h4>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                              {item.quantity} {item.unit} × {formatCurrency(item.unit_price)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-slate-900">{formatCurrency(item.total_price)}</p>
                          {item.category_hint && (
                            <span className="text-[8px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-black uppercase tracking-tighter">
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

            {/* Direita: Opções de Conciliação */}
            <div className="space-y-8">
              {receipt && (
                <div className="bg-white rounded-[40px] border border-brand-100 shadow-2xl p-8 sticky top-24 animate-in fade-in zoom-in-95 duration-500">
                  <div className="flex items-center gap-3 mb-8">
                    <div className="w-10 h-10 bg-brand-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-brand-500/30">
                      <Check size={20} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-900 tracking-tight">Finalizar Compra</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Enviar para Conciliação</p>
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
                          className={`p-3 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${reconcileMode === mode.id
                            ? 'border-brand-600 bg-brand-50 text-brand-600'
                            : 'border-slate-50 bg-slate-50 text-slate-400 hover:border-slate-200'}`}
                        >
                          {mode.icon}
                          <span className="text-[9px] font-black uppercase tracking-widest">{mode.label}</span>
                        </button>
                      ))}
                    </div>

                    {reconcileMode === 'partial' && (
                      <div className="p-5 bg-slate-50 rounded-3xl border border-slate-100 animate-in slide-in-from-top-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Valor para Conciliação</label>
                        <div className="relative">
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 text-lg font-black text-slate-400 tracking-tighter">R$</span>
                          <input
                            type="number"
                            value={partialValue}
                            onChange={(e) => setPartialValue(Number(e.target.value))}
                            className="bg-transparent w-full text-3xl font-black text-slate-900 pl-8 focus:outline-none"
                          />
                        </div>
                      </div>
                    )}

                    <div className="p-6 bg-brand-600 rounded-[32px] text-white shadow-xl shadow-brand-500/20">
                      <div className="flex justify-between items-center mb-1 opacity-60">
                        <span className="text-[10px] font-black uppercase tracking-widest">Valor Filtrado</span>
                        <Calculator size={14} />
                      </div>
                      <p className="text-4xl font-black tracking-tighter italic">
                        {formatCurrency(getReconcileAmount())}
                      </p>
                    </div>

                    {/* Removido seletor de conta para enviar direto para conciliação global */}

                    <button
                      onClick={handleFinalize}
                      disabled={saveStatus !== 'idle'}
                      className={`w-full h-20 rounded-[28px] font-black text-xs uppercase tracking-[0.2em] shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-4 ${saveStatus === 'done'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-900 text-white hover:bg-brand-600 shadow-slate-900/20 hover:shadow-brand-500/30'}`}
                    >
                      {saveStatus === 'saving' ? <Loader2 className="animate-spin" /> : saveStatus === 'done' ? <Check /> : <Sparkles />}
                      {saveStatus === 'saving' ? 'PROCESSANDO...' : saveStatus === 'done' ? 'SUCESSO!' : 'FINALIZAR E ENVIAR'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'comparative' && (
          <div className="space-y-10 animate-in fade-in duration-700">
            {/* Filtros e Busca */}
            <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
              <div className="relative w-full md:w-96 group">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-600 transition-colors" size={18} />
                <input
                  type="text"
                  placeholder="Buscar produto ou categoria..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-16 bg-white border border-slate-200 rounded-[20px] pl-16 pr-6 font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all shadow-sm"
                />
              </div>
              <div className="flex gap-4">
                <button className="h-16 px-8 bg-white border border-slate-200 rounded-[20px] text-[10px] font-black uppercase tracking-widest text-slate-600 flex items-center gap-3 hover:bg-slate-50 transition-all">
                  <Filter size={16} /> Filtrar
                </button>
                <button onClick={fetchIntelligenceData} className="w-16 h-16 bg-brand-50 text-brand-600 rounded-[20px] flex items-center justify-center hover:bg-brand-100 transition-all">
                  <TrendingUp size={20} />
                </button>
              </div>
            </div>

            {/* Grid de Comparativo */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {isLoadingIntelligence ? (
                Array(6).fill(0).map((_, i) => (
                  <div key={i} className="h-64 bg-slate-100 animate-pulse rounded-[40px]"></div>
                ))
              ) : (
                comparisonData
                  .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.category.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map((product) => (
                    <div key={product.id} className="bg-white rounded-[40px] border border-slate-100 p-8 shadow-sm hover:shadow-xl transition-all group">
                      <div className="flex justify-between items-start mb-6">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${product.trend === 'down' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                          {product.trend === 'down' ? <TrendingDown size={24} /> : <TrendingUp size={24} />}
                        </div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1 rounded-full">{product.category}</span>
                      </div>

                      <h3 className="text-xl font-black text-slate-900 mb-2 group-hover:text-brand-600 transition-colors uppercase">{product.name}</h3>

                      <div className="space-y-4 pt-4 border-t border-slate-50">
                        <div className="flex justify-between items-center text-sm">
                          <span className="font-bold text-slate-400 uppercase tracking-tighter">Preço Médio</span>
                          <span className="font-black text-slate-900">{formatCurrency(product.avgPrice)}</span>
                        </div>
                        <div className="flex justify-between items-center p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                          <div className="flex flex-col">
                            <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Melhor Preço</span>
                            <span className="text-xs font-black text-emerald-700 truncate max-w-[120px] uppercase">{product.bestMerchant}</span>
                          </div>
                          <span className="text-lg font-black text-emerald-600">{formatCurrency(product.minPrice)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm px-1">
                          <div className="flex items-center gap-2 text-slate-400">
                            <MapPin size={12} />
                            <span className="text-[10px] font-black uppercase tracking-tighter">Última Compra</span>
                          </div>
                          <span className="text-xs font-bold text-slate-600 uppercase">{product.lastMerchant}</span>
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </div>

            {comparisonData.length === 0 && !isLoadingIntelligence && (
              <div className="py-20 text-center space-y-6">
                <div className="w-20 h-20 bg-slate-50 text-slate-200 rounded-[32px] flex items-center justify-center mx-auto shadow-inner">
                  <Store size={40} />
                </div>
                <h3 className="text-2xl font-black text-slate-400 uppercase tracking-widest">Aguardando dados de cupons...</h3>
                <p className="text-slate-500 max-w-sm mx-auto">Comece a escanear seus cupons na primeira aba para alimentar seu comparador de preços.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-10 animate-in fade-in duration-700">
            {/* Dashboard de Inflação Pessoal */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="col-span-1 md:col-span-2 bg-slate-900 rounded-[40px] p-10 text-white relative overflow-hidden">
                <div className="relative z-10 space-y-6">
                  <div className="flex items-center gap-3">
                    <Calendar size={20} className="text-brand-400" />
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Laboratório de Inflação</h3>
                  </div>
                  <h2 className="text-4xl font-black tracking-tighter">Variação Real de Preços</h2>
                  <p className="text-slate-400 max-w-xs font-medium">Análise granular baseada no seu comportamento de consumo real nos últimos 30 dias.</p>
                  <div className="flex gap-10 mt-10">
                    <div>
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Analisado</p>
                      <p className="text-3xl font-black">{comparisonData.length} <span className="text-sm font-medium text-slate-500">Itens</span></p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Economia Potencial</p>
                      <p className="text-3xl font-black text-emerald-400">R$ 142<span className="text-sm font-medium text-slate-500">.80</span></p>
                    </div>
                  </div>
                </div>
                <div className="absolute right-0 top-0 w-1/2 h-full opacity-10">
                  <BarChart3 size={400} />
                </div>
              </div>

              <div className="bg-white rounded-[40px] border border-slate-100 p-10 flex flex-col justify-between shadow-sm">
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loja Mais Barata</h4>
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-brand-50 text-brand-600 rounded-2xl flex items-center justify-center">
                      <Store size={28} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Assaí Atacadista</h3>
                      <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest">-12% vs Média</p>
                    </div>
                  </div>
                </div>
                <div className="pt-8 border-t border-slate-50 mt-8">
                  <button className="w-full h-14 bg-slate-50 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-all">Ver Detalhes das Lojas</button>
                </div>
              </div>
            </div>

            {/* Lista de Inflação por Item */}
            <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-8 border-b border-slate-50 flex justify-between items-center">
                <h3 className="font-black text-slate-900 uppercase tracking-widest text-xs italic">Índice de Preços por Categoria</h3>
              </div>
              <div className="divide-y divide-slate-50">
                {comparisonData.slice(0, 5).map((product, idx) => (
                  <div key={idx} className="p-8 flex items-center justify-between hover:bg-slate-50/50 transition-all">
                    <div className="flex items-center gap-6">
                      <div className="text-2xl font-black text-slate-100 italic w-10">0{idx + 1}</div>
                      <div>
                        <h4 className="font-black text-slate-900 uppercase">{product.name}</h4>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{product.category}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-20">
                      <div className="hidden md:block">
                        <p className="text-[9px] font-black text-slate-300 uppercase tracking-tighter mb-1">Histórico</p>
                        <div className="flex gap-1">
                          {Array(8).fill(0).map((_, i) => (
                            <div key={i} className={`w-1.5 rounded-full ${i === 7 ? 'h-4 bg-brand-500' : 'h-2 bg-slate-100'}`}></div>
                          ))}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-xl font-black ${product.trend === 'up' ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {product.trend === 'up' ? '+' : '-'}{Math.round(Math.abs((product.lastPrice - product.avgPrice) / product.avgPrice) * 100)}%
                        </p>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">vs Média</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIModule;
