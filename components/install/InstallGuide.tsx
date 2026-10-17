import React, { useMemo, useState } from 'react';
import { Smartphone, Monitor, Check, Copy, AlertTriangle, X } from 'lucide-react';
import {
  InstallOS,
  InstallPlatform,
  OS_LABELS,
  detectCurrentInstallPlatform,
  guideForPlatform,
  guidesForOS
} from '../../lib/installGuide';

/** Toque no iPhone: só `onClick` (sem `onTouchStart`, que gera clique fantasma). */
const TAP_STYLE: React.CSSProperties = { touchAction: 'manipulation' };

interface InstallGuideProps {
  /** Aparelho detectado; por padrão, o atual. */
  platform?: InstallPlatform;
}

/**
 * Passo a passo de instalação para cada sistema e navegador. Abre já na aba do
 * aparelho/navegador de quem está vendo; as outras abas ficam a um toque.
 */
export const InstallGuide: React.FC<InstallGuideProps> = ({ platform }) => {
  const detected = useMemo(() => platform || detectCurrentInstallPlatform(), [platform]);
  const detectedGuide = useMemo(() => guideForPlatform(detected), [detected]);

  const [os, setOs] = useState<InstallOS>(detected.os);
  const [guideId, setGuideId] = useState<string>(detectedGuide.id);
  const [copied, setCopied] = useState(false);

  const tabs = guidesForOS(os);
  const baseGuide = tabs.find(g => g.id === guideId) || tabs[0];
  // Na aba do próprio navegador, mostra a variação exata (ex.: Safari antigo).
  const guide = baseGuide.id === detectedGuide.id ? detectedGuide : baseGuide;
  const isDetected = guide.id === detectedGuide.id && os === detected.os;

  const selectOs = (next: InstallOS) => {
    setOs(next);
    const first = next === detected.os ? detectedGuide.id : guidesForOS(next)[0].id;
    setGuideId(first);
  };

  const copyLink = async () => {
    const url = window.location.origin + '/';
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Sem permissão de área de transferência: mostra o link para copiar à mão.
      window.prompt('Copie o link e cole no Safari:', url);
    }
  };

  const osIcon = (o: InstallOS) => (o === 'desktop'
    ? <Monitor size={14} className="shrink-0" />
    : <Smartphone size={14} className="shrink-0" />);

  return (
    <div className="space-y-4">
      {/* Sistema */}
      <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Sistema">
        {(['ios', 'android', 'desktop'] as InstallOS[]).map(o => (
          <button
            key={o}
            type="button"
            role="tab"
            aria-selected={os === o}
            onClick={() => selectOs(o)}
            style={TAP_STYLE}
            className={`min-h-[44px] px-1.5 rounded-xl text-[10px] font-black uppercase tracking-wide flex items-center justify-center gap-1 leading-tight transition-colors ${
              os === o ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300'
            }`}
          >
            {osIcon(o)} {OS_LABELS[o]}
          </button>
        ))}
      </div>

      {/* Navegador */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Navegador">
        {tabs.map(g => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={guide.id === g.id}
            onClick={() => setGuideId(g.id)}
            style={TAP_STYLE}
            className={`min-h-[40px] px-3 rounded-full text-xs font-bold border transition-colors ${
              guide.id === g.id
                ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {isDetected && (
        <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
          <Check size={14} /> Este é o passo a passo do seu aparelho
          {detected.inAppName ? ` (você está dentro do ${detected.inAppName})` : ''}.
        </p>
      )}

      {guide.cannotInstall && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 text-xs font-bold">
          {guide.os === 'desktop' ? <X size={16} className="shrink-0 mt-0.5" /> : <AlertTriangle size={16} className="shrink-0 mt-0.5" />}
          <span>Neste navegador não dá para instalar. Veja abaixo como resolver.</span>
        </div>
      )}

      <ol className="space-y-3">
        {guide.steps.map((step, idx) => (
          <li key={idx} className="flex items-start gap-3">
            <span className="w-7 h-7 shrink-0 rounded-full bg-brand-600 text-white text-xs font-black flex items-center justify-center">
              {idx + 1}
            </span>
            <span className="text-sm text-slate-700 dark:text-slate-200 leading-snug pt-1">{step}</span>
          </li>
        ))}
      </ol>

      {guide.note && (
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3">
          {guide.note}
        </p>
      )}

      {guide.id === 'ios-inapp' && (
        <button
          type="button"
          onClick={copyLink}
          style={TAP_STYLE}
          className="w-full min-h-[44px] rounded-xl bg-brand-600 text-white text-sm font-bold flex items-center justify-center gap-2"
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Link copiado — cole no Safari' : 'Copiar link para abrir no Safari'}
        </button>
      )}
    </div>
  );
};

export default InstallGuide;
