import React from 'react';
import { Lock, CreditCard, ExternalLink, MessageCircle } from 'lucide-react';
import { useSubscription } from '../contexts/SubscriptionContext';
import { supabase } from '../lib/supabase/client';

export default function UpgradeModal() {
  const { subscription, loadingSub } = useSubscription();

  if (loadingSub || !subscription) return null;

  const isTrialExpired = subscription.status === 'trialing' && subscription.trial_ends_at && new Date(subscription.trial_ends_at) < new Date();
  const isPastDue = subscription.status === 'past_due' || subscription.status === 'canceled';

  return null; // Não bloqueia mais a tela (inadimplentes usam plano Starter com banner)

  const handleLogout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
      window.location.href = '/';
    }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-brand-900/90 backdrop-blur-xl">
      <div className="bg-white rounded-3xl max-w-md w-full p-8 text-center shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-rose-500 to-orange-500" />
        
        <div className="mx-auto w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500 mb-6">
          <Lock size={32} />
        </div>

        <h2 className="text-2xl font-black text-slate-900 mb-2">
          {isTrialExpired ? 'Seu período de teste acabou' : 'Assinatura Pendente'}
        </h2>
        <p className="text-slate-500 mb-8 text-sm leading-relaxed">
          {isTrialExpired 
            ? 'Esperamos que você tenha gostado do Zyvion! Para continuar usando todos os recursos premium e a inteligência artificial, você precisa adquirir um plano.'
            : 'Sua assinatura encontra-se com o pagamento pendente ou foi cancelada. Regularize sua situação para voltar a usar o sistema.'}
        </p>

        <div className="space-y-3">
          <a
            href="https://wa.me/5511999999999?text=Oi%21+Gostaria+de+renovar+ou+assinar+meu+plano+no+Zyvion."
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex justify-center items-center gap-2 py-3.5 bg-brand-600 text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-brand-700 transition-all"
          >
            <CreditCard size={16} />
            Renovar Assinatura
          </a>

          <a
            href="https://wa.me/5511999999999?text=Preciso+de+ajuda+com+minha+assinatura+do+Zyvion."
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex justify-center items-center gap-2 py-3.5 bg-slate-100 text-slate-700 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-slate-200 transition-all"
          >
            <MessageCircle size={16} />
            Falar com Suporte
          </a>
        </div>

        <button 
          onClick={handleLogout}
          className="mt-8 text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-widest underline"
        >
          Sair da conta
        </button>
      </div>
    </div>
  );
}
