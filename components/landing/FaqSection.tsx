import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { trackEvent } from '../../lib/analytics';

const FAQS = [
  { q: 'Eu preciso dar a senha do meu banco?', a: 'Não. O Zyvion nunca pede sua senha de Internet Banking. Você exporta o extrato em OFX ou CSV direto do seu banco e importa no Conciliador — a IA classifica tudo automaticamente.' },
  { q: 'Meus dados são vendidos ou usados para treinar IA?', a: 'Não. Seus dados ficam isolados por Row Level Security no banco, protegidos com criptografia AES-256, e nunca são usados para treinar modelos públicos de Inteligência Artificial.' },
  { q: 'Funciona para pessoa jurídica (PJ)?', a: 'Sim. Você pode separar Pessoal, Empresa e até terceiros na mesma conta, com DRE próprio para cada entidade e a opção de consolidar ou não os totais.' },
  { q: 'De quais bancos o Zyvion importa extratos?', a: 'De qualquer banco que exporte arquivos no formato OFX ou CSV — que é praticamente todos os bancos e corretoras do Brasil.' },
  { q: 'Tem aplicativo de celular?', a: 'O Zyvion é um PWA: instala como app no seu celular (Android ou iPhone), funciona offline e envia notificações push, sem precisar passar pela loja de aplicativos.' },
  { q: 'Posso cancelar quando quiser?', a: 'Sim, sem multa e sem burocracia. O cancelamento vale até o fim do período já pago — você continua com acesso completo até lá.' },
  { q: 'O que acontece com meus dados se eu cancelar?', a: 'Seus dados continuam sob seu controle: você pode exportar tudo antes ou depois do cancelamento, ou solicitar a exclusão completa da sua conta a qualquer momento.' },
  { q: 'Como funciona o suporte?', a: 'Suporte via e-mail para todos os planos, com prioridade de atendimento para assinantes dos planos Plus e Pro.' },
];

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    const isOpening = openIndex !== index;
    setOpenIndex(isOpening ? index : null);
    if (isOpening) {
      trackEvent('faq_open', { question: FAQS[index].q });
    }
  };

  return (
    <section className="py-24 md:py-32 relative z-10 bg-[#020617] border-t border-white/5">
      <div className="max-w-3xl mx-auto px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-black tracking-tight text-white mb-4">Perguntas Frequentes</h2>
          <p className="text-slate-400">Elimine qualquer dúvida antes de começar.</p>
        </div>
        <div className="space-y-4">
          {FAQS.map((faq, i) => {
            const isOpen = openIndex === i;
            const panelId = `faq-panel-${i}`;
            const buttonId = `faq-button-${i}`;
            return (
              <div key={faq.q} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                <h3>
                  <button
                    id={buttonId}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggle(i)}
                    className="w-full flex items-center justify-between gap-4 font-bold text-white p-6 text-left min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <span className={isOpen ? 'text-brand-400' : ''}>{faq.q}</span>
                    <ChevronRight className={`shrink-0 transform transition-transform text-slate-500 ${isOpen ? 'rotate-90' : ''}`} size={20} />
                  </button>
                </h3>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  hidden={!isOpen}
                  className="px-6 pb-6 text-slate-400 text-sm leading-relaxed border-t border-white/5 pt-4"
                >
                  {faq.a}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
