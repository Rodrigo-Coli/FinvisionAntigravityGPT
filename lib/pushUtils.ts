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
    if (permission !== 'granted') {
      console.warn('Notification permission denied.');
      return null;
    }

    // 2. Fetch VAPID Public Key from Backend
    const response = await fetch('/api/vapid-public-key');
    if (!response.ok) {
      throw new Error('Failed to fetch VAPID public key.');
    }
    const { publicKey } = await response.json();
    const applicationServerKey = urlBase64ToUint8Array(publicKey);

    // 3. Get Service Worker Registration
    const registration = await navigator.serviceWorker.ready;

    // 4. Subscribe
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey as any
    });

    return subscription;
  } catch (err) {
    console.error('Failed to subscribe to push notifications:', err);
    return null;
  }
}
