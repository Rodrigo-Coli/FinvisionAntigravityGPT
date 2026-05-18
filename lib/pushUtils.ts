// FinVision Pro — Notification Service
// Gerencia permissões, notificações locais agendadas e registro do SW

const FINVISION_SW = '/sw.js';

/** Verifica e solicita permissão de notificação ao usuário */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  // 'default' — solicita
  const result = await Notification.requestPermission();
  return result;
}

/** Retorna o status atual da permissão */
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/** Registra o Service Worker e retorna o registration */
export async function getSwRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    await navigator.serviceWorker.register(FINVISION_SW, { scope: '/' });
    return await navigator.serviceWorker.ready;
  } catch (err) {
    console.error('[FinVision SW] Falha ao registrar:', err);
    return null;
  }
}

/** Envia uma notificação LOCAL imediatamente via Service Worker */
export async function showLocalNotification(title: string, body: string, options?: {
  url?: string;
  tag?: string;
  icon?: string;
}) {
  const permission = await requestNotificationPermission();
  if (permission !== 'granted') return false;

  const sw = await getSwRegistration();
  if (sw && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SHOW_NOTIFICATION',
      payload: {
        title,
        body,
        url: options?.url || '/',
        tag: options?.tag || 'finvision',
        icon: options?.icon || '/logo.png'
      }
    });
    return true;
  }

  // Fallback: notificação direta (funciona se SW não ativo)
  try {
    new Notification(title, { body, icon: options?.icon || '/logo.png', tag: options?.tag });
    return true;
  } catch {
    return false;
  }
}

/** Agenda uma notificação LOCAL com delay em milissegundos */
export async function scheduleLocalNotification(title: string, body: string, delayMs: number, options?: {
  url?: string;
  tag?: string;
}) {
  const permission = await requestNotificationPermission();
  if (permission !== 'granted') return false;

  const sw = await getSwRegistration();
  if (sw && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SCHEDULE_NOTIFICATION',
      payload: { title, body, delay: delayMs, url: options?.url || '/', tag: options?.tag }
    });
    return true;
  }
  return false;
}

/** Verifica vencimentos e dispara notificações locais */
export async function checkAndNotifyBillsDue(transactions: Array<{
  id: string;
  description: string;
  amount: number;
  date: string;
  isPaid: boolean;
  type: string;
}>) {
  const permission = getNotificationPermission();
  if (permission !== 'granted') return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const threeDays = new Date(today);
  threeDays.setDate(today.getDate() + 3);

  const dueSoon = transactions.filter(t => {
    if (t.isPaid || t.type === 'INCOME') return false;
    const txDate = new Date(t.date + 'T00:00:00');
    return txDate >= today && txDate <= threeDays;
  });

  for (const tx of dueSoon.slice(0, 3)) {
    const txDate = new Date(tx.date + 'T00:00:00');
    const daysUntil = Math.round((txDate.getTime() - today.getTime()) / 86400000);
    const label = daysUntil === 0 ? 'vence HOJE' : `vence em ${daysUntil} dia${daysUntil > 1 ? 's' : ''}`;
    const amount = tx.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    await showLocalNotification(
      `⚠️ ${tx.description}`,
      `${amount} — ${label}`,
      { url: '/#/history', tag: `bill-${tx.id}` }
    );
  }
}

// Converte chave VAPID base64 para Uint8Array (para push externo futuro)
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

// Legado — mantido para compatibilidade com Settings.tsx
export async function subscribeUserToPush(): Promise<PushSubscription | null> {
  const permission = await requestNotificationPermission();
  if (permission !== 'granted') return null;
  // Por enquanto retorna null (sem VAPID configurado), mas não quebra o fluxo
  console.info('[FinVision] Push VAPID não configurado. Usando notificações locais.');
  return null;
}
