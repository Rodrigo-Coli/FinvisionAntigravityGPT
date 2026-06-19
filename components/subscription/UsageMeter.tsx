import React from 'react';
import { Zap, TrendingUp } from 'lucide-react';
import { DateUtils } from '../../lib/dateUtils';

interface UsageMeterProps {
  used: number;
  limit: number;
  resetAt?: string | null;
  compact?: boolean;
  onUpgradeClick?: () => void;
}

const UsageMeter: React.FC<UsageMeterProps> = ({ used, limit, resetAt, compact = false, onUpgradeClick }) => {
  const isUnlimited = limit === -1 || limit === null;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const color = pct >= 90 ? 'rose' : pct >= 70 ? 'amber' : 'emerald';
  const colorMap: Record<string, { bar: string; text: string; bg: string; border: string }> = {
    emerald: { bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-100 dark:border-emerald-900/30' },
    amber:   { bar: 'bg-amber-500',   text: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-50 dark:bg-amber-950/30',   border: 'border-amber-100 dark:border-amber-900/30' },
    rose:    { bar: 'bg-rose-500',    text: 'text-rose-600 dark:text-rose-400',    bg: 'bg-rose-50 dark:bg-rose-950/30',    border: 'border-rose-100 dark:border-rose-900/30' },
  };
  const c = colorMap[color];
  const resetLabel = resetAt ? DateUtils.formatDisplayDate(resetAt) : null;

  if (compact) {
    return (
      <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border cursor-pointer hover:scale-[1.02] transition-transform ${c.bg} ${c.border}`} onClick={onUpgradeClick}>
        <Zap size={16} className={c.text} />
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center mb-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Scans IA</p>
            <p className={`text-[10px] font-black ${c.text}`}>{isUnlimited ? 'Ilimitado' : `${used}/${limit}`}</p>
          </div>
          {!isUnlimited && (
            <div className="h-1.5 bg-white/60 dark:bg-slate-700/60 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-700 ${c.bar}`} style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
        {resetLabel && <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 whitespace-nowrap hidden sm:block">Renova {resetLabel}</p>}
        {pct >= 80 && !isUnlimited && <TrendingUp size={14} className={c.text} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${c.bg} ${c.border} border`}>
            <Zap size={18} className={c.text} />
          </div>
          <div>
            <p className="font-black text-slate-900 dark:text-white text-sm">Escaneamentos IA</p>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              {isUnlimited ? 'Uso ilimitado neste plano' : `${pct}% utilizado este mes`}
            </p>
          </div>
        </div>
        <span className={`text-xl font-black ${c.text}`}>{isUnlimited ? 'inf' : `${used} / ${limit}`}</span>
      </div>
      {!isUnlimited && (
        <div className="space-y-2">
          <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${c.bar}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-[10px] font-bold text-slate-400 dark:text-slate-500">
            <span>{used} usados</span>
            {resetLabel && <span>Renova em {resetLabel}</span>}
            <span>{limit - used} restantes</span>
          </div>
        </div>
      )}
      {pct >= 80 && !isUnlimited && onUpgradeClick && (
        <button onClick={onUpgradeClick} className="w-full py-3 bg-gradient-to-r from-amber-500 to-rose-500 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:opacity-90 transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2">
          <TrendingUp size={14} /> Voce esta quase no limite - Ver upgrade
        </button>
      )}
    </div>
  );
};

export default UsageMeter;
