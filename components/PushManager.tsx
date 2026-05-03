import { useEffect } from 'react';
import { supabase } from '../lib/supabase/client';

export function PushManager() {
  useEffect(() => {
    registerServiceWorker();
  }, []);

  const registerServiceWorker = async () => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('Service Worker registrado com sucesso:', registration.scope);
      } catch (err) {
        console.error('Falha ao registrar Service Worker:', err);
      }
    }
  };

  return null;
}

export async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Notificações Push não suportadas neste navegador.');
  }

  const registration = await navigator.serviceWorker.ready;
  
  // 1. Get VAPID public key from API
  const res = await fetch('/api/vapid-public-key');
  const { publicKey } = await res.json();
  
  if (!publicKey) throw new Error('Chave VAPID não configurada no servidor.');

  // 2. Request permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permissão de notificação negada.');

  // 3. Subscribe
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey)
  });

  // 4. Save to Supabase
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('user_settings').upsert({
      user_id: user.id,
      push_subscription: subscription,
      push_enabled: true,
      updated_at: new Date().toISOString()
    });
  }

  return subscription;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
