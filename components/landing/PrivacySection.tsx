import React from 'react';
import { ShieldCheck, Lock, Database, KeyRound, Trash2, ServerOff } from 'lucide-react';

const TECH_POINTS = [
  {
    icon: <Database size={22} />,
    title: 'Isolamento por Row Level Security',
    desc: 'No banco de dados (PostgreSQL), cada usuário só consegue ler e escrever os próprios dados. A regra é aplicada pelo próprio banco, não apenas pelo aplicativo — mesmo uma falha de código não expõe dados de outro usuário.',
  },
  {
    icon: <Lock size={22} />,
    title: 'Criptografia AES-256',
    desc: 'Seus dados são armazenados sob criptografia AES-256, o mesmo padrão usado por bancos e instituições financeiras para proteger informação sensível.',
  },
  {
    icon: <ServerOff size={22} />,
    title: 'Nenhuma credencial bancária',
    desc: 'O Zyvion nunca pede a senha do seu Internet Banking. A importação é feita por arquivo OFX ou CSV exportado por você — não existe integração que exija sua senha.',
  },
  {
    icon: <Trash2 size={22} />,
    title: 'Se você cancelar',
    desc: 'Seus dados continuam sob seu controle: você pode exportar tudo ou solicitar a exclusão completa da sua conta a qualquer momento, mesmo após o cancelamento.',
  },
];

export default function PrivacySection() {
  return (
    <section className="py-24 relative z-10 border-t border-white/5 bg-black">
      <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-full max-w-4xl h-64 bg-emerald-600/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 relative z-10">
        <div className="grid md:grid-cols-2 gap-16 items-center mb-20">
          <div>
            <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
              <ShieldCheck size={32} />
            </div>
            <h2 className="text-4xl lg:text-5xl font-black tracking-tight mb-6">Seus dados não treinam a <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Inteligência Artificial pública</span>.</h2>
            <p className="text-slate-400 text-lg font-medium max-w-xl mb-10 leading-relaxed">
              Aplicativos gratuitos costumam vender seu perfil de compra para financiar a operação.<br />
              O Zyvion funciona como um cofre digital isolado. Sua Inteligência Artificial processa extratos e cupons de forma isolada por usuário, e seus dados nunca são usados para treinar modelos públicos de IA.
            </p>
            <div className="inline-flex flex-wrap items-center gap-4">
              <div className="px-6 py-3 bg-white/5 border border-white/10 rounded-xl flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-300"><Lock size={16} className="text-emerald-500" /> AES-256 Bit</div>
              <div className="px-6 py-3 bg-white/5 border border-white/10 rounded-xl flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-300"><KeyRound size={16} className="text-emerald-500" /> Sem senha de banco</div>
            </div>
          </div>
          <div className="relative">
            <div className="aspect-square w-full max-w-md mx-auto relative group">
              <div className="absolute inset-0 border-2 border-emerald-500/20 rounded-full group-hover:scale-105 transition-transform duration-1000"></div>
              <div className="absolute inset-4 border border-dashed border-emerald-500/30 rounded-full animate-spin-slow"></div>
              <div className="absolute inset-16 bg-gradient-to-br from-emerald-900/50 to-slate-900 rounded-full flex flex-col items-center justify-center p-8 text-center shadow-2xl backdrop-blur-md border border-emerald-500/20">
                <Lock size={48} className="text-emerald-400 mb-4" />
                <span className="text-emerald-400 font-bold tracking-widest uppercase text-xs">Cofre Isolado por Usuário</span>
                <span className="text-slate-500 text-[10px] mt-2">Row Level Security + AES-256</span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/5 pt-16">
          <div className="text-center mb-12">
            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em] mb-4 block">Transparência técnica</span>
            <h3 className="text-2xl md:text-3xl font-black tracking-tight text-white">Como funciona por dentro</h3>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {TECH_POINTS.map((point) => (
              <div key={point.title} className="bg-gradient-to-br from-slate-900/80 to-slate-950/80 border border-white/10 rounded-[24px] p-6">
                <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center mb-4">
                  {point.icon}
                </div>
                <h4 className="text-base font-bold mb-2 text-white">{point.title}</h4>
                <p className="text-slate-400 text-sm leading-relaxed font-medium">{point.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
