import React from 'react';

interface Testimonial {
  quote: string;
  name: string;
  role: string;
  city: string;
  photoUrl: string;
  resultLabel: string;
  resultValue: string;
}

// Ainda não existem depoimentos reais de usuários — o produto está em lançamento.
// NÃO preencher com depoimentos fictícios. Quando houver depoimentos reais (com autorização
// da pessoa para uso do nome/foto), adicione objetos aqui seguindo o formato de Testimonial:
// {
//   quote: '...',
//   name: 'Nome Completo',
//   role: 'Profissão',
//   city: 'Cidade/UF',
//   photoUrl: '/testimonials/nome.jpg',
//   resultLabel: 'Ex: Tempo economizado por mês',
//   resultValue: 'Ex: 6 horas',
// }
const TESTIMONIALS: Testimonial[] = [];

export default function TestimonialsSection() {
  if (TESTIMONIALS.length === 0) return null;

  return (
    <section className="py-24 relative z-10 bg-[#020617] border-t border-white/5">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="text-center mb-16">
          <span className="text-[10px] font-black text-brand-400 uppercase tracking-[0.3em] mb-4 block">Depoimentos reais</span>
          <h2 className="text-3xl lg:text-5xl font-black tracking-tight mb-4 text-white">Quem usa, aprova e confia</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {TESTIMONIALS.map((item) => (
            <div key={item.name} className="bg-gradient-to-br from-slate-900/50 to-slate-950/50 border border-white/10 rounded-[32px] p-8 backdrop-blur-md flex flex-col justify-between hover:border-brand-500/30 transition-all duration-300">
              <div className="mb-8">
                <p className="text-slate-300 text-sm leading-relaxed italic">"{item.quote}"</p>
              </div>
              <div>
                <div className="flex items-center gap-4 pt-6 border-t border-white/5 mb-4">
                  <img src={item.photoUrl} alt={item.name} className="w-10 h-10 rounded-full object-cover border border-white/10" loading="lazy" />
                  <div>
                    <h4 className="font-bold text-sm text-white">{item.name}</h4>
                    <p className="text-xs text-slate-500">{item.role} — {item.city}</p>
                  </div>
                </div>
                <div className="px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
                  <p className="text-[9px] font-bold text-emerald-300 uppercase tracking-widest">{item.resultLabel}</p>
                  <p className="text-lg font-black text-emerald-400">{item.resultValue}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
