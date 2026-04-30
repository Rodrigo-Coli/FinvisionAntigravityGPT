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

  // Bem Físico
  const [name, setName] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [acquisitionDate, setAcquisitionDate] = useState('');
  const [description, setDescription] = useState('');

  // Financeiro
  const [downPayment, setDownPayment] = useState(''); // Ato
  const [downPaymentDate, setDownPaymentDate] = useState(''); // Data do Ato

  // Financiamento
  const [hasFinancing, setHasFinancing] = useState(false);
  const [financedAmount, setFinancedAmount] = useState('');
  const [installments, setInstallments] = useState('');
  const [installmentAmount, setInstallmentAmount] = useState('');
  const [firstDueDate, setFirstDueDate] = useState('');
  const [indexationRate, setIndexationRate] = useState(''); // INCC

  // Balões
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
        description: description
      }]).select().single();

      if (assetErr) throw assetErr;
      const assetId = assetData.id;

      // Pegar/Criar Categoria de Imóveis para Histórico
      const categoryName = 'Aquisição Imobiliária';
      let catId = null;
      const { data: existingCat } = await supabase.from('categories')
        .select('id').eq('user_id', user.id).eq('name', categoryName).single();
      
      if (!existingCat) {
        await supabase.from('categories').insert({
          user_id: user.id,
          name: categoryName,
          type: 'EXPENSE',
          color: 'bg-indigo-50 text-indigo-600'
        });
      }

      // Transações a inserir no histórico
      const futureTransactions: any[] = [];

      // 2. Inserir o ATO (Entrada) no Histórico
      if (parseFloat(downPayment) > 0 && downPaymentDate) {
        futureTransactions.push({
          user_id: user.id,
          description: `Ato / Entrada - ${name}`,
          amount: parseFloat(downPayment),
          date: downPaymentDate,
          type: 'EXPENSE',
          category: categoryName,
          is_paid: new Date(downPaymentDate) <= new Date(),
          is_recurring: false,
          is_amortization: true, // para não projetar 2x
          metadata: { auto_generated: true, type: 'DOWN_PAYMENT', linked_asset_id: assetId }
        });
      }

      // 3. Criar Financiamento (Liability)
      if (hasFinancing && parseFloat(financedAmount) > 0) {
        const instLeft = parseInt(installments, 10) || 0;
        const instAmt = parseFloat(installmentAmount) || 0;
        const dueDay = firstDueDate ? parseInt(firstDueDate.split('-')[2], 10) : 1;

        const { data: liabData, error: liabErr } = await supabase.from('liabilities').insert([{
          user_id: user.id,
          name: `Financiamento: ${name}`,
          type: 'MORTGAGE',
          total_amount: parseFloat(financedAmount) || 0,
          remaining_balance: parseFloat(financedAmount) || 0,
          installment_amount: instAmt,
          installments_remaining: instLeft,
          due_day: dueDay,
          linked_asset_id: assetId,
          metadata: {
            isRealEstate: true,
            indexationRate: parseFloat(indexationRate) || 0,
            balloons: balloons
          }
        }]).select().single();

        if (liabErr) throw liabErr;
        const liabilityId = liabData.id;

        // Atualizar Transação de Ato com o Liability ID
        futureTransactions.forEach(t => { if (t.metadata.type === 'DOWN_PAYMENT') t.liability_id = liabilityId; });

        // Gerar Parcelas Físicas
        if (instAmt > 0 && instLeft > 0 && firstDueDate) {
          const firstDate = new Date(firstDueDate);
          const maxInst = Math.min(instLeft, 240); // Limite segurança
          
          for (let i = 0; i < maxInst; i++) {
            const txDate = new Date(firstDate.getFullYear(), firstDate.getMonth() + i, dueDay);
            if (txDate.getDate() !== dueDay) txDate.setDate(0); // Tratamento fim de mês
            
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
              metadata: { auto_generated: true, installment_number: i + 1 }
            });
          }
        }

        // Gerar Balões (Intermediárias) Físicas
        balloons.forEach((b, idx) => {
          // Último dia do mês respectivo
          const bDate = new Date(b.year, b.month, 0);
          futureTransactions.push({
            user_id: user.id,
            description: `Intermediária/Balão ${idx + 1} - ${name}`,
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

      // 4. Inserir todas as transações em Batch
      if (futureTransactions.length > 0) {
        // O Supabase tem limite de tamanho por insert, fatiamos em pedaços de 100
        const chunkSize = 100;
        for (let i = 0; i < futureTransactions.length; i += chunkSize) {
          const chunk = futureTransactions.slice(i, i + chunkSize);
          const { error: txErr } = await supabase.from('transactions').insert(chunk);
          if (txErr) console.error("Erro inserindo lote txs:", txErr);
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
      <div className="bg-white rounded-[32px] w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-xl text-slate-900 tracking-tight">Nova Aquisição Imobiliária</h3>
            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mt-1">Lançamento Unificado: Ativo e Passivo</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 rounded-xl transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          {/* STEP 1: DETALHES DO BEM */}
          <section className="space-y-4">
            <h4 className="flex items-center gap-2 font-bold text-brand-600 text-sm uppercase tracking-widest">
              <div className="w-6 h-6 rounded-md bg-brand-50 flex items-center justify-center">1</div>
              O Imóvel
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Nome / Identificação</label>
                <input
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:border-brand-500 outline-none"
                  placeholder="Ex: Apartamento Reserva, Terreno X"
                  value={name} onChange={e => setName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Valor Total de Avaliação (R$)</label>
                <input
                  type="number" step="0.01"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:border-brand-500 outline-none"
                  placeholder="Ex: 500000"
                  value={estimatedValue} onChange={e => setEstimatedValue(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Data da Compra</label>
                <input
                  type="date"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:border-brand-500 outline-none"
                  value={acquisitionDate} onChange={e => setAcquisitionDate(e.target.value)}
                />
              </div>
            </div>
          </section>

          <hr className="border-slate-100" />

          {/* STEP 2: ESTRUTURA FINANCEIRA */}
          <section className="space-y-4">
            <h4 className="flex items-center gap-2 font-bold text-brand-600 text-sm uppercase tracking-widest">
              <div className="w-6 h-6 rounded-md bg-brand-50 flex items-center justify-center">2</div>
              Estrutura de Pagamento
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5 bg-slate-50 rounded-[24px]">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Valor do Ato / Entrada (R$)</label>
                <input
                  type="number" step="0.01"
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:border-brand-500 outline-none"
                  placeholder="Ex: 50000"
                  value={downPayment} onChange={e => setDownPayment(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Data de Pagto do Ato</label>
                <input
                  type="date"
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:border-brand-500 outline-none"
                  value={downPaymentDate} onChange={e => setDownPaymentDate(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="flex items-center gap-3 cursor-pointer p-4 border border-slate-200 rounded-[24px] hover:bg-slate-50 transition-colors">
                <input 
                  type="checkbox" 
                  className="w-5 h-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  checked={hasFinancing}
                  onChange={e => setHasFinancing(e.target.checked)}
                />
                <span className="font-bold text-slate-900 text-sm">Possui saldo financiado ou direto com a construtora?</span>
              </label>
            </div>

            {hasFinancing && (
              <div className="space-y-6 animate-in slide-in-from-top-2 p-6 border border-brand-100 rounded-[24px] bg-brand-50/30">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Valor a Financiar (R$)</label>
                    <input
                      type="number" step="0.01"
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:border-brand-500 outline-none"
                      value={financedAmount} onChange={e => setFinancedAmount(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Índice Correção A.A (Ex: INCC 6%)</label>
                    <input
                      type="number" step="0.01"
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:border-brand-500 outline-none"
                      placeholder="Ex: 5.5"
                      value={indexationRate} onChange={e => setIndexationRate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Quantidade de Parcelas</label>
                    <input
                      type="number"
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:border-brand-500 outline-none"
                      value={installments} onChange={e => setInstallments(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Valor Base da Parcela (R$)</label>
                    <input
                      type="number" step="0.01"
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:border-brand-500 outline-none"
                      value={installmentAmount} onChange={e => setInstallmentAmount(e.target.value)}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Data de Venc. da 1ª Parcela</label>
                    <input
                      type="date"
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:border-brand-500 outline-none"
                      value={firstDueDate} onChange={e => setFirstDueDate(e.target.value)}
                    />
                  </div>
                </div>

                {/* Balões */}
                <div className="pt-4 border-t border-brand-100">
                  <h5 className="text-xs font-bold text-slate-900 uppercase tracking-widest mb-4">Intermediárias / Balões</h5>
                  <div className="flex gap-2 mb-4">
                    <input
                      type="number" placeholder="Mês (1-12)" min="1" max="12"
                      className="w-24 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                      value={bMonth} onChange={e => setBMonth(e.target.value)}
                    />
                    <input
                      type="number" placeholder="Ano (Ex: 2026)" min="2020" max="2100"
                      className="w-28 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                      value={bYear} onChange={e => setBYear(e.target.value)}
                    />
                    <input
                      type="number" placeholder="Valor R$" step="0.01"
                      className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                      value={bAmount} onChange={e => setBAmount(e.target.value)}
                    />
                    <button type="button" onClick={addBalloon} className="bg-slate-900 text-white rounded-xl px-4 flex items-center justify-center hover:bg-slate-800">
                      <Plus size={16} />
                    </button>
                  </div>

                  {balloons.length > 0 && (
                    <div className="space-y-2">
                      {balloons.map((b, i) => (
                        <div key={i} className="flex justify-between items-center bg-white border border-slate-100 rounded-lg px-4 py-2 text-xs font-bold">
                          <span>{String(b.month).padStart(2, '0')}/{b.year}</span>
                          <span className="text-brand-600">R$ {b.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          <button onClick={() => removeBalloon(i)} className="text-red-400 hover:text-red-600"><Trash2 size={14}/></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="px-8 py-6 border-t border-slate-100 bg-slate-50 flex gap-4 shrink-0">
          <button disabled={isSubmitting} onClick={onClose} className="flex-1 px-6 py-4 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-slate-100 transition-colors">
            Cancelar
          </button>
          <button 
            disabled={isSubmitting} 
            onClick={handleSave} 
            className="flex-1 px-6 py-4 bg-brand-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg shadow-brand-500/20 hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Gerando Histórico...' : 'Concluir Aquisição'}
          </button>
        </div>
      </div>
    </div>
  );
};
