import React, { useState } from 'react';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabase/client';
import { DateUtils } from '../../lib/dateUtils';

interface CancelSubscriptionModalProps {
  onClose: () => void;
}

export default function CancelSubscriptionModal({ onClose }: CancelSubscriptionModalProps) {
  const { subscription, refreshSubscription } = useSubscription();
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accessUntil = subscription?.current_period_end ? DateUtils.formatDisplayDate(subscription.current_period_end) : null;

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase!.auth.getSession();
      if (!session?.access_token) throw new Error('Sessão expirada. Faça login novamente.');

      const res = await fetch('/api/asaas-cancel-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ reason: reason || undefined }),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Erro ao cancelar assinatura.');

      await refreshSubscription();
      toast('Assinatura cancelada. Você continua com acesso até o fim do período pago.', 'success');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro inesperado. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-[32px] w-full max-w-md p-8 space-y-6 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600" aria-label="Fechar">
          <X size={20} />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-orange-50 dark:bg-orange-950/30 rounded-2xl flex items-center justify-center">
            <AlertTriangle size={22} className="text-orange-500" />
          </div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white">Cancelar assinatura</h2>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
          Você não será mais cobrado{accessUntil ? <> e continua com acesso ao plano <strong>{subscription?.plans?.name}</strong> até <strong>{accessUntil}</strong></> : ''}. Depois disso, sua conta volta ao plano gratuito automaticamente. Você pode reativar quando quiser, inclusive depois dessa data.
        </p>

        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Motivo (opcional)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Conte pra gente por que está cancelando..."
            className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl text-sm font-medium text-slate-700 dark:text-slate-200 border border-slate-100 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
          />
        </div>

        {error && <p className="text-xs font-bold text-rose-500">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 font-bold text-xs uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 transition-all disabled:opacity-50"
          >
            Voltar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 py-3.5 rounded-2xl bg-orange-600 hover:bg-orange-700 text-white font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : 'Confirmar cancelamento'}
          </button>
        </div>
      </div>
    </div>
  );
}
