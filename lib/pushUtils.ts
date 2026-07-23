// Zyvion — Notification Service
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
    console.error('[Zyvion SW] Falha ao registrar:', err);
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
      { url: '/#/history?status=PENDING', tag: `bill-${tx.id}` }
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

/**
 * Serializa operações de assinatura push. PushManager (montado sempre) e a
 * tela de Ajustes podem chamar ensureFreshPushSubscription/subscribeUserToPush
 * de forma independente; sem essa fila, dois unsubscribe()+subscribe() em
 * paralelo podem se atropelar e deixar o banco com uma assinatura diferente
 * da que o navegador realmente tem.
 */
let pushOpQueue: Promise<any> = Promise.resolve();
function serializePushOp<T>(fn: () => Promise<T>): Promise<T> {
  const run = pushOpQueue.then(fn, fn);
  pushOpQueue = run.then(() => undefined, () => undefined);
  return run;
}

/**
 * Auto-conserto da assinatura push: compara a chave VAPID do servidor com a
 * chave usada na assinatura atual do navegador. Se divergirem (ex.: chaves do
 * servidor foram trocadas), renova a assinatura silenciosamente.
 * NÃO pede permissão ao usuário — só age se já foi concedida.
 */
export async function ensureFreshPushSubscription(): Promise<{ subscription: PushSubscription; renewed: boolean } | null> {
  return serializePushOp(() => ensureFreshPushSubscriptionInner());
}

async function ensureFreshPushSubscriptionInner(): Promise<{ subscription: PushSubscription; renewed: boolean } | null> {
  if (getNotificationPermission() !== 'granted') return null;

  try {
    const sw = await getSwRegistration();
    if (!sw) return null;

    const res = await fetch('/api/vapid-public-key');
    if (!res.ok) return null;
    const { publicKey } = await res.json();
    if (!publicKey) return null;

    const serverKey = urlBase64ToUint8Array(publicKey);
    let subscription = await sw.pushManager.getSubscription();

    let needsRenewal = !subscription;
    if (subscription) {
      const currentKey = subscription.options?.applicationServerKey;
      if (currentKey) {
        const currentBytes = new Uint8Array(currentKey);
        needsRenewal = currentBytes.length !== serverKey.length
          || currentBytes.some((b, i) => b !== serverKey[i]);
      }
      // Se o navegador não expõe a chave usada, mantém a assinatura como está
      // (evita renovar sem necessidade a cada abertura do app).
    }

    if (!needsRenewal && subscription) return { subscription, renewed: false };

    if (subscription) await subscription.unsubscribe();
    subscription = await sw.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: serverKey as any
    });

    console.info('[Zyvion Push] Assinatura push renovada (chave do servidor mudou).');
    return { subscription, renewed: true };
  } catch (err: any) {
    console.error('[Zyvion Push] Falha no auto-conserto da assinatura:', err.message || err);
    return null;
  }
}

// Legado — mantido para compatibilidade com Settings.tsx
export async function subscribeUserToPush(): Promise<PushSubscription | null> {
  return serializePushOp(() => subscribeUserToPushInner());
}

async function subscribeUserToPushInner(): Promise<PushSubscription | null> {
  const permission = await requestNotificationPermission();
  if (permission !== 'granted') return null;

  try {
    const sw = await getSwRegistration();
    if (!sw) {
      console.warn('[Zyvion SW] Service Worker não registrado.');
      return null;
    }

    // 1. Buscar chave pública VAPID do backend
    const res = await fetch('/api/vapid-public-key');
    if (!res.ok) {
      console.warn('[Zyvion Push] Falha ao obter chave VAPID do servidor.');
      return null;
    }
    const { publicKey } = await res.json();
    if (!publicKey) {
      console.warn('[Zyvion Push] Chave pública VAPID não configurada no servidor.');
      return null;
    }

    // 2. Inscrever o SW para push notifications
    const applicationServerKey = urlBase64ToUint8Array(publicKey);
    let subscription = await sw.pushManager.getSubscription();

    // Se já tiver subscrição antiga, desinscreve para garantir compatibilidade
    if (subscription) {
      await subscription.unsubscribe();
    }

    subscription = await sw.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey as any
    });

    console.info('[Zyvion Push] Usuário inscrito para push notifications com sucesso!');
    return subscription;
  } catch (err: any) {
    console.error('[Zyvion Push] Falha ao inscrever para push:', err.message || err);
    return null;
  }
}
