import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

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
    }

    handleReload = () => {
        this.setState({ hasError: false, error: null });
        window.location.reload();
    };

    render() {
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
