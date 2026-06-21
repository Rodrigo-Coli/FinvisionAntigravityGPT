import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase/client';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { AlertCircle, Wallet, Check } from 'lucide-react';

export default function AccountSelectionModal() {
  const { user } = useAuth();
  const { subscription, refreshSubscription, loadingSub } = useSubscription();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const isTrialExpired = subscription?.status === 'trialing' && subscription.trial_ends_at && new Date(subscription.trial_ends_at) < new Date();
  const isPastDue = subscription?.status === 'past_due';
  const isCanceled = subscription?.status === 'canceled';
  const isDowngraded = isPastDue || isCanceled || isTrialExpired;

  useEffect(() => {
    if (!user || !isDowngraded || loadingSub) return;

    const fetchActiveAccounts = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_archived', false);
      
      if (data) {
        setAccounts(data);
        // Pre-select the currently active account from metadata if it exists
        const currentActive = subscription?.metadata?.active_account_id;
        if (currentActive && data.some((a: any) => a.id === currentActive)) {
          setSelectedId(currentActive);
        } else if (data.length > 0) {
          setSelectedId(data[0].id);
        }
      }
      setLoading(false);
    };

    fetchActiveAccounts();
  }, [user, isDowngraded, loadingSub, subscription?.metadata?.active_account_id]);

  // Only display if the user is downgraded, has more than 1 account, and hasn't locked one in (or we show the modal when they want to change it)
  // Let's force open it if they have > 1 account and NO active_account_id selected in metadata
  const hasNoActiveAccountSelected = isDowngraded && accounts.length > 1 && !subscription?.metadata?.active_account_id;

  if (!hasNoActiveAccountSelected) return null;

  const handleSave = async () => {
    if (!user || !selectedId || !subscription) return;
    setSaving(true);
    try {
      const updatedMetadata = {
        ...(subscription.metadata || {}),
        active_account_id: selectedId
      };

      const { error } = await supabase
        .from('subscriptions')
        .update({ metadata: updatedMetadata })
        .eq('user_id', user.id);

      if (error) throw error;
      await refreshSubscription();
    } catch (err) {
      console.error('Error saving active account:', err);
      alert('Erro ao salvar conta ativa. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
        
        <div className="text-center space-y-4">
          <div className="mx-auto w-12 h-12 bg-amber-50 dark:bg-amber-950/30 rounded-2xl flex items-center justify-center text-amber-600">
            <AlertCircle size={24} />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">Selecione sua Conta Ativa</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              Como seus limites foram reduzidos para o plano Gratuito (Starter), você pode manter apenas <strong className="font-bold">1 conta bancária ativa</strong> para fazer novos lançamentos. As demais ficarão temporariamente em modo de leitura.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="my-6 space-y-2 max-h-48 overflow-y-auto">
            {accounts.map(acc => {
              const selected = selectedId === acc.id;
              const color = acc.color || '#6366f1';
              return (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => setSelectedId(acc.id)}
                  className={`w-full flex items-center gap-3 p-4 rounded-2xl border transition-all text-left ${
                    selected
                      ? 'border-amber-500 bg-amber-50/20 dark:bg-amber-950/10'
                      : 'border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div 
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white" 
                    style={{ backgroundColor: color }}
                  >
                    <Wallet size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{acc.name}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{acc.type || 'Corrente'}</p>
                  </div>
                  {selected && (
                    <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-white">
                      <Check size={12} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving || !selectedId}
          className="w-full py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:opacity-90 transition-all flex items-center justify-center gap-2"
        >
          {saving ? 'Salvando...' : 'Confirmar Seleção'}
        </button>
      </div>
    </div>
  );
}
