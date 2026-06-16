import React, { useEffect, useState } from 'react';
import { RefreshCw, X, Sparkles, Shield, Zap, TrendingUp, Cpu, Check } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

interface ChangelogBenefit {
  title: string;
  desc: string;
  type?: string;
}

interface ChangelogData {
  version: string;
  title: string;
  date: string;
  benefits?: ChangelogBenefit[];
  changes: string[];
}

const formatText = (text: string) => {
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return parts.map((part, index) => 
    index % 2 === 1 ? <strong key={index} className="font-extrabold text-slate-900 dark:text-white">{part}</strong> : part
  );
};

export const UpdateAlert: React.FC = () => {
  const [dismissed, setDismissed] = useState(false);
  const [changelog, setChangelog] = useState<ChangelogData | null>(null);
  const [serverVersion, setServerVersion] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r: ServiceWorkerRegistration | undefined) {
      if (r) {
        console.log('[SW] Service Worker registrado com sucesso. Polling de atualizações ativado.');
        // Verifica atualizações a cada 10 minutos
        const intervalId = setInterval(() => {
          r.update().catch((err: any) => console.warn('[SW] Falha ao atualizar SW no polling:', err));
        }, 10 * 60 * 1000);
        return () => clearInterval(intervalId);
      }
    }
  });

  // Forçar atualização do Service Worker sempre que a janela receber foco (usuário reabriu o app)
  useEffect(() => {
    const checkUpdatesOnFocus = () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(reg => {
          reg.update().catch((err: any) => console.warn('[SW] Falha ao atualizar SW no foco:', err));
        });
      }
    };

    window.addEventListener('focus', checkUpdatesOnFocus);
    
    // Executa uma verificação rápida no carregamento
    checkUpdatesOnFocus();

    return () => window.removeEventListener('focus', checkUpdatesOnFocus);
  }, []);

  // Monitorar necessidade de atualização e buscar metadados frescos bypassando cache
  useEffect(() => {
    if (needRefresh) {
      console.log('[SW] Nova versão detectada! Carregando notas de atualização...');
      
      const cb = Date.now();
      Promise.all([
        fetch(`/changelog.json?cb=${cb}`).then(res => res.json()).catch(() => null),
        fetch(`/version.json?cb=${cb}`).then(res => res.json()).catch(() => null)
      ]).then(([changelogData, versionData]) => {
        if (changelogData) setChangelog(changelogData);
        if (versionData && versionData.version) {
          setServerVersion(versionData.version);
        }
      }).catch((err: any) => {
        console.warn('[SW] Erro ao obter dados de atualização:', err);
      });
      
      setDismissed(false);
    }
  }, [needRefresh]);

  // Se o usuário dispensou o modal ou não há nada a mostrar, retorna nulo
  if (dismissed) return null;

  // 1. Modal Centralizado de Atualização Disponível
  if (needRefresh) {
    const getBenefitIcon = (type?: string) => {
      switch (type) {
        case 'security':
        case 'seguranca':
          return <Shield size={16} className="text-emerald-500" />;
        case 'speed':
        case 'performance':
        case 'rapidez':
          return <Zap size={16} className="text-amber-500" />;
        case 'precision':
        case 'math':
        case 'precisao':
          return <TrendingUp size={16} className="text-brand-500" />;
        case 'feature':
        case 'new':
        case 'recurso':
          return <Cpu size={16} className="text-indigo-500" />;
        case 'ux':
        case 'usability':
        case 'usabilidade':
          return <Sparkles size={16} className="text-purple-500" />;
        default:
          return <Check size={16} className="text-emerald-500" />;
      }
    };

    // Lista de benefícios dinâmicos carregados do changelog se existirem, caso contrário usa o fallback estático
    const benefits = changelog?.benefits && changelog.benefits.length > 0
      ? changelog.benefits.map(b => ({
          icon: getBenefitIcon(b.type),
          title: b.title,
          desc: b.desc
        }))
      : [
          {
            icon: <Shield size={16} className="text-emerald-500" />,
            title: "Mais Segurança para Você",
            desc: "Proteção atualizada para a sincronização das suas contas, investimentos e chaves seguras."
          },
          {
            icon: <Zap size={16} className="text-amber-500" />,
            title: "Carregamento Super Rápido",
            desc: "Código otimizado para que as telas, gráficos e filtros abram instantaneamente."
          },
          {
            icon: <TrendingUp size={16} className="text-brand-500" />,
            title: "Cálculos e Saldos Precisos",
            desc: "Correções e novos motores de rentabilidade que garantem que seu patrimônio seja recalculado de forma impecável."
          },
          {
            icon: <Cpu size={16} className="text-indigo-500" />,
            title: "Novos Recursos Ativos",
            desc: "Acesso direto às novas telas de patrimônio, consórcios, e sincronizadores automatizados."
          }
        ];

    const displayVersion = serverVersion || changelog?.version || 'Nova Versão';

    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-300">
        {/* Backdrop desfoque premium */}
        <div 
          className="absolute inset-0 bg-slate-950/50 backdrop-blur-md"
          onClick={() => setDismissed(true)} 
        />
        
        {/* Modal Premium com Design Harmonioso e Altamente Contrastante */}
        <div className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-[32px] p-6 shadow-2xl border border-slate-100 dark:border-slate-800/80 animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
          
          {/* Header */}
          <div className="flex flex-col items-center text-center mb-5 shrink-0">
            <div className="w-14 h-14 bg-gradient-to-tr from-brand-600 via-indigo-600 to-indigo-500 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-brand-500/20 mb-3.5">
              <Sparkles size={26} className="animate-pulse" />
            </div>
            <h3 className="text-base font-black text-slate-950 dark:text-white uppercase tracking-wider">
              {changelog?.title || 'Atualização Pronta!'}
            </h3>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[10px] font-black text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/40 px-2 py-0.5 rounded-lg border border-brand-100 dark:border-brand-900">
                v{displayVersion}
              </span>
              {changelog?.date && (
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                  Publicado em {changelog.date}
                </span>
              )}
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto pr-1 -mr-2 space-y-5 scrollbar-thin">
            
            {/* Benefícios Claros */}
            <div className="space-y-3.5">
              <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Por que você deve atualizar agora:
              </h4>
              
              <div className="space-y-3">
                {benefits.map((b, idx) => (
                  <div key={idx} className="flex gap-3 items-start bg-slate-50/50 dark:bg-slate-950/20 p-3 rounded-2xl border border-slate-100/50 dark:border-slate-800/40">
                    <div className="p-1.5 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 shrink-0 mt-0.5">
                      {b.icon}
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[11px] font-black text-slate-900 dark:text-slate-100">
                        {b.title}
                      </p>
                      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 leading-normal">
                        {b.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Mudanças Técnicas (Changelog do Dev) */}
            {changelog && changelog.changes && changelog.changes.length > 0 && (
              <div className="bg-slate-50/30 dark:bg-slate-950/10 rounded-2xl p-4 border border-slate-100/60 dark:border-slate-800/20">
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
                  Detalhes Técnicos da Versão:
                </p>
                
                <div className="space-y-2.5">
                  {changelog.changes.map((change, idx) => (
                    <div key={idx} className="flex gap-2.5 items-start text-xs text-slate-600 dark:text-slate-300 font-semibold leading-relaxed">
                      <div className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0 mt-1.5" />
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 leading-normal">
                        {formatText(change)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Ações */}
          <div className="flex flex-col gap-2.5 mt-5 shrink-0">
            <button
              onClick={() => {
                setIsUpdating(true);
                updateServiceWorker(true);
                // Fallback de segurança: recarrega a página após 2 segundos se o SW falhar em fazer a transição
                setTimeout(() => {
                  window.location.reload();
                }, 2000);
              }}
              disabled={isUpdating}
              className="w-full py-3.5 bg-brand-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-brand-700 active:scale-98 transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand-500/25 disabled:opacity-50"
            >
              <RefreshCw size={14} className={isUpdating ? 'animate-spin' : ''} />
              {isUpdating ? 'Instalando Novidades...' : 'ATUALIZAR AGORA'}
            </button>
            
            <button
              onClick={() => setDismissed(true)}
              disabled={isUpdating}
              className="w-full py-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 text-[10px] font-black uppercase tracking-widest transition-colors"
            >
              Atualizar mais tarde
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Toast Inferior para Status "Pronto para Uso Offline"
  if (offlineReady) {
    return (
      <div className="fixed bottom-4 right-4 z-[9999] p-3.5 max-w-sm bg-slate-950 text-white rounded-2xl shadow-2xl border border-slate-800 animate-in slide-in-from-bottom duration-300 flex items-center gap-3.5">
        <div className="w-9 h-9 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center shrink-0 border border-emerald-500/10">
          <Check size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-black tracking-wide">FinVision Pronto Offline!</p>
          <p className="text-[10px] font-bold text-slate-400 mt-0.5 leading-normal">O aplicativo foi salvo e funcionará normalmente sem internet.</p>
        </div>
        <button 
          onClick={() => setDismissed(true)} 
          className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return null;
};

export default UpdateAlert;
