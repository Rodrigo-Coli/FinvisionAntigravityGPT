import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase/client';
import { X, Plus, Trash2, FileText, Upload, HelpCircle, CheckCircle2, Loader2, Sparkles, Building2, Wallet, ArrowRight, Link as LinkIcon, TrendingUp } from 'lucide-react';
import { Liability } from '../../types';

interface RealEstateWizardModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const RealEstateWizardModal: React.FC<RealEstateWizardModalProps> = ({ onClose, onSuccess }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [propertyType, setPropertyType] = useState<'PLANTA' | 'PRONTO'>('PLANTA');

  // Identificação do Imóvel
  const [name, setName] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [acquisitionDate, setAcquisitionDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');

  // Ato e Contrato
  const [downPayments, setDownPayments] = useState<{ amount: number; date: string }[]>([]);
  const [currDownAmount, setCurrDownAmount] = useState('');
  const [currDownDate, setCurrDownDate] = useState('');
  const [contractFile, setContractFile] = useState<File | null>(null);

  // Fase de Obras
  const [constInstallments, setConstInstallments] = useState('');
  const [constAmount, setConstAmount] = useState('');
  const [constStartDate, setConstStartDate] = useState('');
  const [indexType, setIndexType] = useState<'INCC' | 'IPCA' | 'FIXED'>('INCC');
  const [monthlyIndexRate, setMonthlyIndexRate] = useState('0.5');

  // Intermediárias
  const [intermFrequency, setIntermFrequency] = useState('6');
  const [intermAmount, setIntermAmount] = useState('');
  const [intermTotal, setIntermTotal] = useState('');

  // Saldo Final
  const [finalBalance, setFinalBalance] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [adjustBalanceDuringConstruction, setAdjustBalanceDuringConstruction] = useState(true);
  const [postDeliveryIndex, setPostDeliveryIndex] = useState('IPCA + 1%');
  
  // Consórcios
  const [availableConsortia, setAvailableConsortia] = useState<Liability[]>([]);
  const [selectedConsortiaIds, setSelectedConsortiaIds] = useState<string[]>([]);
  const [isLoadingConsortia, setIsLoadingConsortia] = useState(false);

  useEffect(() => {
    fetchConsortia();
  }, []);

  const fetchConsortia = async () => {
    if (!supabase) return;
    setIsLoadingConsortia(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('liabilities')
        .select('*')
        .eq('user_id', user.id)
        .eq('type', 'CONSORTIUM');
      
      if (data) {
        setAvailableConsortia(data.map((l: any) => ({
          id: l.id,
          name: l.name,
          type: l.type,
          totalAmount: Number(l.total_amount),
          remainingBalance: Number(l.remaining_balance),
          metadata: l.metadata
        } as Liability)));
      }
    } catch (e) {
      console.error("Erro ao carregar consórcios:", e);
    } finally {
      setIsLoadingConsortia(false);
    }
  };

  const addDownPayment = () => {
    if (!currDownAmount || !currDownDate) return;
    setDownPayments([...downPayments, { amount: parseFloat(currDownAmount), date: currDownDate }]);
    setCurrDownAmount('');
    setCurrDownDate('');
  };

  const removeDownPayment = (idx: number) => setDownPayments(downPayments.filter((_, i) => i !== idx));

  const [isParsingContract, setIsParsingContract] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setContractFile(file);
    setIsParsingContract(true);

    try {
      // Converte para Base64
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64 = reader.result?.toString().split(',')[1];
        
        if (!supabase) return;

        const { data, error } = await supabase.functions.invoke('parse-real-estate-contract', {
          body: { fileBase64: base64, fileName: file.name }
        });

        if (error) throw error;

        // Preencher o formulário com dados extraídos pela IA
        setName(data.propertyName || '');
        setEstimatedValue(String(data.totalValue) || '');
        setConstAmount(String(data.installmentValue) || '');
        setConstInstallments(String(data.installmentsCount) || '');
        setIndexType(data.indexType || 'INCC');
        setMonthlyIndexRate(String(data.indexMonthlyRate) || '0.65');
        setFinalBalance(String(data.deliveryBalance) || '');
        setAdjustBalanceDuringConstruction(data.adjustBalanceDuringObras ?? true);
        
        // Se houver intermediárias, poderíamos adicionar lógica aqui também
        
        setIsParsingContract(false);
        alert("Contrato analisado com sucesso!");
      };
    } catch (err) {
      console.error("Erro no parsing:", err);
      setIsParsingContract(false);
      alert("Não foi possível analisar o contrato automaticamente. Por favor, preencha os dados manualmente.");
    }
  };

  const handleSave = async () => {
    if (!supabase) return;
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // 1. Ativo Físico
      const { data: assetData, error: assetErr } = await supabase.from('physical_assets').insert([{
        user_id: user.id,
        name: name,
        category: 'REAL_ESTATE',
        estimated_value: parseFloat(estimatedValue) || 0,
        acquisition_date: acquisitionDate || null,
        description: `${description} (${propertyType === 'PLANTA' ? 'Na Planta' : 'Pronto'}). Indice: ${indexType}`
      }]).select().single();

      if (assetErr) throw assetErr;
      const assetId = assetData.id;

      // 2. Passivo (Dívida Total)
      const totalLiabilityAmount = 
        downPayments.reduce((acc, curr) => acc + curr.amount, 0) +
        (parseFloat(constAmount) * (parseInt(constInstallments) || 0)) +
        (parseFloat(intermAmount) * (parseInt(intermTotal) || 0)) +
        (parseFloat(finalBalance) || 0);

      const { data: liabData, error: liabErr } = await supabase.from('liabilities').insert([{
        user_id: user.id,
        name: `Dívida Imob: ${name}`,
        type: 'MORTGAGE',
        total_amount: totalLiabilityAmount,
        remaining_balance: totalLiabilityAmount,
        linked_asset_id: assetId,
        metadata: {
          propertyType,
          index_type: indexType, // Alinhado com a Edge Function
          monthlyIndexRate,
          deliveryDate,
          adjust_balance_during_obras: adjustBalanceDuringConstruction, // Alinhado com a Edge Function
          selectedConsortiaIds,
          isRealEstate: true
        }
      }]).select().single();

      if (liabErr) throw liabErr;
      const liabId = liabData.id;

      // 3. Transações
      const futureTransactions: any[] = [];
      const catName = 'Habitação > Financiamento Imob.';

      // Ato
      downPayments.forEach((dp, i) => {
        futureTransactions.push({
          user_id: user.id,
          description: `ATO ${i + 1}/${downPayments.length} - ${name}`,
          amount: dp.amount,
          date: dp.date,
          type: 'EXPENSE',
          category: catName,
          is_paid: new Date(dp.date) <= new Date(),
          is_amortization: true,
          liability_id: liabId,
          metadata: { type: 'DOWN_PAYMENT' }
        });
      });

      // Parcelas Obras
      if (propertyType === 'PLANTA' && constAmount && constInstallments && constStartDate) {
        let baseVal = parseFloat(constAmount);
        const rate = (parseFloat(monthlyIndexRate) || 0) / 100;
        const startDate = new Date(constStartDate);

        for (let i = 0; i < parseInt(constInstallments); i++) {
          const txDate = new Date(startDate.getFullYear(), startDate.getMonth() + i, startDate.getDate());
          if (i > 0) baseVal = baseVal * (1 + rate);

          futureTransactions.push({
            user_id: user.id,
            description: `Parcela Obra ${i + 1}/${constInstallments} - ${name}`,
            amount: baseVal,
            date: txDate.toISOString().split('T')[0],
            type: 'EXPENSE',
            category: catName,
            is_paid: false,
            is_amortization: true,
            liability_id: liabId,
            metadata: { 
              installment: i + 1, 
              index_type: indexType, 
              needs_adjustment: indexType !== 'FIXED' 
            }
          });
        }
      }

      // Balões
      if (intermAmount && intermTotal && intermFrequency && constStartDate) {
        const val = parseFloat(intermAmount);
        const total = parseInt(intermTotal);
        const freq = parseInt(intermFrequency);
        const startDate = new Date(constStartDate);

        for (let i = 1; i <= total; i++) {
          const txDate = new Date(startDate.getFullYear(), startDate.getMonth() + (i * freq), startDate.getDate());
          futureTransactions.push({
            user_id: user.id,
            description: `Intermediária ${i}/${total} - ${name}`,
            amount: val,
            date: txDate.toISOString().split('T')[0],
            type: 'EXPENSE',
            category: catName,
            is_paid: false,
            is_amortization: true,
            liability_id: liabId,
            metadata: { type: 'INTERMEDIARY' }
          });
        }
      }

      // Saldo Final
      if (finalBalance && deliveryDate) {
        futureTransactions.push({
          user_id: user.id,
          description: `Saldo Final (Entrega) - ${name}`,
          amount: parseFloat(finalBalance),
          date: deliveryDate,
          type: 'EXPENSE',
          category: catName,
          is_paid: false,
          is_amortization: true,
          liability_id: liabId,
          metadata: { 
            type: 'FINAL_BALANCE', 
            adjust_during_construction: adjustBalanceDuringConstruction,
            linked_consortia: selectedConsortiaIds
          }
        });
      }

      if (futureTransactions.length > 0) {
        await supabase.from('transactions').insert(futureTransactions);
      }

      onSuccess();
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleConsortium = (id: string) => {
    setSelectedConsortiaIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
      <div className="bg-white rounded-[40px] w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] border border-white/20">
        
        {/* HEADER */}
        <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-brand-600 text-white rounded-[22px] flex items-center justify-center shadow-lg shadow-brand-500/20"><Building2 size={28} /></div>
            <div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight italic">Aquisição Imobiliária</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">Formulário Único Inteligente · FV V6</p>
            </div>
          </div>
          <button onClick={onClose} className="w-12 h-12 bg-white border border-slate-100 text-slate-400 hover:text-rose-500 rounded-2xl flex items-center justify-center transition-all shadow-sm"><X size={24} /></button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          
          {/* AI UPLOAD BAR - TOP PRIORITY */}
          <div className="p-10 pb-0">
            <div className={`relative border-2 border-dashed rounded-[32px] p-8 flex flex-col md:flex-row items-center justify-between gap-6 transition-all ${isParsingContract ? 'bg-brand-50 border-brand-500' : 'bg-slate-50/50 border-slate-200 hover:border-brand-500/50'}`}>
              <div className="flex items-center gap-6">
                <div className={`w-16 h-16 rounded-[22px] flex items-center justify-center shadow-sm transition-all ${isParsingContract ? 'bg-brand-600 text-white' : 'bg-white text-slate-300'}`}>
                  {isParsingContract ? <Loader2 size={32} className="animate-spin" /> : <Upload size={32} />}
                </div>
                <div className="text-center md:text-left">
                  <h4 className={`font-black italic ${isParsingContract ? 'text-brand-600' : 'text-slate-900'}`}>
                    {isParsingContract ? 'A IA está lendo seu contrato...' : 'Subir Contrato para Preenchimento Automático'}
                  </h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">A IA identificará parcelas, balões e índices automaticamente.</p>
                </div>
              </div>
              <label className="shrink-0">
                <input type="file" className="hidden" accept=".pdf,.doc,.docx" onChange={handleFileUpload} disabled={isParsingContract} />
                <span className="px-8 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all cursor-pointer shadow-lg shadow-slate-900/10 inline-block">
                  {contractFile ? 'Trocar Arquivo' : 'Selecionar PDF'}
                </span>
              </label>
              {isParsingContract && (
                <div className="absolute inset-0 bg-brand-50/20 backdrop-blur-[1px] rounded-[30px] animate-pulse pointer-events-none" />
              )}
            </div>
          </div>

          <div className="p-10 space-y-16">
            
            {/* SECTION: IDENTIFICATION */}
            <div className="space-y-8">
               <div className="flex items-center justify-between">
                 <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-slate-100 text-slate-900 rounded-xl flex items-center justify-center font-black">1</div>
                    <h4 className="text-xl font-black text-slate-900 italic">Identificação e Status</h4>
                 </div>
                 <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/50">
                   <button onClick={() => setPropertyType('PLANTA')} className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${propertyType === 'PLANTA' ? 'bg-white text-brand-600 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>Na Planta</button>
                   <button onClick={() => setPropertyType('PRONTO')} className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${propertyType === 'PRONTO' ? 'bg-white text-brand-600 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>Pronto</button>
                 </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Nome do Empreendimento / Unidade</label>
                    <input className="w-full h-16 px-8 bg-slate-50 border border-slate-100 rounded-3xl font-black text-slate-900 outline-none focus:ring-4 focus:ring-brand-500/10 transition-all" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Apartamento 402 - Ed. Horizonte" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Avaliação Total (R$)</label>
                    <input type="number" className="w-full h-16 px-8 bg-slate-50 border border-slate-100 rounded-3xl font-black text-slate-900 outline-none" value={estimatedValue} onChange={e => setEstimatedValue(e.target.value)} placeholder="0,00" />
                  </div>
               </div>
            </div>

            {/* SECTION: ATO E ENTRADAS */}
            <div className="space-y-8">
               <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-slate-100 text-slate-900 rounded-xl flex items-center justify-center font-black">2</div>
                  <h4 className="text-xl font-black text-slate-900 italic">Entradas e Fluxo de Ato</h4>
               </div>
               
               <div className="bg-slate-50/50 p-8 rounded-[40px] border border-slate-100 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Valor</label>
                      <input type="number" className="w-full h-14 px-6 bg-white border border-slate-200 rounded-2xl font-bold outline-none" placeholder="R$" value={currDownAmount} onChange={e => setCurrDownAmount(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Data</label>
                      <input type="date" className="w-full h-14 px-6 bg-white border border-slate-200 rounded-2xl font-bold outline-none" value={currDownDate} onChange={e => setCurrDownDate(e.target.value)} />
                    </div>
                    <div className="flex items-end">
                      <button onClick={addDownPayment} className="w-full h-14 bg-brand-600 text-white rounded-2xl flex items-center justify-center gap-3 hover:bg-brand-700 transition-all shadow-lg font-black text-[10px] uppercase tracking-widest"><Plus size={18} /> Adicionar Lançamento</button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                     {downPayments.map((dp, i) => (
                       <div key={i} className="flex justify-between items-center bg-white p-5 rounded-2xl border border-slate-100 shadow-sm group">
                         <div>
                           <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Ato #{i+1}</p>
                           <p className="text-sm font-black text-slate-900">R$ {dp.amount.toLocaleString()}</p>
                           <p className="text-[10px] text-slate-400 font-medium">{new Date(dp.date).toLocaleDateString('pt-BR')}</p>
                         </div>
                         <button onClick={() => removeDownPayment(i)} className="p-2 text-slate-200 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"><Trash2 size={18} /></button>
                       </div>
                     ))}
                  </div>
               </div>
            </div>

            {/* SECTION: OBRAS (CONDITIONAL) */}
            {propertyType === 'PLANTA' && (
              <div className="space-y-8">
                 <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                       <div className="w-8 h-8 bg-slate-100 text-slate-900 rounded-xl flex items-center justify-center font-black">3</div>
                       <h4 className="text-xl font-black text-slate-900 italic">Fase de Obras e Correções</h4>
                    </div>
                    <div className="flex items-center gap-4 bg-brand-900 p-2 px-4 rounded-2xl text-white">
                       <Sparkles size={16} className="text-brand-400" />
                       <span className="text-[10px] font-black uppercase tracking-widest">IA monitorando INCC/IPCA</span>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                    <div className="space-y-6">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-4">Parcelamento Construtora</p>
                       <div className="bg-slate-50/50 p-8 rounded-[40px] border border-slate-100 space-y-6">
                          <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Qtd Parcelas</label>
                              <input type="number" className="w-full h-14 px-6 bg-white border border-slate-100 rounded-2xl font-black outline-none" value={constInstallments} onChange={e => setConstInstallments(e.target.value)} placeholder="00" />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Valor Base</label>
                              <input type="number" className="w-full h-14 px-6 bg-white border border-slate-100 rounded-2xl font-black outline-none" value={constAmount} onChange={e => setConstAmount(e.target.value)} placeholder="R$" />
                            </div>
                          </div>
                          <div className="space-y-2">
                             <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Início dos Pagamentos</label>
                             <input type="date" className="w-full h-14 px-6 bg-white border border-slate-100 rounded-2xl font-black outline-none" value={constStartDate} onChange={e => setConstStartDate(e.target.value)} />
                          </div>
                       </div>
                    </div>

                    <div className="space-y-6">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-4">Intermediárias / Balões</p>
                       <div className="bg-slate-50/50 p-8 rounded-[40px] border border-slate-100 space-y-6">
                          <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Freq. (Meses)</label>
                              <select className="w-full h-14 px-6 bg-white border border-slate-100 rounded-2xl font-black outline-none appearance-none" value={intermFrequency} onChange={e => setIntermFrequency(e.target.value)}>
                                <option value="3">Trimestral</option>
                                <option value="6">Semestral</option>
                                <option value="12">Anual</option>
                              </select>
                            </div>
                            <div className="space-y-2">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Total Balões</label>
                              <input type="number" className="w-full h-14 px-6 bg-white border border-slate-100 rounded-2xl font-black outline-none" value={intermTotal} onChange={e => setIntermTotal(e.target.value)} placeholder="Ex: 4" />
                            </div>
                          </div>
                          <div className="space-y-2">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Valor de Cada Balão</label>
                              <input type="number" className="w-full h-14 px-6 bg-white border border-slate-100 rounded-2xl font-black outline-none" value={intermAmount} onChange={e => setIntermAmount(e.target.value)} placeholder="R$" />
                          </div>
                       </div>
                    </div>
                 </div>

                 {/* INDEXATION SETTINGS */}
                 <div className="bg-brand-900 p-10 rounded-[40px] text-white flex flex-col md:flex-row justify-between items-center gap-10">
                    <div className="space-y-2">
                      <h5 className="text-lg font-black italic flex items-center gap-3"><Sparkles className="text-brand-400" /> Correção Monetária Inteligente</h5>
                      <p className="text-xs text-brand-300 font-medium max-w-md">O sistema buscará mensalmente o índice atualizado para ajustar suas parcelas futuras. Defina a estimativa base abaixo.</p>
                    </div>
                    <div className="flex gap-4 p-2 bg-white/5 rounded-3xl border border-white/10">
                       <div className="space-y-1 px-4">
                         <p className="text-[8px] font-black text-brand-400 uppercase tracking-widest">Índice</p>
                         <select className="bg-transparent font-black text-white outline-none cursor-pointer" value={indexType} onChange={e => setIndexType(e.target.value as any)}>
                           <option value="INCC" className="text-slate-900">INCC (Obra)</option>
                           <option value="IPCA" className="text-slate-900">IPCA</option>
                           <option value="FIXED" className="text-slate-900">FIXO</option>
                         </select>
                       </div>
                       <div className="w-px h-10 bg-white/10 self-center" />
                       <div className="space-y-1 px-4">
                         <p className="text-[8px] font-black text-brand-400 uppercase tracking-widest">Média Estimada</p>
                         <div className="flex items-center gap-2">
                            <input type="number" className="w-16 bg-transparent font-black text-white outline-none" value={monthlyIndexRate} onChange={e => setMonthlyIndexRate(e.target.value)} />
                            <span className="text-xs font-black">% am</span>
                         </div>
                       </div>
                    </div>
                 </div>
              </div>
            )}

            {/* SECTION: SALDO FINAL E ENTREGA */}
            <div className="space-y-8">
               <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-slate-100 text-slate-900 rounded-xl flex items-center justify-center font-black">4</div>
                  <h4 className="text-xl font-black text-slate-900 italic">Saldo Final e Entrega das Chaves</h4>
               </div>

               <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                  <div className="bg-slate-50/50 p-8 rounded-[40px] border border-slate-100 space-y-8">
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Saldo a Financiar (Entrega)</label>
                          <input type="number" className="w-full h-16 px-8 bg-white border border-slate-100 rounded-3xl font-black text-slate-900 outline-none" value={finalBalance} onChange={e => setFinalBalance(e.target.value)} placeholder="R$ 0,00" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Data de Entrega (Prevista)</label>
                          <input type="date" className="w-full h-16 px-8 bg-white border border-slate-100 rounded-3xl font-black text-slate-900 outline-none" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
                        </div>
                     </div>

                     <div className="p-6 bg-white border border-slate-100 rounded-3xl flex items-center justify-between group">
                        <div className="flex items-center gap-4">
                           <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${adjustBalanceDuringConstruction ? 'bg-brand-50 text-brand-600' : 'bg-slate-50 text-slate-300'}`}><TrendingUp size={20} /></div>
                           <div>
                              <p className="text-xs font-black text-slate-900 uppercase tracking-tight italic">Reajustar Saldo Durante a Obra?</p>
                              <p className="text-[9px] text-slate-400 font-medium">O saldo subirá mensalmente pelo índice {indexType}.</p>
                           </div>
                        </div>
                        <button onClick={() => setAdjustBalanceDuringConstruction(!adjustBalanceDuringConstruction)} className={`w-14 h-8 rounded-full p-1.5 transition-all flex items-center ${adjustBalanceDuringConstruction ? 'bg-brand-600' : 'bg-slate-200'}`}>
                           <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-all transform ${adjustBalanceDuringConstruction ? 'translate-x-6' : ''}`} />
                        </button>
                     </div>
                  </div>

                  <div className="bg-slate-50/50 p-8 rounded-[40px] border border-slate-100 space-y-6">
                     <div className="flex items-center justify-between">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 italic">Substituição por Consórcio</p>
                       <span className="text-[9px] font-black text-brand-600 bg-brand-50 px-3 py-1 rounded-full uppercase tracking-tighter">Opcional</span>
                     </div>
                     
                     <div className="space-y-3">
                        {isLoadingConsortia ? (
                          <div className="flex items-center gap-2 text-slate-400 p-4"><Loader2 size={16} className="animate-spin" /> <span className="text-[10px] font-bold uppercase tracking-widest">Buscando Consórcios...</span></div>
                        ) : availableConsortia.length > 0 ? (
                          availableConsortia.map(c => (
                            <button 
                              key={c.id} 
                              onClick={() => toggleConsortium(c.id)}
                              className={`w-full p-4 rounded-2xl border transition-all flex items-center justify-between text-left group ${selectedConsortiaIds.includes(c.id) ? 'bg-brand-600 border-brand-600 text-white shadow-lg' : 'bg-white border-slate-100 text-slate-600 hover:border-brand-200'}`}
                            >
                              <div className="flex items-center gap-4">
                                <Wallet size={18} className={selectedConsortiaIds.includes(c.id) ? 'text-white' : 'text-slate-300 group-hover:text-brand-400'} />
                                <div>
                                  <p className="text-xs font-black uppercase tracking-tight">{c.name}</p>
                                  <p className={`text-[10px] font-bold ${selectedConsortiaIds.includes(c.id) ? 'text-brand-200' : 'text-slate-400'}`}>Saldo: R$ {c.remainingBalance.toLocaleString()}</p>
                                </div>
                              </div>
                              <div className={`w-6 h-6 rounded-lg flex items-center justify-center border ${selectedConsortiaIds.includes(c.id) ? 'border-white/30 bg-white/10' : 'border-slate-100'}`}>
                                {selectedConsortiaIds.includes(c.id) && <CheckCircle2 size={14} />}
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="p-6 text-center border-2 border-dashed border-slate-100 rounded-3xl">
                            <p className="text-[10px] text-slate-300 font-black uppercase tracking-widest">Nenhum consórcio encontrado</p>
                            <p className="text-[8px] text-slate-400 mt-1 uppercase">Cadastre consórcios na aba de passivos para vinculá-los aqui.</p>
                          </div>
                        )}
                     </div>
                  </div>
               </div>
            </div>
          </div>
        </div>

        {/* FOOTER ACTIONS */}
        <div className="px-10 py-10 border-t border-slate-100 bg-slate-50 flex flex-col md:flex-row items-center justify-between gap-8 shrink-0">
           <div className="flex items-center gap-6">
              <div className="text-center md:text-left">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Impacto Patrimonial Estimado</p>
                <div className="flex items-baseline gap-2">
                   <h5 className="text-2xl font-black text-slate-900 italic">R$ {(parseFloat(estimatedValue) || 0).toLocaleString()}</h5>
                   <span className="text-[10px] font-black text-emerald-500 uppercase tracking-tighter">+ Ativo Físico</span>
                </div>
              </div>
              <div className="w-px h-10 bg-slate-200 hidden md:block" />
              <div className="text-center md:text-left hidden md:block">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Dívida Estruturada</p>
                <div className="flex items-baseline gap-2">
                   <h5 className="text-2xl font-black text-rose-500 italic">R$ {((downPayments.reduce((acc, curr) => acc + curr.amount, 0) + (parseFloat(constAmount) * (parseInt(constInstallments) || 0)) + (parseFloat(intermAmount) * (parseInt(intermTotal) || 0)) + (parseFloat(finalBalance) || 0))).toLocaleString()}</h5>
                   <span className="text-[10px] font-black text-rose-400 uppercase tracking-tighter">+ Passivo Imob.</span>
                </div>
              </div>
           </div>

           <div className="flex gap-4 w-full md:w-auto">
             <button 
               onClick={onClose} 
               className="flex-1 md:flex-none px-10 py-5 bg-white border border-slate-200 text-slate-400 rounded-3xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all"
             >
               Descartar
             </button>
             
             <button 
               disabled={isSubmitting || !name || !estimatedValue} 
               onClick={handleSave} 
               className="flex-[2] md:flex-none px-12 py-5 bg-slate-900 text-white rounded-3xl text-[10px] font-black uppercase tracking-widest shadow-2xl shadow-slate-200 hover:bg-brand-600 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
             >
               {isSubmitting ? (
                 <>
                   <Loader2 size={16} className="animate-spin" />
                   Consolidando Estrutura...
                 </>
               ) : (
                 <>
                   Gerar Registro Patrimonial e Parcelas
                   <ArrowRight size={16} />
                 </>
               )}
             </button>
           </div>
        </div>
      </div>
    </div>
  );
};


