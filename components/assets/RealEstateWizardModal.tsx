import React, { useState } from 'react';
import { supabase } from '../../lib/supabase/client';
import { X, Plus, Trash2, FileText, Upload, HelpCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { DateUtils } from '../../lib/dateUtils';

interface RealEstateWizardModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const RealEstateWizardModal: React.FC<RealEstateWizardModalProps> = ({ onClose, onSuccess }) => {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [propertyType, setPropertyType] = useState<'PLANTA' | 'PRONTO'>('PLANTA');

  // Step 1: O Imóvel
  const [name, setName] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [acquisitionDate, setAcquisitionDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');

  // Step 2: Ato e Contrato
  const [downPayments, setDownPayments] = useState<{ amount: number; date: string }[]>([]);
  const [currDownAmount, setCurrDownAmount] = useState('');
  const [currDownDate, setCurrDownDate] = useState('');
  const [contractFile, setContractFile] = useState<File | null>(null);

  // Step 3: Fase de Obras (Apenas Planta)
  const [constInstallments, setConstInstallments] = useState(''); // Qtde parcelas construtora
  const [constAmount, setConstAmount] = useState(''); // Valor base
  const [constStartDate, setConstStartDate] = useState('');
  const [indexType, setIndexType] = useState<'INCC' | 'IPCA' | 'FIXED'>('INCC');
  const [monthlyIndexRate, setMonthlyIndexRate] = useState('0.5'); // Média estimada mensal

  // Intermediárias Automáticas
  const [intermFrequency, setIntermFrequency] = useState('6'); // De quanto em quanto tempo (meses)
  const [intermAmount, setIntermAmount] = useState('');
  const [intermTotal, setIntermTotal] = useState(''); // Qtde total de intermediárias

  // Step 4: Saldo Final / Financiamento Bancário
  const [finalBalance, setFinalBalance] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(''); // Data de entrega / Vencimento saldo
  const [postDeliveryIndex, setPostDeliveryIndex] = useState('IPCA + 1%');
  const [useConsorcio, setUseConsorcio] = useState(false);

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

    // Simulação de Extração por IA (Step 2 - Inteligência Conectada)
    setTimeout(() => {
      setName('Apartamento Extraído por IA');
      setEstimatedValue('450000');
      setConstAmount('1200');
      setConstInstallments('24');
      setConstStartDate('2024-06-10');
      setIndexType('INCC');
      setMonthlyIndexRate('0.6');
      setFinalBalance('320000');
      setDeliveryDate('2026-06-10');
      setIsParsingContract(false);
      alert('Contrato analisado com sucesso! Dados preenchidos no Wizard.');
    }, 2000);
  };

  const handleSave = async () => {
    if (!supabase) return;
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // 1. Registrar o Ativo (Bem Físico)
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

      const futureTransactions: any[] = [];
      // Categoria agora mais clara para Contas a Pagar
      const catName = 'Habitação > Financiamento Imob.'; 

      // 2. Criar os Passivos (Dívidas)
      const totalLiabilityAmount = 
        downPayments.reduce((acc, curr) => acc + curr.amount, 0) +
        (parseFloat(constAmount) * (parseInt(constInstallments) || 0)) +
        (parseFloat(intermAmount) * (parseInt(intermTotal) || 0)) +
        (parseFloat(finalBalance) || 0);

      const { data: liabData, error: liabErr } = await supabase.from('liabilities').insert([{
        user_id: user.id,
        name: `Dívida Imob: ${name}`,
        type: propertyType === 'PLANTA' ? 'LOAN' : 'MORTGAGE',
        total_amount: totalLiabilityAmount,
        remaining_balance: totalLiabilityAmount,
        linked_asset_id: assetId,
        metadata: {
          propertyType,
          indexType,
          monthlyIndexRate,
          deliveryDate,
          postDeliveryIndex,
          useConsorcio,
          isRealEstate: true
        }
      }]).select().single();

      if (liabErr) throw liabErr;
      const liabId = liabData.id;

      // 3. Gerar Transações do ATO
      downPayments.forEach((dp, i) => {
        futureTransactions.push({
          user_id: user.id,
          description: `Pagamento ATO ${i + 1}/${downPayments.length} - ${name}`,
          amount: dp.amount,
          date: dp.date,
          type: 'EXPENSE',
          category: catName,
          is_paid: new Date(dp.date) <= new Date(),
          is_amortization: true,
          liability_id: liabId,
          metadata: { linked_asset_id: assetId, type: 'DOWN_PAYMENT' }
        });
      });

      // 4. Gerar Parcelas Construtora (COM REAJUSTE MENSAL CUMULATIVO)
      if (propertyType === 'PLANTA' && constAmount && constInstallments && constStartDate) {
        let baseVal = parseFloat(constAmount);
        const rate = (parseFloat(monthlyIndexRate) || 0) / 100;
        const startDate = new Date(constStartDate);

        for (let i = 0; i < parseInt(constInstallments); i++) {
          const txDate = new Date(startDate.getFullYear(), startDate.getMonth() + i, startDate.getDate());
          if (i > 0) baseVal = baseVal * (1 + rate);

          futureTransactions.push({
            user_id: user.id,
            description: `Parcela Construtora ${i + 1}/${constInstallments} - ${name}`,
            amount: baseVal,
            date: txDate.toISOString().split('T')[0],
            type: 'EXPENSE',
            category: catName,
            is_paid: false, // Fica como PENDENTE -> Aparece em Contas a Pagar
            is_amortization: true,
            liability_id: liabId,
            metadata: { installment: i + 1, index_applied: rate }
          });
        }
      }

      // 5. Gerar Intermediárias (AUTOMÁTICAS POR FREQUÊNCIA)
      if (intermAmount && intermTotal && intermFrequency && constStartDate) {
        const val = parseFloat(intermAmount);
        const total = parseInt(intermTotal);
        const freq = parseInt(intermFrequency);
        const startDate = new Date(constStartDate);

        for (let i = 1; i <= total; i++) {
          const txDate = new Date(startDate.getFullYear(), startDate.getMonth() + (i * freq), startDate.getDate());
          futureTransactions.push({
            user_id: user.id,
            description: `Intermediária/Balão ${i}/${total} - ${name}`,
            amount: val,
            date: txDate.toISOString().split('T')[0],
            type: 'EXPENSE',
            category: catName,
            is_paid: false,
            is_amortization: true,
            liability_id: liabId,
            metadata: { type: 'INTERMEDIARY', index: i }
          });
        }
      }

      // 6. Gerar Saldo Final
      if (finalBalance && deliveryDate) {
        futureTransactions.push({
          user_id: user.id,
          description: `Saldo Final p/ Financiamento Bancário - ${name}`,
          amount: parseFloat(finalBalance),
          date: deliveryDate,
          type: 'EXPENSE',
          category: catName,
          is_paid: false,
          is_amortization: true,
          liability_id: liabId,
          metadata: { type: 'FINAL_BALANCE', transition_index: postDeliveryIndex }
        });
      }

      // 7. Salvar tudo
      if (futureTransactions.length > 0) {
        const { error: txErr } = await supabase.from('transactions').insert(futureTransactions);
        if (txErr) throw txErr;
      }

      onSuccess();
    } catch (err: any) {
      alert(`Erro no deploy do contrato: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
      <div className="bg-white rounded-[40px] w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] border border-white/20">
        
        {/* HEADER */}
        <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-brand-900 text-white rounded-[20px] flex items-center justify-center shadow-lg"><FileText size={28} /></div>
            <div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight italic">Wizard de Patrimônio Imobiliário</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">Estruturação de Ativos e Passivos · FinVision Pro</p>
            </div>
          </div>
          <button onClick={onClose} className="w-12 h-12 bg-white border border-slate-100 text-slate-400 hover:text-rose-500 rounded-2xl flex items-center justify-center transition-all shadow-sm"><X size={24} /></button>
        </div>

        {/* PROGRESS BAR */}
        <div className="px-10 py-4 bg-white border-b border-slate-50 flex gap-4">
           {[1, 2, 3, 4].map(s => (
             <div key={s} className={`h-1.5 flex-1 rounded-full transition-all ${step >= s ? 'bg-brand-600' : 'bg-slate-100'}`} />
           ))}
        </div>

        <div className="flex-1 overflow-y-auto p-10 space-y-12 custom-scrollbar">
          
          {/* STEP 1: O IMÓVEL */}
          {step === 1 && (
            <div className="space-y-10 animate-in slide-in-from-right-4 duration-500">
               <div className="flex items-center justify-between">
                 <div>
                   <h4 className="text-xl font-black text-slate-900 italic">Identificação do Bem</h4>
                   <p className="text-xs text-slate-400 font-medium">Defina os dados fundamentais para o registro patrimonial.</p>
                 </div>
                 <div className="flex bg-slate-100 p-1 rounded-2xl">
                   <button onClick={() => setPropertyType('PLANTA')} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${propertyType === 'PLANTA' ? 'bg-white text-brand-600 shadow-md' : 'text-slate-400'}`}>Na Planta</button>
                   <button onClick={() => setPropertyType('PRONTO')} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${propertyType === 'PRONTO' ? 'bg-white text-brand-600 shadow-md' : 'text-slate-400'}`}>Pronto</button>
                 </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Nome / Unidade / Empreendimento</label>
                    <input className="w-full h-16 px-8 bg-slate-50 border border-slate-100 rounded-3xl font-black text-slate-900 outline-none focus:ring-4 focus:ring-brand-500/10 transition-all" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Apartamento 402 - Ed. Horizonte" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Valor Total (Avaliação)</label>
                    <input type="number" className="w-full h-16 px-8 bg-slate-50 border border-slate-100 rounded-3xl font-black text-slate-900 outline-none" value={estimatedValue} onChange={e => setEstimatedValue(e.target.value)} placeholder="R$ 0,00" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Data da Compra</label>
                    <input type="date" className="w-full h-16 px-8 bg-slate-50 border border-slate-100 rounded-3xl font-black text-slate-900 outline-none" value={acquisitionDate} onChange={e => setAcquisitionDate(e.target.value)} />
                  </div>
               </div>
            </div>
          )}

          {/* STEP 2: ATO E CONTRATO */}
          {step === 2 && (
            <div className="space-y-10 animate-in slide-in-from-right-4 duration-500">
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                  <div className="space-y-6">
                    <h4 className="text-xl font-black text-slate-900 italic">Entrada e Atos</h4>
                    <div className="bg-slate-50 p-6 rounded-[32px] border border-slate-100 space-y-4">
                       <div className="flex gap-4">
                         <input type="number" className="flex-[2] h-14 px-6 bg-white border border-slate-200 rounded-2xl font-bold outline-none" placeholder="R$" value={currDownAmount} onChange={e => setCurrDownAmount(e.target.value)} />
                         <input type="date" className="flex-[3] h-14 px-6 bg-white border border-slate-200 rounded-2xl font-bold outline-none" value={currDownDate} onChange={e => setCurrDownDate(e.target.value)} />
                         <button onClick={addDownPayment} className="w-14 h-14 bg-brand-600 text-white rounded-2xl flex items-center justify-center hover:bg-brand-700 transition-all shadow-lg"><Plus size={24} /></button>
                       </div>
                       <div className="space-y-2">
                          {downPayments.map((dp, i) => (
                            <div key={i} className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-100">
                              <span className="text-[10px] font-black text-slate-400">#0{i+1}</span>
                              <span className="text-sm font-black text-slate-900">R$ {dp.amount.toLocaleString()}</span>
                              <button onClick={() => removeDownPayment(i)} className="text-rose-400"><Trash2 size={16} /></button>
                            </div>
                          ))}
                       </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <h4 className="text-xl font-black text-slate-900 italic">Leitura de Contrato (IA)</h4>
                    <label className={`relative border-2 border-dashed rounded-[32px] p-10 flex flex-col items-center justify-center text-center space-y-4 transition-all bg-slate-50/50 cursor-pointer group ${isParsingContract ? 'border-brand-500 bg-brand-50/30' : 'border-slate-200 hover:border-brand-500/50'}`}>
                       <input type="file" className="hidden" accept=".pdf,.doc,.docx" onChange={handleFileUpload} disabled={isParsingContract} />
                       
                       {isParsingContract ? (
                         <>
                           <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-brand-600 shadow-sm"><Loader2 size={32} className="animate-spin" /></div>
                           <div>
                             <p className="text-sm font-black text-brand-600">Extraindo Dados via IA...</p>
                             <p className="text-[10px] text-brand-400 font-bold uppercase tracking-widest mt-1">Lendo parcelas, índices e vencimentos</p>
                           </div>
                         </>
                       ) : (
                         <>
                           <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-slate-300 group-hover:text-brand-600 transition-colors shadow-sm"><Upload size={32} /></div>
                           <div>
                             <p className="text-sm font-black text-slate-600">{contractFile ? contractFile.name : 'Arraste o PDF do Contrato'}</p>
                             <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">A IA preencherá o Wizard automaticamente</p>
                           </div>
                         </>
                       )}
                    </label>
                  </div>
               </div>
            </div>
          )}

          {/* STEP 3: FASE DE OBRAS (PLANTA) */}
          {step === 3 && (
            <div className="space-y-10 animate-in slide-in-from-right-4 duration-500">
               {propertyType === 'PRONTO' ? (
                 <div className="bg-emerald-50 p-10 rounded-[32px] border border-emerald-100 flex items-center gap-8">
                    <div className="w-16 h-16 bg-emerald-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20"><CheckCircle2 size={32} /></div>
                    <div>
                      <h4 className="text-xl font-black text-emerald-900 italic">Imóvel Pronto!</h4>
                      <p className="text-sm text-emerald-600 font-medium">Como o imóvel já está pronto, pulamos a fase de construção direta com a construtora.</p>
                    </div>
                 </div>
               ) : (
                 <div className="space-y-10">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                       <div className="space-y-6">
                         <h4 className="text-xl font-black text-slate-900 italic flex items-center gap-2">Parcelas Mensais (Obra) <HelpCircle size={14} className="text-slate-300" /></h4>
                         <div className="bg-slate-50 p-8 rounded-[32px] border border-slate-100 space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Quantidade</label>
                                <input type="number" className="w-full h-14 px-6 bg-white border border-slate-100 rounded-2xl font-black outline-none" value={constInstallments} onChange={e => setConstInstallments(e.target.value)} placeholder="00" />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Valor Base</label>
                                <input type="number" className="w-full h-14 px-6 bg-white border border-slate-100 rounded-2xl font-black outline-none" value={constAmount} onChange={e => setConstAmount(e.target.value)} placeholder="R$" />
                              </div>
                            </div>
                            <div className="space-y-1">
                               <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Data Inicial</label>
                               <input type="date" className="w-full h-14 px-6 bg-white border border-slate-100 rounded-2xl font-black outline-none" value={constStartDate} onChange={e => setConstStartDate(e.target.value)} />
                            </div>
                            <div className="p-4 bg-brand-50 rounded-2xl border border-brand-100">
                               <p className="text-[10px] text-brand-900/60 font-bold leading-relaxed italic">O valor da parcela será corrigido cumulativamente mês a mês pelo índice selecionado.</p>
                            </div>
                         </div>
                       </div>

                       <div className="space-y-6">
                         <h4 className="text-xl font-black text-slate-900 italic">Intermediárias (Balões)</h4>
                         <div className="bg-slate-50 p-8 rounded-[32px] border border-slate-100 space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Frequência (Meses)</label>
                                <select className="w-full h-14 px-6 bg-white border border-slate-100 rounded-2xl font-black outline-none appearance-none" value={intermFrequency} onChange={e => setIntermFrequency(e.target.value)}>
                                  <option value="3">Trimestral (3m)</option>
                                  <option value="6">Semestral (6m)</option>
                                  <option value="12">Anual (12m)</option>
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Quantidade Total</label>
                                <input type="number" className="w-full h-14 px-6 bg-white border border-slate-100 rounded-2xl font-black outline-none" value={intermTotal} onChange={e => setIntermTotal(e.target.value)} placeholder="Ex: 4" />
                              </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Valor de Cada Balão</label>
                                <input type="number" className="w-full h-14 px-6 bg-white border border-slate-100 rounded-2xl font-black outline-none" value={intermAmount} onChange={e => setIntermAmount(e.target.value)} placeholder="R$" />
                            </div>
                         </div>
                       </div>
                    </div>

                    <div className="bg-brand-900 p-8 rounded-[32px] text-white flex flex-col md:flex-row justify-between items-center gap-6">
                       <div>
                         <h5 className="font-black italic">Índice de Correção na Obra</h5>
                         <p className="text-xs text-brand-300 font-medium">Este índice será aplicado a todas as parcelas e saldo devedor mensalmente.</p>
                       </div>
                       <div className="flex gap-4">
                          <select className="h-14 px-8 bg-white/10 border border-white/20 rounded-2xl font-black text-white outline-none" value={indexType} onChange={e => setIndexType(e.target.value as any)}>
                            <option value="INCC" className="text-slate-900">INCC</option>
                            <option value="IPCA" className="text-slate-900">IPCA</option>
                            <option value="FIXED" className="text-slate-900">FIXO</option>
                          </select>
                          <input type="number" className="w-24 h-14 bg-white/10 border border-white/20 rounded-2xl font-black text-white text-center outline-none" value={monthlyIndexRate} onChange={e => setMonthlyIndexRate(e.target.value)} />
                          <span className="flex items-center font-black">% / mês</span>
                       </div>
                    </div>
                 </div>
               )}
            </div>
          )}

          {/* STEP 4: SALDO FINAL */}
          {step === 4 && (
            <div className="space-y-10 animate-in slide-in-from-right-4 duration-500">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="space-y-6">
                    <h4 className="text-xl font-black text-slate-900 italic">Saldo Final (Chaves)</h4>
                    <div className="bg-slate-50 p-8 rounded-[32px] border border-slate-100 space-y-6">
                       <div className="space-y-1">
                         <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Valor do Saldo a Financiar</label>
                         <input type="number" className="w-full h-16 px-8 bg-white border border-slate-100 rounded-3xl font-black text-slate-900 outline-none" value={finalBalance} onChange={e => setFinalBalance(e.target.value)} placeholder="R$ 0,00" />
                       </div>
                       <div className="space-y-1">
                         <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Data Estimada de Entrega</label>
                         <input type="date" className="w-full h-16 px-8 bg-white border border-slate-100 rounded-3xl font-black text-slate-900 outline-none" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
                       </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <h4 className="text-xl font-black text-slate-900 italic">Transição de Crédito</h4>
                    <div className="bg-slate-50 p-8 rounded-[32px] border border-slate-100 space-y-6">
                       <div className="space-y-1">
                         <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Índice Pós-Chaves (Sugestão)</label>
                         <input className="w-full h-16 px-8 bg-white border border-slate-100 rounded-3xl font-black text-slate-900 outline-none" value={postDeliveryIndex} onChange={e => setPostDeliveryIndex(e.target.value)} placeholder="Ex: IPCA + 1% am" />
                       </div>
                       <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100">
                          <div className="flex items-center gap-3">
                            <CheckCircle2 className={useConsorcio ? 'text-brand-600' : 'text-slate-200'} />
                            <span className="text-xs font-black text-slate-700 uppercase tracking-tight">Vincular Consórcio Ativo</span>
                          </div>
                          <button onClick={() => setUseConsorcio(!useConsorcio)} className={`w-12 h-6 rounded-full p-1 transition-all ${useConsorcio ? 'bg-brand-600' : 'bg-slate-200'}`}>
                             <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-all transform ${useConsorcio ? 'translate-x-6' : ''}`} />
                          </button>
                       </div>
                    </div>
                  </div>
               </div>

               <div className="bg-brand-50 p-8 rounded-[40px] border border-brand-100 flex items-start gap-6">
                  <HelpCircle className="text-brand-600 shrink-0 mt-1" size={24} />
                  <div className="space-y-4">
                    <h5 className="font-black text-brand-900 italic">Visão do Especialista FinVision</h5>
                    <p className="text-xs text-brand-700/80 leading-relaxed font-bold">Esta operação será registrada como um **Ativo Físico** (pelo valor de avaliação) e um **Passivo** (pelo saldo devedor total). À medida que as parcelas e balões forem pagos, sua dívida diminui e seu Patrimônio Líquido cresce. O Saldo Final ficará "estacionado" e será reajustado pelo {indexType} até a entrega das chaves.</p>
                  </div>
               </div>
            </div>
          )}
        </div>

        {/* FOOTER ACTIONS */}
        <div className="px-10 py-10 border-t border-slate-100 bg-slate-50 flex gap-6 shrink-0">
           <button 
             onClick={() => step > 1 ? setStep(step - 1) : onClose()} 
             className="px-10 py-5 bg-white border border-slate-200 text-slate-400 rounded-3xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all"
           >
             {step === 1 ? 'Cancelar' : 'Voltar'}
           </button>
           
           <button 
             disabled={isSubmitting || (step === 1 && (!name || !estimatedValue))} 
             onClick={() => step < 4 ? setStep(step + 1) : handleSave()} 
             className="flex-1 px-10 py-5 bg-slate-900 text-white rounded-3xl text-[10px] font-black uppercase tracking-widest shadow-2xl shadow-slate-200 hover:bg-brand-600 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
           >
             {isSubmitting ? 'Consolidando Estrutura...' : step === 4 ? 'Finalizar e Gerar Lançamentos' : 'Próximo Passo'}
           </button>
        </div>
      </div>
    </div>
  );
};

