import React from 'react';
import { Upload, CreditCard, Target, Calculator, Receipt, Mic, Users, Percent, Gift, Smartphone } from 'lucide-react';

const MODULES = [
  { icon: <Upload size={22} />, title: 'Importação + Conciliação', desc: 'Importe o extrato do mês e a IA classifica tudo enquanto você toma um café.' },
  { icon: <CreditCard size={22} />, title: 'Cartões de Crédito', desc: 'Acompanhe fechamento, vencimento e parcelamento de cada cartão sem levar susto de fatura.' },
  { icon: <Target size={22} />, title: 'Metas e Orçamentos', desc: 'Veja sua meta preencher sozinha conforme o dinheiro entra e sai da conta certa.' },
  { icon: <Calculator size={22} />, title: 'Projeção de Fluxo de Caixa', desc: 'Descubra hoje se vai faltar dinheiro daqui a 3 meses, antes que aconteça.' },
  { icon: <Receipt size={22} />, title: 'IA Labs', desc: 'Tire foto do cupom e a IA aponta onde o mesmo item está mais barato perto de você.' },
  { icon: <Mic size={22} />, title: 'Assistente de Voz', desc: 'Fale com a IA por áudio e ela lança, categoriza e responde na hora, sem digitar nada.' },
  { icon: <Users size={22} />, title: 'Multi-usuário', desc: 'Use em família ou com sócios, cada pessoa com o seu próprio acesso.' },
  { icon: <Percent size={22} />, title: 'Índices Configuráveis', desc: 'Investimentos e dívidas corrigidos automaticamente por CDI, IPCA ou IGP-M.' },
  { icon: <Gift size={22} />, title: 'Programa de Indicação', desc: 'Indique o Zyvion e receba de volta via Pix ou como desconto na sua mensalidade.' },
  { icon: <Smartphone size={22} />, title: 'App Instalável (PWA)', desc: 'Instale como app, use offline e receba avisos por push e por WhatsApp.' },
];

export default function EcosystemSection() {
  return (
    <section id="ecosystem" className="py-24 md:py-32 relative z-10 bg-[#020617] border-t border-white/5">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="text-center mb-16">
          <span className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em] mb-4 block">Ecossistema Completo</span>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight mb-4 text-white">Tudo em um único lugar.</h2>
          <p className="text-slate-400 font-medium text-lg max-w-2xl mx-auto">Chega de usar 5 aplicativos diferentes e planilhas quebradas do Excel.</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {MODULES.map((mod) => (
            <div key={mod.title} className="bg-gradient-to-br from-slate-900/80 to-slate-950/80 border border-white/10 rounded-[24px] p-6 hover:bg-slate-800/60 transition-colors">
              <div className="w-12 h-12 bg-white/5 border border-white/10 text-white rounded-xl flex items-center justify-center mb-4">
                {mod.icon}
              </div>
              <h3 className="text-base font-bold mb-2 text-white">{mod.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed font-medium">{mod.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
