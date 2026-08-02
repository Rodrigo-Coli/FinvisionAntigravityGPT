import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { isFoundingOfferActive, getFoundingOfferMsRemaining, loadFoundingOfferFromDB, getFoundingHeadline } from '../../lib/foundingOffer';

interface Countdown {
  active: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function computeCountdown(): Countdown {
  const active = isFoundingOfferActive();
  const msRemaining = Math.max(0, getFoundingOfferMsRemaining());
  const totalSeconds = Math.floor(msRemaining / 1000);
  return {
    active,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

// Contagem sempre derivada de public.landing_settings (nunca localStorage / primeira
// visita). Enquanto a busca ao banco não resolve, active fica false por padrão — nunca
// mostra a oferta antes de confirmar que ela está realmente ligada.
export function useFoundingCountdown(): Countdown {
  const [countdown, setCountdown] = useState<Countdown>(computeCountdown);

  useEffect(() => {
    let mounted = true;
    loadFoundingOfferFromDB().finally(() => {
      if (mounted) setCountdown(computeCountdown());
    });
    const interval = setInterval(() => setCountdown(computeCountdown()), 1000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  return countdown;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export default function FoundingBar() {
  const countdown = useFoundingCountdown();

  if (!countdown.active) return null;

  return (
    <div className="inline-flex flex-wrap items-center justify-center gap-3 px-5 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 backdrop-blur-md">
      <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em]">
        <Clock size={14} /> {getFoundingHeadline() || 'Turma Fundadora — preço travado para sempre'}
      </span>
      <span className="flex items-center gap-1.5 font-mono text-sm font-bold text-white" aria-live="polite">
        <span className="px-2 py-0.5 bg-black/30 rounded-md">{countdown.days}d</span>
        <span className="px-2 py-0.5 bg-black/30 rounded-md">{pad(countdown.hours)}h</span>
        <span className="px-2 py-0.5 bg-black/30 rounded-md">{pad(countdown.minutes)}m</span>
        <span className="px-2 py-0.5 bg-black/30 rounded-md">{pad(countdown.seconds)}s</span>
      </span>
    </div>
  );
}
