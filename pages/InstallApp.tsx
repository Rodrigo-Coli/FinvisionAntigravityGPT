import React from 'react';
import { ChevronLeft, Download, Zap, Bell, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { InstallGuide } from '../components/install/InstallGuide';
import { isRunningInstalled } from '../lib/installGuide';

/**
 * Página pública "Como instalar o Zyvion" (#/instalar): abre com ou sem login,
 * para poder mandar o link a quem ainda não instalou.
 */
const InstallApp: React.FC = () => {
  const installed = isRunningInstalled();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 px-4 py-6 md:p-12">
      <div className="max-w-xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-brand-600 font-bold uppercase tracking-widest text-xs hover:text-brand-700 transition-colors min-h-[44px]">
            <ChevronLeft size={16} /> Voltar
          </Link>
          <img src="/logo-icon.png" alt="Zyvion" className="w-8 h-8 object-contain" />
        </div>

        <div className="bg-white dark:bg-slate-950 rounded-[28px] p-5 md:p-8 shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-4 mb-5">
            <div className="w-14 h-14 rounded-[20px] bg-brand-50 dark:bg-brand-950/40 text-brand-600 flex items-center justify-center shrink-0">
              <Download size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Instalar o Zyvion</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Passo a passo para cada aparelho e navegador.</p>
            </div>
          </div>

          {installed ? (
            <p className="mb-5 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-sm font-bold">
              Você já está usando o Zyvion instalado. Este guia serve para instalar em outro aparelho.
            </p>
          ) : (
            <div className="mb-5 grid grid-cols-3 gap-2 text-center text-[11px] font-bold text-slate-600 dark:text-slate-300">
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 flex flex-col items-center gap-1"><Zap size={16} className="text-amber-500" />Abre direto da tela inicial</div>
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 flex flex-col items-center gap-1"><Bell size={16} className="text-brand-500" />Avisos de vencimento</div>
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 flex flex-col items-center gap-1"><WifiOff size={16} className="text-emerald-500" />Funciona sem internet</div>
            </div>
          )}

          <InstallGuide />

          <p className="mt-6 text-xs text-slate-400 leading-snug">
            No iPhone, as notificações só funcionam com o Zyvion instalado na Tela de Início (iOS 16.4 ou mais novo).
          </p>
        </div>
      </div>
    </div>
  );
};

export default InstallApp;
