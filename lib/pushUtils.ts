// Utility functions for Web Push Notifications

// Converts the base64 URL-safe public key to a Uint8Array for PushManager
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Subscribes the user to Push Notifications
export async function subscribeUserToPush(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push messaging is not supported.');
    return null;
  }

  try {
    // 1. Request Permission
    const permission = await Notification.requestPermission();
    console.log('Permission status:', permission);
    if (permission !== 'granted') {
      console.warn('Notification permission denied.');
      return null;
    }

    // 2. Fetch VAPID Public Key from Backend
    const response = await fetch('/api/vapid-public-key');
    if (!response.ok) {
      const errorText = await response.text();
      console.error('VAPID Fetch failed:', response.status, errorText);
      throw new Error(`Servidor respondeu com erro ${response.status}: ${errorText || 'Sem detalhes'}`);
    }
    const { publicKey } = await response.json();
    if (!publicKey) {
      console.error('VAPID_PUBLIC_KEY não encontrada no process.env do servidor (Vercel).');
      throw new Error('Chave VAPID retornou vazia (undefined/null) do servidor.');
    }
    
    const applicationServerKey = urlBase64ToUint8Array(publicKey);

    // 3. Get Service Worker Registration
    const registration = await navigator.serviceWorker.ready;
    console.log('SW Ready for push registration');

    // 4. Subscribe
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey as any
    });

    console.log('Push subscription success:', !!subscription);
    return subscription;
  } catch (err: any) {
    console.error('Push Subscription Error Details:', err);
    if (err.name === 'NotAllowedError') {
      alert('A permissão foi negada. Por favor, limpe as permissões deste site nas configurações do seu navegador para tentar novamente.');
    } else {
      alert(`Erro na ativação: ${err.message || 'Erro desconhecido'}`);
    }
    return null;
  }
}
