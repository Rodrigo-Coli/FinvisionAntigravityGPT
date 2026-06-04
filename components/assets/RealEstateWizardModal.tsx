import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase/client';
import { X, Plus, Trash2, Upload, Loader2, Building2, Wallet, ArrowRight, TrendingUp, HelpCircle } from 'lucide-react';
import { Liability } from '../../types';

interface RealEstateWizardModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const RealEstateWizardModal: React.FC<RealEstateWizardModalProps> = ({ onClose, onSuccess }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [propertyStage, setPropertyStage] = useState<'PLANTA' | 'PRONTO'>('PRONTO');

  // Identificação do Imóvel
  const [name, setName] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [acquisitionDate, setAcquisitionDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');

  // Entradas (Down Payments List)
  const [downPayments, setDownPayments] = useState<{ amount: number; date: string; label: string }[]>([]);
  const [inputDownAmount, setInputDownAmount] = useState('');
  const [inputDownDate, setInputDownDate] = useState(new Date().toISOString().split('T')[0]);
  const [inputDownFrequency, setInputDownFrequency] = useState<'SINGLE' | 'MONTHLY' | 'QUARTERLY' | 'SEMESTRAL'>('SINGLE');
  const [inputDownCount, setInputDownCount] = useState('1');

  // Intermediárias (Balloons List)
  const [balloons, setBalloons] = useState<{ amount: number; date: string; label: string }[]>([]);
  const [inputBalloonAmount, setInputBalloonAmount] = useState('');
  const [inputBalloonDate, setInputBalloonDate] = useState(new Date().toISOString().split('T')[0]);
  const [inputBalloonFrequency, setInputBalloonFrequency] = useState<'SINGLE' | 'MONTHLY' | 'QUARTERLY' | 'SEMESTRAL'>('SINGLE');
  const [inputBalloonCount, setInputBalloonCount] = useState('1');

  // Financiamento (Funding & Amortization)
  const [financingAmount, setFinancingAmount] = useState('');
  const [financingStartDate, setFinancingStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [financingInstallmentsCount, setFinancingInstallmentsCount] = useState('120');
  const [financingInterestRate, setFinancingInterestRate] = useState('0.8'); // % ao mês
  const [financingIndexType, setFinancingIndexType] = useState<'INCC' | 'IPCA' | 'IGP-M' | 'FIXED'>('FIXED');
  const [financingIndexRate, setFinancingIndexRate] = useState('0.0'); // % ao mês reajuste
  const [amortizationType, setAmortizationType] = useState<'SAC' | 'PRICE'>('SAC');

  // Consórcio Integrado
  const [availableConsortia, setAvailableConsortia] = useState<Liability[]>([]);
  const [selectedConsortiumId, setSelectedConsortiumId] = useState<string>('');
  const [isLoadingConsortia, setIsLoadingConsortia] = useState(false);

  // Contract Upload parsing
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [isParsingContract, setIsParsingContract] = useState(false);

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
        .eq('type', 'CONSORTIUM')
        .eq('is_archived', false);
      
      if (data) {
        setAvailableConsortia(data.map((l: any) => ({
          id: l.id,
          name: l.name,
          type: l.type,
          totalAmount: Number(l.total_amount),
          remainingBalance: Number(l.remaining_balance),
          installmentAmount: l.installment_amount ? Number(l.installment_amount) : undefined,
          metadata: l.metadata || {}
        } as Liability)));
      }
    } catch (e) {
      console.error("Erro ao carregar consórcios:", e);
    } finally {
      setIsLoadingConsortia(false);
    }
  };

  const addDownPaymentsSeries = () => {
    const amt = parseFloat(inputDownAmount);
    if (isNaN(amt) || amt <= 0 || !inputDownDate) return;
    const count = parseInt(inputDownCount) || 1;
    const baseDate = new Date(inputDownDate);
    const newItems: { amount: number; date: string; label: string }[] = [];

    for (let i = 0; i < count; i++) {
      const targetDate = new Date(baseDate);
      if (inputDownFrequency === 'MONTHLY') {
        targetDate.setMonth(baseDate.getMonth() + i);
      } else if (inputDownFrequency === 'QUARTERLY') {
        targetDate.setMonth(baseDate.getMonth() + i * 3);
      } else if (inputDownFrequency === 'SEMESTRAL') {
        targetDate.setMonth(baseDate.getMonth() + i * 6);
      }
      
      newItems.push({
        amount: amt,
        date: targetDate.toISOString().split('T')[0],
        label: count > 1 ? `Entrada ${i + 1}/${count}` : 'Entrada'
      });
    }

    setDownPayments([...downPayments, ...newItems]);
    setInputDownAmount('');
  };

  const removeDownPayment = (idx: number) => setDownPayments(downPayments.filter((_, i) => i !== idx));

  const addBalloonsSeries = () => {
    const amt = parseFloat(inputBalloonAmount);
    if (isNaN(amt) || amt <= 0 || !inputBalloonDate) return;
    const count = parseInt(inputBalloonCount) || 1;
    const baseDate = new Date(inputBalloonDate);
    const newItems: { amount: number; date: string; label: string }[] = [];

    for (let i = 0; i < count; i++) {
      const targetDate = new Date(baseDate);
      if (inputBalloonFrequency === 'MONTHLY') {
        targetDate.setMonth(baseDate.getMonth() + i);
      } else if (inputBalloonFrequency === 'QUARTERLY') {
        targetDate.setMonth(baseDate.getMonth() + i * 3);
      } else if (inputBalloonFrequency === 'SEMESTRAL') {
        targetDate.setMonth(baseDate.getMonth() + i * 6);
      }
      
      newItems.push({
        amount: amt,
        date: targetDate.toISOString().split('T')[0],
        label: count > 1 ? `Intermediária ${i + 1}/${count}` : 'Intermediária'
      });
    }

    setBalloons([...balloons, ...newItems]);
    setInputBalloonAmount('');
  };

  const removeBalloon = (idx: number) => setBalloons(balloons.filter((_, i) => i !== idx));

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setContractFile(file);
    setIsParsingContract(true);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64 = reader.result?.toString().split(',')[1];
        if (!supabase) return;

        const { data, error } = await supabase.functions.invoke('parse-real-estate-contract', {
          body: { fileBase64: base64, fileName: file.name }
        });

        if (error) throw error;

        setName(data.propertyName || '');
        setEstimatedValue(String(data.totalValue) || '');
        setFinancingAmount(String(data.deliveryBalance) || '');
        
        setIsParsingContract(false);
        alert("Contrato analisado com sucesso pela IA!");
      };
    } catch (err) {
      console.error("Erro no upload do contrato:", err);
      setIsParsingContract(false);
      alert("Não foi possível processar o contrato por IA. Complete os dados manualmente.");
    }
  };

  // Helper to generate UUID locally
  const generateUUID = () => {
    return typeof crypto !== 'undefined' && crypto.randomUUID 
      ? crypto.randomUUID() 
      : Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  };

  const handleSave = async () => {
    if (!supabase) return;
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const estimatedAmt = parseFloat(estimatedValue) || 0;
      const initialPurchase = (parseFloat(estimatedValue) || 0);

      // 1. Create the Property asset in physical_assets
      const assetMetadata: Record<string, any> = {
        propertyStage,
        purpose: 'uso',
        purchaseValue: initialPurchase,
        indexType: financingIndexType,
        selectedConsortiumId: selectedConsortiumId || undefined,
        financingType: selectedConsortiumId ? 'CONSORCIO' : 'FINANCING_SCHEDULE'
      };

      const { data: assetData, error: assetErr } = await supabase
        .from('physical_assets')
        .insert([{
          user_id: user.id,
          name: name,
          category: 'REAL_ESTATE',
          estimated_value: estimatedAmt,
          acquisition_date: acquisitionDate || null,
          description: `${description} (${propertyStage === 'PLANTA' ? 'Na Planta' : 'Pronto'}).`,
          metadata: assetMetadata
        }])
        .select()
        .single();

      if (assetErr) throw assetErr;
      const assetId = assetData.id;

      // 2. Resolve or create "Ativos Imobiliários" category
      let categoryId = null;
      const { data: existingCat } = await supabase
        .from('categories')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', 'Ativos Imobiliários')
        .maybeSingle();

      if (existingCat) {
        categoryId = existingCat.id;
      } else {
        const { data: newCat } = await supabase
          .from('categories')
          .insert([{
            user_id: user.id,
            name: 'Ativos Imobiliários',
            type: 'EXPENSE',
            color: 'bg-brand-50 text-brand-600'
          }])
          .select()
          .single();
        if (newCat) categoryId = newCat.id;
      }

      // Provision transactions array
      const futureTransactions: any[] = [];

      // 3. Add Down Payments (Entradas)
      const downPaymentGroupId = downPayments.length > 1 ? generateUUID() : null;
      downPayments.forEach((dp, i) => {
        const dpDate = new Date(dp.date);
        futureTransactions.push({
          user_id: user.id,
          description: `${dp.label} - ${name}`,
          amount: dp.amount,
          date: dp.date,
          type: 'EXPENSE',
          category: 'Ativos Imobiliários',
          subcategory: 'Entrada',
          category_id: categoryId,
          is_paid: dpDate <= new Date(),
          paid_amount: dpDate <= new Date() ? dp.amount : 0,
          paid_at: dpDate <= new Date() ? dp.date : null,
          is_installment: downPayments.length > 1,
          installment_number: downPayments.length > 1 ? i + 1 : null,
          installment_total: downPayments.length > 1 ? downPayments.length : null,
          installment_group_id: downPaymentGroupId,
          metadata: {
            linked_asset_id: assetId,
            property_tx_type: 'DOWN_PAYMENT'
          }
        });
      });

      // 4. Add Balloons (Intermediárias)
      const balloonGroupId = balloons.length > 1 ? generateUUID() : null;
      balloons.forEach((b, i) => {
        const bDate = new Date(b.date);
        futureTransactions.push({
          user_id: user.id,
          description: `${b.label} - ${name}`,
          amount: b.amount,
          date: b.date,
          type: 'EXPENSE',
          category: 'Ativos Imobiliários',
          subcategory: 'Intermediária',
          category_id: categoryId,
          is_paid: bDate <= new Date(),
          paid_amount: bDate <= new Date() ? b.amount : 0,
          paid_at: bDate <= new Date() ? b.date : null,
          is_installment: balloons.length > 1,
          installment_number: balloons.length > 1 ? i + 1 : null,
          installment_total: balloons.length > 1 ? balloons.length : null,
          installment_group_id: balloonGroupId,
          metadata: {
            linked_asset_id: assetId,
            property_tx_type: 'BALLOON'
          }
        });
      });

      // 5. Add Financing / Amortization Schedule (if not paid by consortium)
      const fundingAmount = parseFloat(financingAmount) || 0;
      if (fundingAmount > 0 && financingStartDate) {
        if (selectedConsortiumId) {
          // A consortium handles this: Link this consortium to the property
          await supabase
            .from('liabilities')
            .update({
              linked_asset_id: assetId,
              metadata: {
                propertyType: propertyStage,
                isRealEstate: true
              }
            })
            .eq('id', selectedConsortiumId);

          // Update consortium transactions if any to link to property
          const { data: consTxs } = await supabase
            .from('transactions')
            .select('id, metadata')
            .eq('liability_id', selectedConsortiumId);
          
          if (consTxs) {
            for (const tx of consTxs) {
              const txMeta = { ...(tx.metadata || {}), linked_asset_id: assetId };
              await supabase
                .from('transactions')
                .update({ metadata: txMeta })
                .eq('id', tx.id);
            }
          }
        } else {
          // Calculate SAC/Price Amortization schedule and add transactions
          const n = parseInt(financingInstallmentsCount, 10) || 12;
          const monthlyRate = (parseFloat(financingInterestRate) || 0) / 100;
          const reajusteRate = (parseFloat(financingIndexRate) || 0) / 100;
          const baseStartDate = new Date(financingStartDate);
          const financingGroupId = generateUUID();

          let outstandingBalance = fundingAmount;
          const sacAmortization = fundingAmount / n;

          for (let k = 1; k <= n; k++) {
            let installmentVal = 0;
            if (amortizationType === 'SAC') {
              const interest = outstandingBalance * monthlyRate;
              installmentVal = sacAmortization + interest;
              outstandingBalance -= sacAmortization;
            } else {
              // Price formula: PMT = PV * (i * (1+i)^n) / ((1+i)^n - 1)
              if (monthlyRate === 0) {
                installmentVal = fundingAmount / n;
              } else {
                installmentVal = fundingAmount * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
              }
            }

            // Apply cumulative correction rate
            const adjustedVal = installmentVal * Math.pow(1 + reajusteRate, k);

            const txDate = new Date(baseStartDate);
            txDate.setMonth(baseStartDate.getMonth() + (k - 1));
            const dateStr = txDate.toISOString().split('T')[0];

            futureTransactions.push({
              user_id: user.id,
              description: `Parcela Financiamento ${k}/${n} (${amortizationType}) - ${name}`,
              amount: adjustedVal,
              date: dateStr,
              type: 'EXPENSE',
              category: 'Ativos Imobiliários',
              subcategory: 'Financiamento',
              category_id: categoryId,
              is_paid: false,
              is_installment: true,
              installment_number: k,
              installment_total: n,
              installment_group_id: financingGroupId,
              metadata: {
                linked_asset_id: assetId,
                property_tx_type: 'FINANCING',
                amortization_type: amortizationType
              }
            });
          }
        }
      }

      // Insert all transactions at once
      if (futureTransactions.length > 0) {
        const { error: txErr } = await supabase.from('transactions').insert(futureTransactions);
        if (txErr) throw txErr;
      }

      alert("Ativo Imobiliário criado e transações consolidadas!");
      onSuccess();
    } catch (err: any) {
      alert(`Erro ao cadastrar imóvel: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
      <div className="bg-white rounded-[40px] w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] border border-white/20">
        
        {/* HEADER */}
        <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-slate-900 text-white rounded-[22px] flex items-center justify-center shadow-lg"><Building2 size={28} /></div>
            <div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight italic">Aquisição Imobiliária</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">Lançamento de Imóveis & Cronogramas Financeiros</p>
            </div>
          </div>
          <button onClick={onClose} className="w-12 h-12 bg-white border border-slate-100 text-slate-400 hover:text-rose-500 rounded-2xl flex items-center justify-center transition-all shadow-sm"><X size={24} /></button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          
          {/* AI UPLOAD BAR */}
          <div className="p-10 pb-0">
            <div className={`relative border-2 border-dashed rounded-[32px] p-8 flex flex-col md:flex-row items-center justify-between gap-6 transition-all ${isParsingContract ? 'bg-brand-50 border-brand-500' : 'bg-slate-50/50 border-slate-200 hover:border-brand-500/50'}`}>
              <div className="flex items-center gap-6">
                <div className="w-12 h-12 bg-white text-slate-300 rounded-xl flex items-center justify-center">
                  {isParsingContract ? <Loader2 size={24} className="animate-spin text-brand-600" /> : <Upload size={24} />}
                </div>
                <div>
                  <h4 className="font-black italic text-slate-950">Subir Contrato com IA</h4>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Preenchimento automatizado de valores e parcelas do contrato.</p>
                </div>
              </div>
              <label className="shrink-0">
                <input type="file" className="hidden" accept=".pdf,.doc,.docx" onChange={handleFileUpload} disabled={isParsingContract} />
                <span className="px-8 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all cursor-pointer shadow-lg inline-block">
                  {contractFile ? 'Trocar Arquivo' : 'Upload Contrato'}
                </span>
              </label>
            </div>
          </div>

          <div className="p-10 space-y-10">
            
            {/* STAGE & IDENTIFICATION */}
            <div className="space-y-6">
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                     <div className="w-6 h-6 bg-slate-100 text-slate-950 rounded-lg flex items-center justify-center font-black text-[10px]">1</div>
                     <h4 className="text-lg font-black text-slate-900 italic">Identificação e Status do Imóvel</h4>
                  </div>
                  <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/50">
                    <button onClick={() => setPropertyStage('PRONTO')} className={`px-6 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${propertyStage === 'PRONTO' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Entregue (Pronto)</button>
                    <button onClick={() => setPropertyStage('PLANTA')} className={`px-6 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${propertyStage === 'PLANTA' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Na Planta</button>
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Nome do Imóvel / Empreendimento</label>
                    <input className="w-full h-12 px-6 bg-slate-50 border rounded-2xl font-bold text-slate-900 outline-none text-sm" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Apartamento 304 - Residencial Mirante" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Valor Total do Imóvel (R$)</label>
                    <input type="number" className="w-full h-12 px-6 bg-slate-50 border rounded-2xl font-bold text-slate-900 outline-none text-sm" value={estimatedValue} onChange={e => setEstimatedValue(e.target.value)} placeholder="0,00" />
                  </div>
               </div>
            </div>

            {/* ENTRADAS (DOWN PAYMENTS GENERATOR) */}
            <div className="space-y-6">
               <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-slate-100 text-slate-950 rounded-lg flex items-center justify-center font-black text-[10px]">2</div>
                  <h4 className="text-lg font-black text-slate-900 italic">Cronograma de Entradas / Ato</h4>
               </div>
               
               <div className="bg-slate-50/50 p-6 rounded-[32px] border border-slate-100 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-end">
                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Valor da Parcela</label>
                      <input type="number" className="w-full h-12 px-5 bg-white border rounded-xl font-bold outline-none text-sm" placeholder="R$" value={inputDownAmount} onChange={e => setInputDownAmount(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Data Inicial</label>
                      <input type="date" className="w-full h-12 px-5 bg-white border rounded-xl font-bold outline-none text-sm" value={inputDownDate} onChange={e => setInputDownDate(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Periodicidade</label>
                      <select className="w-full h-12 px-3 bg-white border rounded-xl font-bold outline-none text-xs" value={inputDownFrequency} onChange={e => setInputDownFrequency(e.target.value as any)}>
                        <option value="SINGLE">Única / Pontual</option>
                        <option value="MONTHLY">Mensal</option>
                        <option value="QUARTERLY">Trimestral</option>
                        <option value="SEMESTRAL">Semestral</option>
                      </select>
                    </div>
                    {inputDownFrequency !== 'SINGLE' && (
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Qtd Parcelas</label>
                        <input type="number" className="w-full h-12 px-5 bg-white border rounded-xl font-bold outline-none text-sm" value={inputDownCount} onChange={e => setInputDownCount(e.target.value)} />
                      </div>
                    )}
                    <div className="flex items-end">
                      <button onClick={addDownPaymentsSeries} className="w-full h-12 bg-slate-900 hover:bg-brand-600 text-white rounded-xl flex items-center justify-center gap-2 transition-all font-black text-[9px] uppercase tracking-widest"><Plus size={16} /> Adicionar</button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                     {downPayments.map((dp, i) => (
                       <div key={i} className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-100 shadow-sm group">
                         <div>
                           <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{dp.label}</p>
                           <p className="text-xs font-black text-slate-950">{formatCurrency(dp.amount)}</p>
                           <p className="text-[9px] text-slate-400 font-medium">{new Date(dp.date).toLocaleDateString('pt-BR')}</p>
                         </div>
                         <button onClick={() => removeDownPayment(i)} className="p-2 text-slate-200 hover:text-rose-500 rounded-lg transition-all"><Trash2 size={16} /></button>
                       </div>
                     ))}
                  </div>
               </div>
            </div>

            {/* INTERMEDIÁRIAS (BALLOONS GENERATOR) */}
            <div className="space-y-6">
               <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-slate-100 text-slate-950 rounded-lg flex items-center justify-center font-black text-[10px]">3</div>
                  <h4 className="text-lg font-black text-slate-900 italic">Cronograma de Balões / Intermediárias</h4>
               </div>
               
               <div className="bg-slate-50/50 p-6 rounded-[32px] border border-slate-100 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-end">
                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Valor do Balão</label>
                      <input type="number" className="w-full h-12 px-5 bg-white border rounded-xl font-bold outline-none text-sm" placeholder="R$" value={inputBalloonAmount} onChange={e => setInputBalloonAmount(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Data Inicial</label>
                      <input type="date" className="w-full h-12 px-5 bg-white border rounded-xl font-bold outline-none text-sm" value={inputBalloonDate} onChange={e => setInputBalloonDate(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Periodicidade</label>
                      <select className="w-full h-12 px-3 bg-white border rounded-xl font-bold outline-none text-xs" value={inputBalloonFrequency} onChange={e => setInputBalloonFrequency(e.target.value as any)}>
                        <option value="SINGLE">Única / Pontual</option>
                        <option value="MONTHLY">Mensal</option>
                        <option value="QUARTERLY">Trimestral</option>
                        <option value="SEMESTRAL">Semestral</option>
                      </select>
                    </div>
                    {inputBalloonFrequency !== 'SINGLE' && (
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Qtd Balões</label>
                        <input type="number" className="w-full h-12 px-5 bg-white border rounded-xl font-bold outline-none text-sm" value={inputBalloonCount} onChange={e => setInputBalloonCount(e.target.value)} />
                      </div>
                    )}
                    <div className="flex items-end">
                      <button onClick={addBalloonsSeries} className="w-full h-12 bg-slate-900 hover:bg-brand-600 text-white rounded-xl flex items-center justify-center gap-2 transition-all font-black text-[9px] uppercase tracking-widest"><Plus size={16} /> Adicionar</button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                     {balloons.map((b, i) => (
                       <div key={i} className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-100 shadow-sm group">
                         <div>
                           <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{b.label}</p>
                           <p className="text-xs font-black text-slate-950">{formatCurrency(b.amount)}</p>
                           <p className="text-[9px] text-slate-400 font-medium">{new Date(b.date).toLocaleDateString('pt-BR')}</p>
                         </div>
                         <button onClick={() => removeBalloon(i)} className="p-2 text-slate-200 hover:text-rose-500 rounded-lg transition-all"><Trash2 size={16} /></button>
                       </div>
                     ))}
                  </div>
               </div>
            </div>

            {/* FINANCING & AMORTIZATION TABLE (SAC vs PRICE) */}
            <div className="space-y-6">
               <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-slate-100 text-slate-950 rounded-lg flex items-center justify-center font-black text-[10px]">4</div>
                  <h4 className="text-lg font-black text-slate-900 italic">Amortização / Financiamento ou Consórcio</h4>
               </div>

               <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Financing Amortization Settings */}
                  <div className="bg-slate-50/50 p-6 rounded-[32px] border border-slate-100 space-y-4">
                     <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Opção A: Financiamento Direto (SAC / Price)</p>
                     
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Saldo a Financiar</label>
                          <input type="number" className="w-full h-10 px-4 bg-white border rounded-xl text-xs font-bold" value={financingAmount} onChange={e => setFinancingAmount(e.target.value)} placeholder="0.00" disabled={!!selectedConsortiumId} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Data 1ª Parcela</label>
                          <input type="date" className="w-full h-10 px-4 bg-white border rounded-xl text-xs font-bold" value={financingStartDate} onChange={e => setFinancingStartDate(e.target.value)} disabled={!!selectedConsortiumId} />
                        </div>
                     </div>

                     <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Parcelas (Meses)</label>
                          <input type="number" className="w-full h-10 px-4 bg-white border rounded-xl text-xs font-bold" value={financingInstallmentsCount} onChange={e => setFinancingInstallmentsCount(e.target.value)} disabled={!!selectedConsortiumId} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Taxa de Juros (% am)</label>
                          <input type="number" step="0.01" className="w-full h-10 px-4 bg-white border rounded-xl text-xs font-bold" value={financingInterestRate} onChange={e => setFinancingInterestRate(e.target.value)} disabled={!!selectedConsortiumId} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Tipo Amortização</label>
                          <select className="w-full h-10 px-2 bg-white border rounded-xl text-[10px] font-bold outline-none" value={amortizationType} onChange={e => setAmortizationType(e.target.value as any)} disabled={!!selectedConsortiumId}>
                            <option value="SAC">SAC (Decrescente)</option>
                            <option value="PRICE">Price (Igual)</option>
                          </select>
                        </div>
                     </div>

                     <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-3">
                        <div className="space-y-1.5">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Índice Correção</label>
                          <select className="w-full h-10 px-2 bg-white border rounded-xl text-xs font-bold outline-none" value={financingIndexType} onChange={e => setFinancingIndexType(e.target.value as any)} disabled={!!selectedConsortiumId}>
                            <option value="FIXED">Fixo (Sem reajuste)</option>
                            <option value="INCC">INCC</option>
                            <option value="IPCA">IPCA</option>
                            <option value="IGP-M">IGP-M</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Projeção Reajuste (% am)</label>
                          <input type="number" step="0.01" className="w-full h-10 px-4 bg-white border rounded-xl text-xs font-bold" value={financingIndexRate} onChange={e => setFinancingIndexRate(e.target.value)} placeholder="0.0" disabled={!!selectedConsortiumId} />
                        </div>
                     </div>
                  </div>

                  {/* Consortium Integration choice */}
                  <div className="bg-slate-50/50 p-6 rounded-[32px] border border-slate-100 space-y-4">
                     <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Opção B: Quitar com Consórcio Contemplado</p>
                     
                     <div className="space-y-2">
                        <button 
                          onClick={() => setSelectedConsortiumId('')}
                          className={`w-full p-4 rounded-2xl border transition-all flex items-center justify-between text-left group ${!selectedConsortiumId ? 'bg-slate-900 border-slate-900 text-white shadow-md' : 'bg-white border-slate-100 text-slate-600'}`}
                        >
                          <div className="flex items-center gap-3">
                            <HelpCircle size={16} className={!selectedConsortiumId ? 'text-white' : 'text-slate-300'} />
                            <div>
                              <p className="text-[10px] font-black uppercase">Não Utilizar Consórcio</p>
                              <p className="text-[8px] text-slate-400 font-bold uppercase tracking-tight mt-0.5">Seguir com Financiamento Padrão acima</p>
                            </div>
                          </div>
                        </button>

                        {isLoadingConsortia ? (
                          <div className="flex items-center gap-2 text-slate-400 p-2"><Loader2 size={12} className="animate-spin" /> <span className="text-[8px] font-bold uppercase">Buscando Consórcios...</span></div>
                        ) : (
                          availableConsortia.map(c => (
                            <button 
                              key={c.id} 
                              onClick={() => {
                                setSelectedConsortiumId(c.id);
                                // Set financing amount equal to consortium's remaining balance as help
                                setFinancingAmount(String(c.remainingBalance));
                              }}
                              className={`w-full p-4 rounded-2xl border transition-all flex items-center justify-between text-left group ${selectedConsortiumId === c.id ? 'bg-brand-600 border-brand-600 text-white shadow-md' : 'bg-white border-slate-100 text-slate-600 hover:border-brand-200'}`}
                            >
                              <div className="flex items-center gap-3">
                                <Wallet size={16} className={selectedConsortiumId === c.id ? 'text-white' : 'text-slate-300'} />
                                <div>
                                  <p className="text-[10px] font-black uppercase">{c.name}</p>
                                  <p className={`text-[8px] font-bold ${selectedConsortiumId === c.id ? 'text-brand-200' : 'text-slate-400'}`}>Crédito Devedor: {formatCurrency(c.remainingBalance)} | Parcela: {c.installmentAmount ? formatCurrency(c.installmentAmount) : '-'}</p>
                                </div>
                              </div>
                            </button>
                          ))
                        )}
                     </div>
                  </div>
               </div>
            </div>

            {/* ESTIMATED IMPACT SUMMARY */}
            <div className="bg-slate-900 p-8 rounded-[40px] text-white space-y-4">
               <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Valor do Ativo Imobiliário</p>
                    <h5 className="text-3xl font-black italic">{formatCurrency(parseFloat(estimatedValue) || 0)}</h5>
                  </div>
                  <div className="hidden md:block w-px h-12 bg-white/10" />
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Financiado / A Pagar</p>
                    <h5 className="text-3xl font-black text-rose-400 italic">
                      {formatCurrency(
                        downPayments.reduce((acc, curr) => acc + curr.amount, 0) +
                        balloons.reduce((acc, curr) => acc + curr.amount, 0) +
                        (selectedConsortiumId ? 0 : (parseFloat(financingAmount) || 0))
                      )}
                    </h5>
                  </div>
               </div>
            </div>

          </div>
        </div>

        {/* FOOTER */}
        <div className="px-10 py-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-4 shrink-0">
           <button onClick={onClose} className="px-10 py-5 bg-white border text-slate-400 rounded-3xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all">Descartar</button>
           <button 
             disabled={isSubmitting || !name || !estimatedValue} 
             onClick={handleSave} 
             className="px-12 py-5 bg-slate-900 hover:bg-brand-600 text-white rounded-3xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-xl"
           >
             {isSubmitting ? (
               <>
                 <Loader2 size={16} className="animate-spin" />
                 Gerando Registro...
               </>
             ) : (
               <>
                 Cadastrar Ativo Imobiliário
                 <ArrowRight size={16} />
               </>
             )}
           </button>
        </div>

      </div>
    </div>
  );
};
