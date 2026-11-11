import React, { useState } from 'react';
import { BellOff, Check, X } from 'lucide-react';

// "Ocultar por X dias" dos avisos da tela inicial (Radar urgente e juros não
// recebidos). Atalhos de 7/15/30 dias ou qualquer número de dias (1 a 365).
export const SNOOZE_PRESETS = [7, 15, 30] as const;
export const clampSnoozeDays = (n: number) => Math.min(365, Math.max(1, Math.round(n)));

const SnoozeControl: React.FC<{
  onSnooze: (days: number) => Promise<void> | void;
  defaultDays?: number;
  testId?: string;
  /** 'dark' = sobre faixa colorida (tela inicial); 'light' = sobre fundo branco. */
  variant?: 'dark' | 'light';
  label?: string;
}> = ({ onSnooze, defaultDays = 7, testId, variant = 'dark', label = 'Ocultar' }) => {
  const light = variant === 'light';
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(String(defaultDays));
  const [saving, setSaving] = useState(false);

  const stop = (e: React.SyntheticEvent) => { e.stopPropagation(); };
  const apply = async (days: number) => {
    if (!Number.isFinite(days) || days <= 0) return;
    setSaving(true);
    try { await onSnooze(clampSnoozeDays(days)); setOpen(false); } finally { setSaving(false); }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={e => { stop(e); setOpen(true); }}
        className={light
          ? 'px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 text-slate-600 font-bold flex items-center gap-1.5 text-xs'
          : 'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-[11px] font-bold text-white'}
        data-testid={testId}
      >
        <BellOff size={12} /> {label}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" onClick={stop} data-testid={testId ? `${testId}-options` : undefined}>
      <span className={`text-[11px] font-bold ${light ? 'text-slate-600' : 'text-white/90'}`}>Ocultar por</span>
      {SNOOZE_PRESETS.map(d => (
        <button key={d} type="button" disabled={saving} onClick={() => apply(d)}
          className={`px-2 py-1 rounded-lg text-[11px] font-black disabled:opacity-60 ${light ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-white/20 hover:bg-white/30 text-white'}`}>
          {d} dias
        </button>
      ))}
      <input
        type="number" min={1} max={365} inputMode="numeric" value={custom}
        onChange={e => setCustom(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') apply(Number(custom)); }}
        className={`w-14 px-1.5 py-1 rounded-lg bg-white text-slate-800 text-[11px] font-bold ${light ? 'border border-slate-200' : ''}`}
        aria-label="Quantidade de dias"
      />
      <button type="button" disabled={saving} onClick={() => apply(Number(custom))}
        className={`p-1 rounded-lg disabled:opacity-60 ${light ? 'bg-slate-800 text-white' : 'bg-white text-slate-800'}`} aria-label="Ocultar pelos dias informados">
        <Check size={12} />
      </button>
      <button type="button" onClick={() => setOpen(false)} className={`p-1 rounded-lg ${light ? 'bg-slate-100 text-slate-600' : 'bg-white/15 text-white'}`} aria-label="Cancelar">
        <X size={12} />
      </button>
    </div>
  );
};

export default SnoozeControl;
