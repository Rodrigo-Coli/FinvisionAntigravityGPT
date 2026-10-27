import React from 'react';
import { AlertTriangle, RefreshCw, WifiOff, Home } from 'lucide-react';

/** Falha ao baixar uma parte do app (tela carregada sob demanda). */
export const isChunkLoadError = (error: unknown): boolean =>
    /dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk [\w-]+ failed/i
        .test(String((error as any)?.message || error || ''));

const RELOAD_GUARD_KEY = 'zyvion_chunk_reload_at';

/** Recarrega só se não recarregou por isso há pouco (evita laço). */
const reloadOnceForChunk = (): boolean => {
    try {
        const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
        if (Date.now() - last < 30000) return false;
        sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    } catch { /* sem sessionStorage: recarrega uma vez mesmo assim */ }
    window.location.reload();
    return true;
};

/** Recarregar só funciona sem internet se o app já estiver salvo no aparelho (service worker). */
const canReloadNow = (): boolean =>
    navigator.onLine || !!(typeof navigator !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker.controller);

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('ErrorBoundary capturou:', error, errorInfo);
        // Com internet, parte do app que não baixa = versão nova publicada
        // (arquivos antigos saíram do servidor): recarregar resolve.
        if (isChunkLoadError(error) && navigator.onLine) reloadOnceForChunk();
    }

    handleReload = () => {
        // Sem internet e sem o app salvo, recarregar dá "Não é possível acessar
        // esse site". Melhor voltar ao início, que já está na memória.
        if (!canReloadNow()) { this.handleGoHome(); return; }
        this.setState({ hasError: false, error: null });
        window.location.reload();
    };

    handleGoHome = () => {
        try { window.location.hash = '#/'; } catch { /* segue */ }
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError && isChunkLoadError(this.state.error) && !navigator.onLine) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-brand-900 p-8">
                    <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-3xl shadow-xl p-10 text-center space-y-6 border border-slate-100 dark:border-slate-700">
                        <div className="w-16 h-16 mx-auto bg-amber-50 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center">
                            <WifiOff size={32} className="text-amber-500" />
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Sem internet</h2>
                            <p className="text-sm text-slate-500 dark:text-slate-300 font-medium">
                                Esta tela ainda não foi salva no aparelho para usar sem internet. Seus dados estão seguros.
                            </p>
                            <p className="text-xs text-slate-400 font-medium">
                                Quando voltar a ter internet, deixe o app aberto alguns segundos: ele baixa tudo e passa a abrir offline.
                            </p>
                        </div>
                        <div className="flex flex-col gap-2 items-center">
                            <button
                                onClick={this.handleGoHome}
                                className="inline-flex items-center gap-2 px-8 py-3 bg-brand-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-brand-500/20 hover:scale-105 transition-transform"
                            >
                                <Home size={16} />
                                Voltar ao início
                            </button>
                            <button onClick={this.handleReload} className="text-xs font-bold text-slate-400 hover:text-slate-600">Tentar de novo</button>
                        </div>
                    </div>
                </div>
            );
        }

        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-brand-900 p-8">
                    <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-3xl shadow-xl p-10 text-center space-y-6 border border-slate-100 dark:border-slate-700">
                        <div className="w-16 h-16 mx-auto bg-rose-50 dark:bg-rose-900/30 rounded-2xl flex items-center justify-center">
                            <AlertTriangle size={32} className="text-rose-500" />
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Ops! Algo deu errado</h2>
                            <p className="text-sm text-slate-400 font-medium">
                                Encontramos um erro inesperado. Seus dados estão seguros — tente recarregar a página.
                            </p>
                        </div>
                        {this.state.error && (
                            <div className="bg-slate-50 dark:bg-brand-900 rounded-xl p-4 text-left">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Detalhes técnicos</p>
                                <p className="text-xs text-slate-500 font-mono break-all">{this.state.error.message}</p>
                            </div>
                        )}
                        <button
                            onClick={this.handleReload}
                            className="inline-flex items-center gap-2 px-8 py-3 bg-brand-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-brand-500/20 hover:scale-105 transition-transform"
                        >
                            <RefreshCw size={16} />
                            Recarregar Página
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
