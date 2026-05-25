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

async function sendWhatsApp(number: string, text: string) {
  if (process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE) {
    await fetch(`${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': process.env.EVOLUTION_API_KEY as string },
      body: JSON.stringify({ 
        number: number, 
        text: text
      })
    }).catch(err => console.error('Evolution API Error:', err));
  }
}

export async function handleNotifyBillsDue(req: any, res: any) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    if (!process.env.IS_LOCAL && req.query.key !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const { data: users } = await supabase.from('user_settings').select('user_id, whatsapp_number, whatsapp_enabled, push_subscription, push_enabled');
    const filteredUsers = users?.filter(u => (u.whatsapp_enabled && u.whatsapp_number) || (u.push_enabled && u.push_subscription)) || [];
    if (filteredUsers.length === 0) return res.status(200).json({ message: 'No users.' });
    const userIds = filteredUsers.map(u => u.user_id);
    const { data: expenses } = await supabase
      .from('transactions')
      .select('description, amount, date, user_id, accounts(institution)')
      .in('type', ['EXPENSE', 'BILL_PAYMENT', 'expense', 'bill_payment'])
      .eq('is_paid', false)
      .in('user_id', userIds)
      .gte('date', sevenDaysAgoStr)
      .lte('date', tomorrowStr)
      .order('date', { ascending: true });
    
    for (const u of filteredUsers) {
      const bills = expenses?.filter(e => e.user_id === u.user_id) || [];
      if (bills.length === 0) continue;
      
      let msg = `*FinVision Pro* 🔔\nVocê tem *${bills.length}* contas pendentes:\n\n`;
      bills.forEach((b: any) => {
        const cleanBillDate = b.date ? b.date.split('T')[0] : '';
        const dateFmt = cleanBillDate ? cleanBillDate.split('-').reverse().join('/') : 'Sem data';
        
        let statusLabel = '';
        if (cleanBillDate === yesterdayStr) {
          statusLabel = `🚨 Vencida em ${dateFmt} (Ontem)`;
        } else if (cleanBillDate === todayStr) {
          statusLabel = `📅 Vence Hoje - ${dateFmt}`;
        } else if (cleanBillDate === tomorrowStr) {
          statusLabel = `📅 Vence Amanhã - ${dateFmt}`;
        } else if (cleanBillDate < todayStr) {
          statusLabel = `🚨 Vencida em ${dateFmt}`;
        } else {
          statusLabel = `📅 Venc: ${dateFmt}`;
        }
        
        const rawAcc = b.accounts;
        const accName = Array.isArray(rawAcc) ? rawAcc[0]?.institution : rawAcc?.institution;
        const accountLabel = accName ? ` (Conta: *${accName}*)` : '';
        
        msg += `• *${b.description}*\n  └─ Valor: *R$ ${Number(b.amount).toFixed(2)}*\n  └─ Status: *${statusLabel}*${accountLabel}\n\n`;
      });
      msg += `Organize suas finanças com tranquilidade! 🚀`;

      if (u.whatsapp_enabled && u.whatsapp_number) await sendWhatsApp(u.whatsapp_number, msg);
      if (u.push_enabled && u.push_subscription) {
        try { 
          await webpush.sendNotification(u.push_subscription, JSON.stringify({ title: 'FinVision Pro 🔔', body: `Você tem ${bills.length} contas pendentes.` })); 
        } catch (pushErr: any) {
          console.error(`[WebPush Error] Falha ao enviar para o usuário ${u.user_id}:`, pushErr.message || pushErr);
        }
      }
    }
    return res.status(200).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
