import { DateUtils } from '../lib/dateUtils';
import { useEffect, useRef, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { supabase } from '../lib/supabase/client';
import {
  getSwRegistration,
  requestNotificationPermission,
  checkAndNotifyBillsDue,
  ensureFreshPushSubscription,
  subscribeUserToPush,
  showLocalNotification
} from '../lib/pushUtils';

const INVITE_DISMISSED_KEY = 'zyvion_push_invite_dismissed';

/**
 * PushManager — componente montado no root da aplicação.
 * Responsabilidades:
 * 1. Registrar o Service Worker.
 * 2. Se o usuário já concedeu permissão, verificar vencimentos diariamente.
 * 3. Escutar mensagens do SW (CHECK_BILLS_DUE).
 * 4. AUTO-CONSERTO: renovar a assinatura push quando a chave do servidor mudar
 *    e sincronizá-la com o banco (evita notificações "mudas" sem aviso).
 * 5. Convite de ativação: oferecer notificações no primeiro uso.
 */
export function PushManager() {
  const lastCheckRef = useRef<string>('');
  const healedRef = useRef(false);
  const [showInvite, setShowInvite] = useState(false);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    init();
    // Verifica vencimentos a cada hora enquanto o app está aberto
    const interval = setInterval(runBillsCheck, 60 * 60 * 1000);
    // Escuta mensagens do SW
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'CHECK_BILLS_DUE') runBillsCheck();
    };
    navigator.serviceWorker?.addEventListener('message', handleSwMessage);
    // Re-executa quando o usuário faz login depois do mount
    const { data: authListener } = supabase
      ? supabase.auth.onAuthStateChange((_event: string, session: any) => { if (session?.user) init(); })
      : { data: null };
    return () => {
      clearInterval(interval);
      navigator.serviceWorker?.removeEventListener('message', handleSwMessage);
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  const init = async () => {
    if (!('serviceWorker' in navigator)) return;
    await getSwRegistration();
    if (!supabase) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (typeof Notification === 'undefined') return;

    if (Notification.permission === 'granted') {
      await runBillsCheck();
      await autoHealSubscription(user.id);
    } else if (Notification.permission === 'default' && !localStorage.getItem(INVITE_DISMISSED_KEY)) {
      // Convite de ativação: só para quem nunca decidiu (nem permitiu, nem bloqueou)
      try {
        const { data } = await supabase.from('user_settings').select('push_enabled').eq('user_id', user.id).maybeSingle();
        if (!data?.push_enabled) {
          // Pequeno delay para não competir com prompts de instalação do PWA
          setTimeout(() => setShowInvite(true), 6000);
        }
      } catch { /* silencioso */ }
    }
  };

  /**
   * Auto-conserto: se a assinatura do aparelho ficou velha (chave do servidor
   * mudou) ou diverge da gravada no banco, renova e regrava — sem o usuário
   * precisar desligar/ligar nada.
   */
  const autoHealSubscription = async (userId: string) => {
    if (healedRef.current || !supabase) return;
    healedRef.current = true;
    try {
      const { data } = await supabase
        .from('user_settings')
        .select('push_enabled, push_subscription')
        .eq('user_id', userId)
        .maybeSingle();
      if (!data?.push_enabled) return; // usuário optou por não receber — respeitar

      const fresh = await ensureFreshPushSubscription();
      if (!fresh) return;

      const current = fresh.subscription.toJSON() as any;
      const stored = data.push_subscription as any;
      const differs = fresh.renewed
        || !stored
        || stored.endpoint !== current.endpoint
        || stored.keys?.p256dh !== current.keys?.p256dh
        || stored.keys?.auth !== current.keys?.auth;

      if (differs) {
        await supabase.from('user_settings').upsert({
          user_id: userId,
          push_subscription: current,
          updated_at: DateUtils.getNow().toISOString()
        });
        console.info('[Zyvion Push] Assinatura push sincronizada com o servidor.');
      }
    } catch (err) {
      console.warn('[Zyvion PushManager] Auto-conserto falhou:', err);
    }
  };

  const runBillsCheck = async () => {
    const today = new Date().toDateString();
    if (lastCheckRef.current === today) return; // Já verificou hoje
    lastCheckRef.current = today;

    try {
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Busca transações pendentes dos próximos 3 dias
      const todayStr = DateUtils.formatToISODate();
      const threeDaysStr = DateUtils.formatToISODate(new Date(Date.now() + 3 * 86400000));

      const { data } = await supabase
        .from('transactions')
        .select('id, description, amount, date, is_paid, type')
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .eq('is_paid', false)
        .eq('type', 'EXPENSE')
        .gte('date', todayStr)
        .lte('date', threeDaysStr)
        .limit(10);

      if (data && data.length > 0) {
        await checkAndNotifyBillsDue(
          data.map((t: any) => ({
            id: t.id,
            description: t.description,
            amount: Number(t.amount),
            date: t.date,
            isPaid: t.is_paid,
            type: t.type
          }))
        );
      }
    } catch (err) {
      console.warn('[Zyvion PushManager] Erro ao verificar vencimentos:', err);
    }
  };

  const dismissInvite = () => {
    localStorage.setItem(INVITE_DISMISSED_KEY, String(Date.now()));
    setShowInvite(false);
  };

  const activatePush = async () => {
    if (!supabase) return;
    setActivating(true);
    try {
      const permission = await requestNotificationPermission();
      if (permission !== 'granted') {
        dismissInvite();
        return;
      }
      const sub = await subscribeUserToPush();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('user_settings').upsert({
          user_id: user.id,
          push_enabled: true,
          ...(sub ? { push_subscription: sub.toJSON() } : {}),
          updated_at: DateUtils.getNow().toISOString()
        });
      }
      await showLocalNotification('Zyvion ✓', 'Notificações ativadas! Você será avisado sobre vencimentos.', { url: '/', tag: 'welcome' });
      setShowInvite(false);
    } catch (err) {
      console.warn('[Zyvion PushManager] Falha ao ativar notificações:', err);
      setShowInvite(false);
    } finally {
      setActivating(false);
    }
  };

  if (!showInvite) return null;

  return (
    <div className="fixed bottom-24 lg:bottom-6 left-4 right-4 lg:left-auto lg:right-6 lg:max-w-sm z-[60] animate-in slide-in-from-bottom-4">
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-700 p-5">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 shrink-0 rounded-2xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 dark:text-brand-400">
            <BellRing size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-900 dark:text-white text-sm">Ative os lembretes de vencimentos</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Receba um aviso no aparelho quando suas contas estiverem perto de vencer.</p>
          </div>
          <button onClick={dismissInvite} className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="flex gap-3 mt-4">
          <button
            onClick={activatePush}
            disabled={activating}
            className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all disabled:opacity-60"
          >
            {activating ? 'Ativando…' : 'Ativar'}
          </button>
          <button
            onClick={dismissInvite}
            className="px-5 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all"
          >
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
}
