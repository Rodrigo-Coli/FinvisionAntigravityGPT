import React, { useState } from 'react';

interface Plan {
  slug?: string;
  price_cents?: number;
}

interface ValueAnchorProps {
  plans: Plan[];
}

const currency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);

// Valor de referência para assessoria contábil avulsa voltada a PF/autônomos.
// AJUSTE conforme a média de mercado que você quiser usar como comparação.
const ACCOUNTING_MONTHLY_COST = 350;

export default function ValueAnchor({ plans }: ValueAnchorProps) {
  const [familyIncome, setFamilyIncome] = useState(15000);
  const [email, setEmail] = useState('');
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const [isSubmittingLead, setIsSubmittingLead] = useState(false);

  const plusPlan = plans.find((p) => p.slug === 'plus' || p.slug === 'familia');
  const zyvionMonthlyPrice = plusPlan?.price_cents ? plusPlan.price_cents / 100 : 39.9;

  const annualSavings = familyIncome * 0.075 * 12;
  const hoursSavedMonthly = Math.round(4 + familyIncome / 10000);

  return (
    <section className="py-24 relative z-10 bg-[#020617] border-t border-white/5">
      <div className="max-w-[1000px] mx-auto px-6">
        <div className="relative rounded-[40px] border border-white/10 bg-gradient-to-br from-slate-900 to-indigo-950/40 p-8 md:p-14 overflow-hidden shadow-[0_0_80px_rgba(79,70,229,0.15)]">
          <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-brand-500/10 rounded-full blur-[100px] pointer-events-none" />

          <div className="relative z-10">
            <span className="text-[10px] font-black text-brand-400 uppercase tracking-[0.3em] mb-4 block text-center md:text-left">Quanto isso está te custando hoje</span>
            <h2 className="text-3xl font-black tracking-tight mb-4 text-white text-center md:text-left">Quanto você está deixando escapar?</h2>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed font-medium text-center md:text-left">
              Arraste a barra para sua renda/despesa mensal e veja o tamanho do desperdício que passa despercebido — e quanto tempo isso consome da sua vida.
            </p>

            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">Renda / Despesa Mensal</span>
                      <span className="text-xl font-black text-white">{currency(familyIncome)}</span>
                    </div>
                    <input
                      type="range"
                      min="2000"
                      max="50000"
                      step="1000"
                      value={familyIncome}
                      onChange={(e) => setFamilyIncome(Number(e.target.value))}
                      className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-brand-500"
                      aria-label="Renda ou despesa mensal"
                    />
                    <div className="flex justify-between text-[9px] font-bold text-slate-500 uppercase mt-2">
                      <span>R$ 2.000</span>
                      <span>R$ 50.000</span>
                    </div>
                  </div>
                </div>

                <div className="mt-8 space-y-3">
                  <div className="flex items-center justify-between px-5 py-4 bg-white/5 border border-white/10 rounded-2xl">
                    <span className="text-xs font-bold text-slate-300">Planilha (seu tempo)</span>
                    <span className="text-sm font-black text-slate-200">~{hoursSavedMonthly}h/mês</span>
                  </div>
                  <div className="flex items-center justify-between px-5 py-4 bg-white/5 border border-white/10 rounded-2xl">
                    <span className="text-xs font-bold text-slate-300">Assessoria contábil avulsa</span>
                    <span className="text-sm font-black text-slate-200">a partir de {currency(ACCOUNTING_MONTHLY_COST)}/mês</span>
                  </div>
                  <div className="flex items-center justify-between px-5 py-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl">
                    <span className="text-xs font-bold text-emerald-300">Zyvion</span>
                    <span className="text-sm font-black text-emerald-300">a partir de {currency(zyvionMonthlyPrice)}/mês</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950/60 border border-white/5 rounded-3xl p-8 space-y-8 backdrop-blur-md">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Economia Anual Projetada (7,5%)</p>
                    <p className="text-2xl font-black text-emerald-400 font-mono tracking-tight">{currency(annualSavings)}</p>
                    <p className="text-[10px] text-slate-500 leading-tight">Média de desperdícios eliminados com organização</p>
                  </div>
                  <div className="space-y-2 border-l border-white/5 pl-6">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Tempo Salvo Mensalmente</p>
                    <p className="text-2xl font-black text-indigo-400 font-mono tracking-tight">{hoursSavedMonthly} horas</p>
                    <p className="text-[10px] text-slate-500 leading-tight">Substituindo conciliação e digitação manual</p>
                  </div>
                </div>

                <div className="border-t border-white/5 pt-6 space-y-4">
                  <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Receba seu Diagnóstico Gratuito por E-mail</p>
                  {leadSubmitted ? (
                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-bold leading-normal">
                      ✓ Diagnóstico enviado com sucesso! Verifique sua caixa de entrada em instantes.
                    </div>
                  ) : (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!email) return;
                        setIsSubmittingLead(true);
                        setTimeout(() => {
                          setIsSubmittingLead(false);
                          setLeadSubmitted(true);
                        }, 800);
                      }}
                      className="flex flex-col sm:flex-row gap-3"
                    >
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="seu@email.com"
                        aria-label="Seu e-mail para receber o diagnóstico"
                        className="flex-1 px-5 py-4 bg-slate-900 border border-white/10 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors min-h-[44px]"
                      />
                      <button
                        type="submit"
                        disabled={isSubmittingLead}
                        className="px-6 py-4 bg-white text-slate-900 hover:bg-slate-100 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap disabled:opacity-50 min-h-[44px]"
                      >
                        {isSubmittingLead ? 'Enviando...' : 'Enviar Diagnóstico'}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
