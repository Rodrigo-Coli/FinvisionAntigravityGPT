import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails('mailto:suporte@finvision.com.br', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
}

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).send('ok');

  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    if (!process.env.IS_LOCAL && req.query.key !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const todayStr = today.toISOString().split('T')[0];
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const { data: users } = await supabase.from('user_settings').select('user_id, whatsapp_number, whatsapp_enabled, push_subscription, push_enabled');
    const filteredUsers = users?.filter(u => (u.whatsapp_enabled && u.whatsapp_number) || (u.push_enabled && u.push_subscription)) || [];
    if (filteredUsers.length === 0) return res.status(200).json({ message: 'No users.' });

    const userIds = filteredUsers.map(u => u.user_id);
    const { data: expenses } = await supabase.from('transactions').select('description, amount, date, user_id').in('type', ['EXPENSE', 'BILL_PAYMENT', 'expense', 'bill_payment']).eq('is_paid', false).in('user_id', userIds).gte('date', todayStr).lte('date', tomorrowStr);
    const { data: statements } = await supabase.from('card_statements').select('total_amount, paid_amount, due_date, user_id, cards(name)').eq('status', 'OPEN').in('user_id', userIds).gte('due_date', todayStr).lte('due_date', tomorrowStr);

    const userExpenses: Record<string, any[]> = {};
    expenses?.forEach(e => { if (!userExpenses[e.user_id]) userExpenses[e.user_id] = []; userExpenses[e.user_id].push({ ...e, is_card: false }); });
    statements?.forEach(s => { 
        if (!userExpenses[s.user_id]) userExpenses[s.user_id] = []; 
        const due = (s.total_amount || 0) - (s.paid_amount || 0);
        if (due > 0) userExpenses[s.user_id].push({ description: `Fatura ${ (s.cards as any)?.name || 'Cartão'}`, amount: due, date: s.due_date, is_card: true });
    });

    let sent = 0;
    for (const u of filteredUsers) {
      const bills = userExpenses[u.user_id];
      if (!bills || bills.length === 0) continue;
      let msg = `*FinVision Pro* 🤖\nResumo de Contas:\n\n`;
      bills.forEach(b => { msg += `${b.date === todayStr ? '🔴' : '🟡'} ${b.is_card ? '💳' : '📄'} ${b.description}: R$ ${b.amount.toFixed(2)}\n`; });
      
      if (u.whatsapp_enabled && u.whatsapp_number && process.env.EVOLUTION_API_URL) {
        await fetch(`${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': process.env.EVOLUTION_API_KEY as string },
          body: JSON.stringify({ number: u.whatsapp_number, textMessage: { text: msg } })
        }).catch(() => {});
      }
      if (u.push_enabled && u.push_subscription && process.env.VAPID_PUBLIC_KEY) {
        try { await webpush.sendNotification(u.push_subscription, JSON.stringify({ title: 'FinVision: Contas a Pagar', body: `Você tem ${bills.length} vencimento(s).`, url: 'https://finvision.automanow.com.br' })); } catch {}
      }
      sent++;
    }

    return res.status(200).json({ success: true, sent });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
