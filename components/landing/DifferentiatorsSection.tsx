import React from 'react';
import { FileSpreadsheet, Landmark, Users2, BarChart3, SplitSquareHorizontal } from 'lucide-react';

const DIFFERENTIATORS = [
  {
    icon: <FileSpreadsheet size={28} />,
    title: 'DRE Pessoal e Empresarial',
    desc: 'Receitas x Despesas por tipo, categoria e subcategoria — exportável em PDF e Excel na hora que você precisar mostrar para um contador ou sócio.',
    color: 'text-brand-400',
    bg: 'bg-brand-500/10',
    border: 'border-brand-500/20',
  },
  {
    icon: <Landmark size={28} />,
    title: 'Amortização com Parcela-Balão',
    desc: 'Financiamento imobiliário ou veicular com motor de amortização de verdade: parcelas-balão e indexação por IPCA ou INCC, calculadas automaticamente.',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
  },
  {
    icon: <Users2 size={28} />,
    title: 'Módulo de Consórcio Dedicado',
    desc: 'Nenhum app tradicional trata consórcio como cidadão de primeira classe. O Zyvion sim — com parcelas, contemplação e projeção próprias.',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
  },
  {
    icon: <BarChart3 size={28} />,
    title: 'Minha Inflação',
    desc: 'O IPCA é uma média nacional. Aqui você vê a inflação real da sua vida, calculada item a item a partir dos seus próprios cupons fiscais.',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/20',
  },
  {
    icon: <SplitSquareHorizontal size={28} />,
    title: 'Separação Pessoal x Empresa',
    desc: 'Mesma conta, visões separadas. Marque cada lançamento por entidade e decida o que entra ou não no seu consolidado total.',
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
  },
];

export default function DifferentiatorsSection() {
  return (
    <section className="py-24 md:py-32 relative z-10 bg-slate-950/50 border-t border-white/5">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="text-center mb-16">
          <span className="text-[10px] font-black text-brand-400 uppercase tracking-[0.3em] mb-4 block">Os 5 diferenciais que ninguém mais tem</span>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight mb-4 text-white">Isso aqui não existe em nenhum outro app.</h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {DIFFERENTIATORS.map((item) => (
            <div
              key={item.title}
              className="bg-gradient-to-br from-slate-900 to-[#0B1120] border border-white/10 rounded-[32px] p-8 md:p-10 hover:-translate-y-1 hover:border-white/20 transition-all"
            >
              <div className={`w-16 h-16 ${item.bg} ${item.border} border rounded-2xl flex items-center justify-center ${item.color} mb-6`}>
                {item.icon}
              </div>
              <h3 className="text-2xl font-black tracking-tight mb-3 text-white">{item.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed font-medium">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
