import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

let vapidPub = process.env.VAPID_PUBLIC_KEY || '';
let vapidPriv = process.env.VAPID_PRIVATE_KEY || '';

// Robustly strip surrounding quotes if present from manual copy-paste
if (vapidPub.startsWith("'") && vapidPub.endsWith("'")) vapidPub = vapidPub.slice(1, -1);
if (vapidPub.startsWith('"') && vapidPub.endsWith('"')) vapidPub = vapidPub.slice(1, -1);
if (vapidPriv.startsWith("'") && vapidPriv.endsWith("'")) vapidPriv = vapidPriv.slice(1, -1);
if (vapidPriv.startsWith('"') && vapidPriv.endsWith('"')) vapidPriv = vapidPriv.slice(1, -1);

if (vapidPub && vapidPriv) {
  try {
    webpush.setVapidDetails('mailto:suporte@finvision.com.br', vapidPub, vapidPriv);
  } catch (err: any) {
    console.error('⚠️ [VAPID] Erro ao carregar chaves de notificacao push:', err.message);
  }
}

/**
 * POST /api/test-push — envia uma notificação push REAL para o usuário logado,
 * pelo mesmo caminho do cron diário (servidor → Google/Apple → aparelho).
 * Ao contrário da notificação local, este teste detecta assinatura vencida
 * (ex.: chave VAPID trocada) e devolve o motivo para o front reparar.
 */
export async function handleTestPush(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Login necessário.' });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Login necessário.' });

  if (!vapidPub || !vapidPriv) {
    return res.status(200).json({ success: false, reason: 'server_keys_missing' });
  }

  const { data: settings } = await supabase
    .from('user_settings')
    .select('push_subscription')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!settings?.push_subscription) {
    return res.status(200).json({ success: false, reason: 'no_subscription' });
  }

  try {
    await webpush.sendNotification(settings.push_subscription, JSON.stringify({
      title: 'Zyvion ✓ Teste do servidor',
      body: 'Perfeito! Este é o mesmo caminho das notificações diárias de vencimentos.',
      url: '/'
    }));
    return res.status(200).json({ success: true });
  } catch (err: any) {
    const code = err?.statusCode;
    // 403 = chave VAPID não corresponde | 404/410 = assinatura expirada/removida
    const reason = (code === 403 || code === 404 || code === 410) ? 'invalid_subscription' : 'send_failed';
    console.error(`[TestPush] Falha ao enviar para ${user.id} (status ${code}):`, err?.body || err?.message);
    return res.status(200).json({ success: false, reason, statusCode: code });
  }
}
