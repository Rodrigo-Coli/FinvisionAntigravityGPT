import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase/client';
import {
  getSwRegistration,
  requestNotificationPermission,
  checkAndNotifyBillsDue
} from '../lib/pushUtils';

/**
 * PushManager — componente invisível montado no root da aplicação.
 * Responsabilidades:
 * 1. Registrar o Service Worker.
 * 2. Se o usuário já concedeu permissão, verificar vencimentos diariamente.
 * 3. Escutar mensagens do SW (CHECK_BILLS_DUE).
 */
export function PushManager() {
  const lastCheckRef = useRef<string>('');

  useEffect(() => {
    init();
    // Verifica vencimentos a cada hora enquanto o app está aberto
    const interval = setInterval(runBillsCheck, 60 * 60 * 1000);
    // Escuta mensagens do SW
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'CHECK_BILLS_DUE') runBillsCheck();
    };
    navigator.serviceWorker?.addEventListener('message', handleSwMessage);
    return () => {
      clearInterval(interval);
      navigator.serviceWorker?.removeEventListener('message', handleSwMessage);
    };
  }, []);

  const init = async () => {
    if (!('serviceWorker' in navigator)) return;
    await getSwRegistration();

    // Se permissão já foi dada, rodar check imediatamente
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      await runBillsCheck();
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
      const todayStr = new Date().toISOString().split('T')[0];
      const threeDaysStr = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];

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
      console.warn('[FinVision PushManager] Erro ao verificar vencimentos:', err);
    }
  };

  return null;
}
