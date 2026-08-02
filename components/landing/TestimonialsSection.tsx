import React, { useEffect, useState } from 'react';
import { LandingService, LandingTestimonial } from '../../services/landing.service';

// Os depoimentos agora vêm de public.landing_testimonials, editável em
// Admin > Landing > Depoimentos (visível apenas para superadmin). Um depoimento só é
// gravado como ativo no banco se consent_given estiver marcado (checado também por
// constraint no Postgres, não só na UI).
//
// Enquanto não houver nenhum depoimento ativo, a seção inteira não renderiza — sem
// skeleton aqui: "nada" já é o estado seguro e correto antes/depois do carregamento,
// então mostrar um esqueleto que troca para "nada" seria só um flash a mais na tela.
export default function TestimonialsSection() {
  const [loading, setLoading] = useState(true);
  const [testimonials, setTestimonials] = useState<LandingTestimonial[]>([]);

  useEffect(() => {
    let mounted = true;
    LandingService.getActiveTestimonials().then((data) => {
      if (!mounted) return;
      setTestimonials(data);
      setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  if (loading || testimonials.length === 0) return null;

  return (
    <section className="py-24 relative z-10 bg-[#020617] border-t border-white/5">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="text-center mb-16">
          <span className="text-[10px] font-black text-brand-400 uppercase tracking-[0.3em] mb-4 block">Depoimentos reais</span>
          <h2 className="text-3xl lg:text-5xl font-black tracking-tight mb-4 text-white">Quem usa, aprova e confia</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((item) => (
            <div key={item.id} className="bg-gradient-to-br from-slate-900/50 to-slate-950/50 border border-white/10 rounded-[32px] p-8 backdrop-blur-md flex flex-col justify-between hover:border-brand-500/30 transition-all duration-300">
              <div className="mb-8">
                <p className="text-slate-300 text-sm leading-relaxed italic">"{item.quote}"</p>
              </div>
              <div>
                <div className="flex items-center gap-4 pt-6 border-t border-white/5 mb-4">
                  {item.photo_url ? (
                    <img src={item.photo_url} alt={item.name} className="w-10 h-10 rounded-full object-cover border border-white/10" loading="lazy" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-xs font-black text-brand-300">
                      {item.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h4 className="font-bold text-sm text-white">{item.name}</h4>
                    {(item.role || item.city) && (
                      <p className="text-xs text-slate-500">{[item.role, item.city].filter(Boolean).join(' — ')}</p>
                    )}
                  </div>
                </div>
                {item.result_label && item.result_value && (
                  <div className="px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
                    <p className="text-[9px] font-bold text-emerald-300 uppercase tracking-widest">{item.result_label}</p>
                    <p className="text-lg font-black text-emerald-400">{item.result_value}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
