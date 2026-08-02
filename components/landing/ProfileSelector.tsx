import React, { useState } from 'react';
import { Stethoscope, Building2, LineChart, Briefcase, Landmark } from 'lucide-react';
import { trackEvent } from '../../lib/analytics';

interface Profile {
  id: string;
  label: string;
  icon: React.ReactNode;
  pain: string;
  modules: string[];
}

const PROFILES: Profile[] = [
  {
    id: 'liberal',
    label: 'Profissionais Liberais',
    icon: <Stethoscope size={20} />,
    pain: 'Você fatura bem, mas não sabe exatamente para onde o dinheiro vai. Pessoa física e consultório/clínica misturados na mesma cabeça — e na mesma conta.',
    modules: ['Multi-entidade (Pessoal x Empresa)', 'DRE exportável em PDF e Excel', 'Conciliação bancária assistida por IA'],
  },
  {
    id: 'empresario',
    label: 'Empresários e Sócios',
    icon: <Building2 size={20} />,
    pain: 'Múltiplas fontes de renda, várias contas e sócios diferentes — e nenhuma visão consolidada de quanto sobra de verdade no fim do mês.',
    modules: ['Dashboard consolidado', 'Multi-entidade (várias empresas/sócios)', 'DRE por categoria e subcategoria'],
  },
  {
    id: 'investidor',
    label: 'Investidores PF',
    icon: <LineChart size={20} />,
    pain: 'Patrimônio espalhado entre corretoras, imóveis e veículos. Você nunca sabe, com precisão, quanto vale o que você tem hoje.',
    modules: ['Investimentos por corretora e alocação', 'Patrimônio físico (imóveis, veículos, bens)', 'Projeção de fluxo de caixa'],
  },
  {
    id: 'autonomo',
    label: 'Autônomos e MEIs',
    icon: <Briefcase size={20} />,
    pain: 'Não dá para saber o que é da empresa e o que é seu sem perder uma hora numa planilha toda semana.',
    modules: ['Multi-entidade (Pessoal x MEI)', 'DRE simplificado', 'Categorias e orçamentos por tipo de gasto'],
  },
  {
    id: 'financiamento',
    label: 'Financiamento ou Consórcio',
    icon: <Landmark size={20} />,
    pain: 'Parcela-balão, indexação por IPCA ou INCC — nenhuma planilha comum dá conta de calcular isso direito.',
    modules: ['Motor de amortização com parcela-balão', 'Módulo de consórcio dedicado', 'Projeção de fluxo de caixa futuro'],
  },
];

export default function ProfileSelector() {
  const [activeId, setActiveId] = useState(PROFILES[0].id);
  const active = PROFILES.find((p) => p.id === activeId) ?? PROFILES[0];

  const handleSelect = (id: string) => {
    setActiveId(id);
    trackEvent('profile_select', { profile: id });
  };

  return (
    <section id="perfil" className="py-24 md:py-32 relative z-10 bg-[#020617] border-t border-white/5">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-12">
        <div className="text-center mb-12">
          <span className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em] mb-4 block">Feito para o seu caso</span>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight mb-4 text-white">Qual desses é o seu dia a dia?</h2>
          <p className="text-slate-400 font-medium text-lg max-w-2xl mx-auto">Escolha o seu perfil e veja exatamente o que o Zyvion resolve para você.</p>
        </div>

        <div className="flex flex-wrap justify-center gap-3 mb-10" role="tablist" aria-label="Selecione seu perfil">
          {PROFILES.map((profile) => (
            <button
              key={profile.id}
              role="tab"
              aria-selected={activeId === profile.id}
              onClick={() => handleSelect(profile.id)}
              className={`min-h-[44px] flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border ${
                activeId === profile.id
                  ? 'bg-white text-slate-900 border-white shadow-lg'
                  : 'bg-white/5 text-slate-300 border-white/10 hover:border-brand-500/40 hover:text-white'
              }`}
            >
              {profile.icon} {profile.label}
            </button>
          ))}
        </div>

        <div
          key={active.id}
          role="tabpanel"
          className="rounded-[32px] border border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-950/80 p-8 md:p-12 animate-in fade-in duration-500"
        >
          <p className="text-xl md:text-2xl font-bold text-white leading-relaxed mb-8 max-w-3xl">{active.pain}</p>
          <div className="grid sm:grid-cols-3 gap-4">
            {active.modules.map((mod) => (
              <div key={mod} className="px-5 py-4 bg-white/5 border border-white/10 rounded-2xl text-sm font-bold text-slate-200">
                {mod}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
