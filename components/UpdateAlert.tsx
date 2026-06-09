import React, { useEffect, useState } from 'react';
import { RefreshCw, X, Sparkles } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

interface ChangelogData {
  version: string;
  title: string;
  date: string;
  changes: string[];
}

const formatText = (text: string) => {
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return parts.map((part, index) => 
    index % 2 === 1 ? <strong key={index} className="font-black text-slate-900 dark:text-white">{part}</strong> : part
  );
};

export const UpdateAlert: React.FC = () => {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  const [dismissed, setDismissed] = useState(false);
  const [changelog, setChangelog] = useState<ChangelogData | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (needRefresh) {
      console.log('UpdateAlert: New content available, loading changelog');
      fetch(`/changelog.json?cb=${Date.now()}`)
        .then(res => res.json())
        .then(data => {
          setChangelog(data);
        })
        .catch(err => {
          console.warn('Failed to load changelog:', err);
        });
      setDismissed(false);
    }
  }, [needRefresh]);

  // If dismissed or nothing to show, render nothing
  if (dismissed) return null;

  // 1. Center Modal for New Update
  if (needRefresh) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-300">
        {/* Backdrop blur */}
        <div 
          className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
          onClick={() => setDismissed(true)} 
        />
        
        {/* Modal Content */}
        <div className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-[32px] p-6 shadow-2xl border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-300">
          {/* Header */}
          <div className="flex flex-col items-center text-center mb-5">
            <div className="w-12 h-12 bg-gradient-to-tr from-brand-600 to-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-brand-500/25 mb-3">
              <Sparkles size={22} className="animate-pulse" />
            </div>
            <h3 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-wider">
              {changelog?.title || 'Nova Versão Disponível!'}
            </h3>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[10px] font-black text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/50 px-2 py-0.5 rounded-lg border border-brand-100 dark:border-brand-900">
                v{changelog?.version || 'Atualização'}
              </span>
              {changelog?.date && (
                <span className="text-[10px] font-bold text-slate-400">
                  Lançado em {changelog.date}
                </span>
              )}
            </div>
          </div>

          {/* Change list */}
          <div className="bg-slate-50/60 dark:bg-slate-950/40 rounded-2xl p-4 mb-6">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
              O que mudou nesta versão:
            </p>
            
            <div className="max-h-60 overflow-y-auto space-y-3.5 pr-1.5 scrollbar-thin">
              {changelog && changelog.changes && changelog.changes.length > 0 ? (
                changelog.changes.map((change, idx) => (
                  <div key={idx} className="flex gap-2.5 items-start text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0 mt-1.5" />
                    <div>{formatText(change)}</div>
                  </div>
                ))
              ) : (
                <>
                  <div className="flex gap-2.5 items-start text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0 mt-1.5" />
                    <div>Melhorias de desempenho e estabilidade do sistema.</div>
                  </div>
                  <div className="flex gap-2.5 items-start text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0 mt-1.5" />
                    <div>Otimizações de layout e correções de interface.</div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <button
              onClick={() => {
                setIsUpdating(true);
                updateServiceWorker(true);
              }}
              disabled={isUpdating}
              className="w-full py-3.5 bg-brand-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-brand-700 active:scale-98 transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand-500/20 disabled:opacity-50"
            >
              <RefreshCw size={14} className={isUpdating ? 'animate-spin' : ''} />
              {isUpdating ? 'Instalando...' : 'Atualizar FinVision'}
            </button>
            
            <button
              onClick={() => setDismissed(true)}
              disabled={isUpdating}
              className="w-full py-2.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 text-xs font-bold transition-colors"
            >
              Atualizar mais tarde
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Bottom Toast for Offline Ready status
  if (offlineReady) {
    return (
      <div className="fixed bottom-4 right-4 z-[9999] p-3 max-w-sm bg-slate-900 text-white rounded-2xl shadow-xl border border-slate-800 animate-in slide-in-from-bottom duration-300 flex items-center gap-3">
        <div className="w-8 h-8 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center shrink-0">
          <Sparkles size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold">App pronto para uso offline!</p>
          <p className="text-[10px] text-slate-400 mt-0.5">O FinVision Pro foi salvo para acesso offline.</p>
        </div>
        <button 
          onClick={() => setDismissed(true)} 
          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return null;
};

export default UpdateAlert;
