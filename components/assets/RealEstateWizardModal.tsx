import React, { useState } from 'react';
import { supabase } from '../../lib/supabase/client';
import { X, Plus, Trash2 } from 'lucide-react';

interface RealEstateWizardModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const RealEstateWizardModal: React.FC<RealEstateWizardModalProps> = ({ onClose, onSuccess }) => {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [propertyType, setPropertyType] = useState<'PLANTA' | 'PRONTO'>('PLANTA');

  // Bem Físico
  const [name, setName] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [acquisitionDate, setAcquisitionDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');

  // Estrutura de Pagamento - ATO (Múltiplos)
  const [downPayments, setDownPayments] = useState<{ amount: number; date: string }[]>([]);
  const [currDownAmount, setCurrDownAmount] = useState('');
  const [currDownDate, setCurrDownDate] = useState('');

  const addDownPayment = () => {
    if (!currDownAmount || !currDownDate) return;
    setDownPayments([...downPayments, { amount: parseFloat(currDownAmount), date: currDownDate }]);
    setCurrDownAmount('');
    setCurrDownDate('');
  };

  const removeDownPayment = (idx: number) => {
    setDownPayments(downPayments.filter((_, i) => i !== idx));
  };

  // Financiamento / Saldo Devedor
  const [hasFinancing, setHasFinancing] = useState(false);
  const [financedAmount, setFinancedAmount] = useState('');
  const [installments, setInstallments] = useState('');
  const [installmentAmount, setInstallmentAmount] = useState('');
  const [firstDueDate, setFirstDueDate] = useState('');
  const [indexationRate, setIndexationRate] = useState(''); // INCC ou IPCA + %
  const [indexType, setIndexType] = useState<'INCC' | 'IPCA' | 'FIXED'>('INCC');

  // Balões (Intermediárias)
  const [balloons, setBalloons] = useState<{ month: number; year: number; amount: number }[]>([]);
  const [bMonth, setBMonth] = useState('');
  const [bYear, setBYear] = useState('');
  const [bAmount, setBAmount] = useState('');

  const addBalloon = () => {
    if (!bMonth || !bYear || !bAmount) return;
    setBalloons([...balloons, { month: parseInt(bMonth, 10), year: parseInt(bYear, 10), amount: parseFloat(bAmount) }]);
    setBMonth('');
    setBYear('');
    setBAmount('');
  };

  const removeBalloon = (idx: number) => {
    setBalloons(balloons.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!supabase) return;
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // 1. Criar o Bem Físico
      const { data: assetData, error: assetErr } = await supabase.from('physical_assets').insert([{
        user_id: user.id,
        name: name,
        category: 'REAL_ESTATE',
        estimated_value: parseFloat(estimatedValue) || 0,
        acquisition_date: acquisitionDate || null,
        description: `${description} (${propertyType === 'PLANTA' ? 'Na Planta' : 'Pronto'})`
      }]).select().single();

      if (assetErr) throw assetErr;
      const assetId = assetData.id;

      const categoryName = 'Patrimônio Imobiliário';
      const futureTransactions: any[] = [];

      // 2. Inserir os ATOS no Histórico
      downPayments.forEach((dp, idx) => {
        futureTransactions.push({
          user_id: user.id,
          description: `Ato ${idx + 1}/${downPayments.length} - ${name}`,
          amount: dp.amount,
          date: dp.date,
          type: 'EXPENSE',
          category: categoryName,
          is_paid: new Date(dp.date) <= new Date(),
          is_recurring: false,
          is_amortization: true,
          metadata: { auto_generated: true, type: 'DOWN_PAYMENT', linked_asset_id: assetId }
        });
      });

      // 3. Criar Financiamento / Passivo (Liability)
      if (hasFinancing && parseFloat(financedAmount) > 0) {
        const instLeft = parseInt(installments, 10) || 0;
        const instAmt = parseFloat(installmentAmount) || 0;
        const dueDay = firstDueDate ? parseInt(firstDueDate.split('-')[2], 10) : 1;

        const { data: liabData, error: liabErr } = await supabase.from('liabilities').insert([{
          user_id: user.id,
          name: `Passivo Imob: ${name}`,
          type: propertyType === 'PLANTA' ? 'LOAN' : 'MORTGAGE',
          total_amount: parseFloat(financedAmount) || 0,
          remaining_balance: parseFloat(financedAmount) || 0,
          installment_amount: instAmt,
          installments_remaining: instLeft,
          due_day: dueDay,
          linked_asset_id: assetId,
          metadata: {
            isRealEstate: true,
            propertyType,
            indexType,
            indexationRate: parseFloat(indexationRate) || 0,
            balloons: balloons,
            acquisitionDate
          }
        }]).select().single();

        if (liabErr) throw liabErr;
        const liabilityId = liabData.id;

        // Vínculo do Ato com o Passivo
        futureTransactions.forEach(t => { if (t.metadata.type === 'DOWN_PAYMENT') t.liability_id = liabilityId; });

        // Gerar Parcelas Mensais
        if (instAmt > 0 && instLeft > 0 && firstDueDate) {
          const firstDate = new Date(firstDueDate);
          for (let i = 0; i < instLeft; i++) {
            const txDate = new Date(firstDate.getFullYear(), firstDate.getMonth() + i, dueDay);
            if (txDate.getDate() !== dueDay) txDate.setDate(0); 
            
            futureTransactions.push({
              user_id: user.id,
              description: `Parcela ${i + 1}/${instLeft} - ${name}`,
              amount: instAmt,
              date: txDate.toISOString().split('T')[0],
              type: 'EXPENSE',
              category: categoryName,
              is_paid: false,
              is_recurring: true,
              is_amortization: true,
              liability_id: liabilityId,
              metadata: { auto_generated: true, installment_number: i + 1, indexType, indexationRate }
            });
          }
        }

        // Gerar Balões (Intermediárias)
        balloons.forEach((b, idx) => {
          const bDate = new Date(b.year, b.month - 1, 1);
          const lastDay = new Date(b.year, b.month, 0).getDate();
          bDate.setDate(lastDay);

          futureTransactions.push({
            user_id: user.id,
            description: `Balão/Intermediária - ${name}`,
            amount: b.amount,
            date: bDate.toISOString().split('T')[0],
            type: 'EXPENSE',
            category: categoryName,
            is_paid: false,
            is_recurring: false,
            is_amortization: true,
            liability_id: liabilityId,
            metadata: { auto_generated: true, type: 'BALLOON', balloon_index: idx }
          });
        });
      }

      if (futureTransactions.length > 0) {
        const chunkSize = 50;
        for (let i = 0; i < futureTransactions.length; i += chunkSize) {
          await supabase.from('transactions').insert(futureTransactions.slice(i, i + chunkSize));
        }
      }

      onSuccess();
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-brand-900/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-[32px] w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
          <div>
            <h3 className="font-bold text-xl text-slate-900 tracking-tight">Nova Aquisição Imobiliária</h3>
            <div className="flex gap-4 mt-2">
               <button 
                onClick={() => setPropertyType('PLANTA')}
                className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${propertyType === 'PLANTA' ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}
               >
                Na Planta
               </button>
               <button 
                onClick={() => setPropertyType('PRONTO')}
                className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${propertyType === 'PRONTO' ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}
               >
                Pronto
               </button>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-xl transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
          {/* STEP 1: DETALHES DO BEM */}
          <section className="space-y-6">
            <h4 className="flex items-center gap-3 font-bold text-brand-600 text-sm uppercase tracking-widest">
              <div className="w-8 h-8 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600">1</div>
              O Imóvel
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Nome / Identificação</label>
                <input
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
                  placeholder="Ex: Edifício Horizonte, Unidade 402"
                  value={name} onChange={e => setName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Valor de Venda / Avaliação (R$)</label>
                <input
                  type="number" step="0.01"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
                  placeholder="0,00"
                  value={estimatedValue} onChange={e => setEstimatedValue(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Data da Assinatura / Compra</label>
                <input
                  type="date"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
                  value={acquisitionDate} onChange={e => setAcquisitionDate(e.target.value)}
                />
              </div>
            </div>
          </section>

          <hr className="border-slate-100" />

          {/* STEP 2: ESTRUTURA DE PAGAMENTO */}
          <section className="space-y-6">
            <h4 className="flex items-center gap-3 font-bold text-brand-600 text-sm uppercase tracking-widest">
              <div className="w-8 h-8 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600">2</div>
              Ato e Entrada
            </h4>
            
            <div className="bg-slate-50 rounded-[32px] p-6 space-y-4 border border-slate-100">
               <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Valor (R$)</label>
                    <input
                      type="number" step="0.01"
                      className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-4 text-sm font-bold text-slate-900 focus:border-brand-500 outline-none transition-all"
                      placeholder="Valor do Ato"
                      value={currDownAmount} onChange={e => setCurrDownAmount(e.target.value)}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Data de Vencimento</label>
                    <input
                      type="date"
                      className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-4 text-sm font-bold text-slate-900 focus:border-brand-500 outline-none transition-all"
                      value={currDownDate} onChange={e => setCurrDownDate(e.target.value)}
                    />
                  </div>
                  <div className="flex items-end">
                    <button 
                      onClick={addDownPayment}
                      className="h-[56px] w-full md:w-[56px] bg-brand-600 text-white rounded-2xl flex items-center justify-center hover:bg-brand-700 transition-colors shadow-lg shadow-brand-500/10"
                    >
                      <Plus size={24} />
                    </button>
                  </div>
               </div>

               {downPayments.length > 0 && (
                 <div className="space-y-2 mt-4">
                    {downPayments.map((dp, i) => (
                      <div key={i} className="flex justify-between items-center bg-white border border-slate-100 rounded-2xl px-6 py-3">
                        <div className="flex items-center gap-4">
                          <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-xs font-black">
                            {i+1}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-900">R$ {dp.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase">{new Date(dp.date).toLocaleDateString('pt-BR')}</p>
                          </div>
                        </div>
                        <button onClick={() => removeDownPayment(i)} className="p-2 text-rose-400 hover:bg-rose-50 rounded-xl transition-colors">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ))}
                 </div>
               )}
            </div>
          </section>

          <hr className="border-slate-100" />

          {/* STEP 3: FINANCIAMENTO / SALDO DEVEDOR */}
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h4 className="flex items-center gap-3 font-bold text-brand-600 text-sm uppercase tracking-widest">
                <div className="w-8 h-8 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600">3</div>
                Saldo Devedor
              </h4>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={hasFinancing} onChange={e => setHasFinancing(e.target.checked)} />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
              </label>
            </div>

            {hasFinancing && (
              <div className="space-y-8 animate-in slide-in-from-top-4 duration-500">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-8 border border-brand-100 rounded-[32px] bg-brand-50/20 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4">
                    <div className="text-[10px] font-black text-brand-200 uppercase tracking-[0.2em] rotate-12">Debt Logic</div>
                  </div>
                  
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Valor do Saldo Devedor (R$)</label>
                    <input
                      type="number" step="0.01"
                      className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-4 text-sm font-bold text-slate-900 focus:border-brand-500 outline-none transition-all"
                      value={financedAmount} onChange={e => setFinancedAmount(e.target.value)}
                      placeholder="Restante a pagar"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Índice de Correção</label>
                    <div className="flex gap-2">
                       <select 
                        value={indexType} 
                        onChange={e => setIndexType(e.target.value as any)}
                        className="bg-white border border-slate-200 rounded-2xl px-4 py-4 text-sm font-bold text-slate-900 outline-none"
                       >
                         <option value="INCC">INCC</option>
                         <option value="IPCA">IPCA</option>
                         <option value="FIXED">FIXO</option>
                       </select>
                       <input
                        type="number" step="0.01"
                        className="flex-1 bg-white border border-slate-200 rounded-2xl px-5 py-4 text-sm font-bold text-slate-900 focus:border-brand-500 outline-none transition-all"
                        placeholder="% ao ano"
                        value={indexationRate} onChange={e => setIndexationRate(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Qtde Parcelas Mensais</label>
                    <input
                      type="number"
                      className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-4 text-sm font-bold text-slate-900 focus:border-brand-500 outline-none transition-all"
                      value={installments} onChange={e => setInstallments(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Valor Base da Parcela (R$)</label>
                    <input
                      type="number" step="0.01"
                      className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-4 text-sm font-bold text-slate-900 focus:border-brand-500 outline-none transition-all"
                      value={installmentAmount} onChange={e => setInstallmentAmount(e.target.value)}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Data da Primeira Parcela</label>
                    <input
                      type="date"
                      className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-4 text-sm font-bold text-slate-900 focus:border-brand-500 outline-none transition-all"
                      value={firstDueDate} onChange={e => setFirstDueDate(e.target.value)}
                    />
                  </div>
                </div>

                {/* Balões / Intermediárias */}
                <div className="p-8 border border-slate-200 rounded-[32px] bg-slate-50/50">
                  <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Intermediárias / Balões</h5>
                  <div className="flex flex-col md:flex-row gap-4 mb-6">
                    <div className="flex gap-2 flex-1">
                      <input
                        type="number" placeholder="Mês" min="1" max="12"
                        className="w-24 bg-white border border-slate-200 rounded-2xl px-4 py-4 text-sm font-bold outline-none"
                        value={bMonth} onChange={e => setBMonth(e.target.value)}
                      />
                      <input
                        type="number" placeholder="Ano" min="2020" max="2100"
                        className="w-32 bg-white border border-slate-200 rounded-2xl px-4 py-4 text-sm font-bold outline-none"
                        value={bYear} onChange={e => setBYear(e.target.value)}
                      />
                      <input
                        type="number" placeholder="Valor R$" step="0.01"
                        className="flex-1 bg-white border border-slate-200 rounded-2xl px-4 py-4 text-sm font-bold outline-none"
                        value={bAmount} onChange={e => setBAmount(e.target.value)}
                      />
                    </div>
                    <button type="button" onClick={addBalloon} className="h-[56px] px-6 bg-slate-900 text-white rounded-2xl flex items-center justify-center hover:bg-slate-800 transition-colors">
                      <Plus size={20} className="mr-2" /> Adicionar
                    </button>
                  </div>

                  {balloons.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {balloons.map((b, i) => (
                        <div key={i} className="flex justify-between items-center bg-white border border-slate-100 rounded-2xl px-5 py-3 shadow-sm">
                          <span className="text-[11px] font-bold text-slate-500">{String(b.month).padStart(2, '0')}/{b.year}</span>
                          <span className="text-sm font-black text-brand-600">R$ {b.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          <button onClick={() => removeBalloon(i)} className="text-rose-300 hover:text-rose-500"><Trash2 size={16}/></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="px-8 py-8 border-t border-slate-100 bg-slate-50 flex gap-6 shrink-0">
          <button disabled={isSubmitting} onClick={onClose} className="px-8 py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all">
            Cancelar
          </button>
          <button 
            disabled={isSubmitting || !name || !estimatedValue} 
            onClick={handleSave} 
            className="flex-1 px-8 py-4 bg-brand-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-brand-500/30 hover:bg-brand-700 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100"
          >
            {isSubmitting ? 'Processando Contrato...' : 'Consolidar Aquisição'}
          </button>
        </div>
      </div>
    </div>
  );
};

