import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, Info, X, XCircle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType>({ toast: () => { } });

export const useToast = () => useContext(ToastContext);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = crypto.randomUUID();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
    }, []);

    const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

    const icons: Record<ToastType, React.ReactNode> = {
        success: <CheckCircle2 size={18} className="text-emerald-500" />,
        error: <XCircle size={18} className="text-rose-500" />,
        warning: <AlertTriangle size={18} className="text-amber-500" />,
        info: <Info size={18} className="text-brand-500" />,
    };

    const bgColors: Record<ToastType, string> = {
        success: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-700',
        error: 'bg-rose-50 border-rose-200 dark:bg-rose-900/30 dark:border-rose-700',
        warning: 'bg-amber-50 border-amber-200 dark:bg-amber-900/30 dark:border-amber-700',
        info: 'bg-brand-50 border-brand-200 dark:bg-brand-900/30 dark:border-brand-700',
    };

    return (
        <ToastContext.Provider value={{ toast: addToast }}>
            {children}
            {/* Toast Container — Fixed top-right */}
            <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: '400px' }}>
                {toasts.map(t => (
                    <div
                        key={t.id}
                        className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-sm animate-in slide-in-from-right-5 duration-300 ${bgColors[t.type]}`}
                    >
                        {icons[t.type]}
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-200 flex-1">{t.message}</span>
                        <button onClick={() => removeToast(t.id)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                            <X size={14} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};
