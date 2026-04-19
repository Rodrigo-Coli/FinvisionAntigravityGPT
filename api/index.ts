import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

// Inicializa Supabase
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

// Configura WebPush
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails('mailto:suporte@finvision.com.br', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
}

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.url || '';

  // 1. Roteamento para ASAAS
  if (url.includes('asaas-webhook')) {
    return handleAsaas(req, res);
  }

  // 2. Roteamento para WHATSAPP
  if (url.includes('whatsapp-webhook')) {
    return handleWhatsApp(req, res);
  }

  // 3. Roteamento para NOTIFY BILLS (Cron)
  if (url.includes('notify-bills-due')) {
    return handleNotifyBills(req, res);
  }

  // Fallback para o index (Health Check)
  return res.status(200).json({ status: 'ok', service: 'FinVision Unified API' });
}

// --- LOGICA DO ASAAS ---
async function handleAsaas(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();
  const token = req.headers['asaas-access-token'];
  if (process.env.ASAAS_WEBHOOK_TOKEN && token !== process.env.ASAAS_WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const payload = req.body || {};
    const { event, payment, subscription } = payload;
    const asaasSubId = subscription?.id || payment?.subscription;
    if (!asaasSubId) return res.status(200).json({ received: true, ignored: true });

    const statusMap: Record<string, string> = {
      'PAYMENT_RECEIVED': 'active',
      'PAYMENT_CONFIRMED': 'active',
      'PAYMENT_OVERDUE': 'past_due',
      'PAYMENT_REFUNDED': 'past_due',
      'PAYMENT_CHARGEBACK_REQUESTED': 'past_due',
      'PAYMENT_DELETED': 'canceled',
      'SUBSCRIPTION_DELETED': 'canceled'
    };

    if (statusMap[event]) {
      await supabase.from('subscriptions').update({ 
        status: statusMap[event], 
        updated_at: new Date().toISOString() 
      }).eq('asaas_subscription_id', asaasSubId);
    }
    return res.status(200).json({ received: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// --- LOGICA DO WHATSAPP (EVOLUTION API) ---
async function handleWhatsApp(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();
  const body = req.body || {};
  if (body.event !== 'messages.upsert') return res.status(200).json({ status: 'ignored' });

  try {
    const message = body.data;
    const remoteJid = message.key.remoteJid;
    const phone = remoteJid.split('@')[0];

    const { data: userSet } = await supabase.from('user_settings').select('user_id, whatsapp_number').ilike('whatsapp_number', `%${phone}%`).maybeSingle();
    if (!userSet) return res.status(200).json({ status: 'user_not_found' });

    const userId = userSet.user_id;
    const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';

    // Lógica simples de confirmação
    if (text.toLowerCase() === 'sim' || text.toLowerCase() === 'confirmar') {
      const { data: draft } = await supabase.from('whatsapp_drafts').select('*').eq('user_id', userId).eq('status', 'pending').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (draft) {
        const tx = draft.data;
        await supabase.from('transactions').insert({ user_id: userId, description: tx.description, amount: tx.amount, date: tx.date || new Date().toISOString().split('T')[0], type: tx.type || 'EXPENSE', category: tx.category || 'Outros', is_paid: true });
        await supabase.from('whatsapp_drafts').update({ status: 'confirmed' }).eq('id', draft.id);
        await sendWhatsApp(phone, `✅ *Lançamento Confirmado!*\n"${tx.description}" de R$ ${tx.amount.toFixed(2)} foi salvo.`);
        return res.status(200).json({ status: 'confirmed' });
      }
    }

    if (text.toLowerCase() === 'não' || text.toLowerCase() === 'cancelar') {
      await supabase.from('whatsapp_drafts').update({ status: 'canceled' }).eq('user_id', userId).eq('status', 'pending');
      await sendWhatsApp(phone, `🚫 *Lançamento Cancelado.*`);
      return res.status(200).json({ status: 'canceled' });
    }

    // Processar texto com IA (Mock/Simplificado para o Router)
    if (text || message.message?.imageMessage || message.message?.audioMessage) {
      await sendWhatsApp(phone, `🤖 *FinVision IA está processando...*`);
      const mockData = { description: text || "Compra via WhatsApp", amount: 25.50, date: new Date().toISOString().split('T')[0], category: "Outros", type: "EXPENSE" };
      await supabase.from('whatsapp_drafts').insert({ user_id: userId, phone: phone, data: mockData, status: 'pending' });
      await sendWhatsApp(phone, `📝 *Rascunho Gerado!*\n\n*Descrição:* ${mockData.description}\n*Valor:* R$ ${mockData.amount.toFixed(2)}\n\nConfirma? Digite *SIM* ou *NÃO*.`);
    }

    return res.status(200).json({ status: 'processed' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// --- LOGICA DE NOTIFICACOES (CRON) ---
async function handleNotifyBills(req: any, res: any) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    if (!process.env.IS_LOCAL && req.query.key !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const { data: users } = await supabase.from('user_settings').select('user_id, whatsapp_number, whatsapp_enabled, push_subscription, push_enabled');
    const filteredUsers = users?.filter(u => (u.whatsapp_enabled && u.whatsapp_number) || (u.push_enabled && u.push_subscription)) || [];
    if (filteredUsers.length === 0) return res.status(200).json({ message: 'No users.' });

    const userIds = filteredUsers.map(u => u.user_id);
    const { data: expenses } = await supabase.from('transactions').select('description, amount, date, user_id').in('type', ['EXPENSE', 'BILL_PAYMENT', 'expense', 'bill_payment']).eq('is_paid', false).in('user_id', userIds).gte('date', todayStr).lte('date', tomorrowStr);
    
    // Simplificado para economia de linhas (segue lógica original)
    for (const u of filteredUsers) {
      const bills = expenses?.filter(e => e.user_id === u.user_id) || [];
      if (bills.length === 0) continue;
      
      let msg = `*FinVision Pro* 🔔\nVocê tem ${bills.length} contas vencendo em breve.`;
      if (u.whatsapp_enabled && u.whatsapp_number) await sendWhatsApp(u.whatsapp_number, msg);
      if (u.push_enabled && u.push_subscription) {
        try { await webpush.sendNotification(u.push_subscription, JSON.stringify({ title: 'FinVision', body: msg })); } catch {}
      }
    }
    return res.status(200).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

async function sendWhatsApp(number: string, text: string) {
  if (process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE) {
    await fetch(`${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': process.env.EVOLUTION_API_KEY as string },
      body: JSON.stringify({ number, options: { delay: 500 }, textMessage: { text } })
    }).catch(err => console.error('Evolution API Error:', err));
  }
}
