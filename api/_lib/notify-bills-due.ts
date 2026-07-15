import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { isCronAuthorized } from './cron-auth.js';

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
    const cleanBaseUrl = process.env.EVOLUTION_API_URL.endsWith('/') 
      ? process.env.EVOLUTION_API_URL.slice(0, -1) 
      : process.env.EVOLUTION_API_URL;
    
    const url = `${cleanBaseUrl}/message/sendText/${process.env.EVOLUTION_INSTANCE}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': process.env.EVOLUTION_API_KEY as string },
        body: JSON.stringify({ 
          number: number, 
          text: text, // Para Evolution API v2
          options: {
            delay: 1200,
            presence: 'composing'
          },
          textMessage: { text: text } // Para Evolution API v1
        })
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error(`[Evolution API sendWhatsApp Error] Status ${res.status}: ${errText}`);
      } else {
        console.log(`[Evolution API sendWhatsApp Success] Mensagem enviada com sucesso para ${number}`);
      }
    } catch (err) {
      console.error('Evolution API Error:', err);
    }
  }
}

export async function handleNotifyBillsDue(req: any, res: any) {
  if (!isCronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

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
      .eq('is_deleted', false)
      .in('user_id', userIds)
      .gte('date', sevenDaysAgoStr)
      .lte('date', tomorrowStr)
      .order('date', { ascending: true });
    
    for (const u of filteredUsers) {
      const bills = expenses?.filter(e => e.user_id === u.user_id) || [];
      if (bills.length === 0) continue;
      
      let msg = `*Zyvion* 🔔\nVocê tem *${bills.length}* contas pendentes:\n\n`;
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
        
        msg += `• *${b.description}*\n  └─ Valor: *R$ ${Number(b.amount).toFixed(2)}*\n  └─ Status: *${statusLabel}*\n\n`;
      });
      msg += `Organize suas finanças com tranquilidade! 🚀`;

      if (u.whatsapp_enabled && u.whatsapp_number) await sendWhatsApp(u.whatsapp_number, msg);
      if (u.push_enabled && u.push_subscription) {
        try { 
          await webpush.sendNotification(u.push_subscription, JSON.stringify({ 
            title: 'Zyvion 🔔',
            body: `Você tem ${bills.length} contas pendentes.`,
            url: '/#/history?status=PENDING'
          })); 
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

export async function handleWeeklySummary(req: any, res: any) {
  if (!isCronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
    const sevenDaysAhead = new Date(); sevenDaysAhead.setDate(sevenDaysAhead.getDate() + 7);
    const sevenDaysAheadStr = sevenDaysAhead.toISOString().split('T')[0];

    const { data: users } = await supabase.from('user_settings').select('user_id, whatsapp_number, whatsapp_enabled').eq('whatsapp_enabled', true);
    const filteredUsers = users?.filter(u => u.whatsapp_number) || [];
    if (filteredUsers.length === 0) return res.status(200).json({ message: 'No users.' });

    const userIds = filteredUsers.map(u => u.user_id);

    const [txRes, accountsRes, pendingRes] = await Promise.all([
      supabase.from('transactions').select('user_id, amount, type, category').eq('is_deleted', false).in('user_id', userIds).gte('date', sevenDaysAgoStr).lte('date', todayStr),
      supabase.from('accounts').select('user_id, institution, current_balance').eq('is_archived', false).in('user_id', userIds),
      supabase.from('transactions').select('user_id, description, amount, date').eq('is_paid', false).eq('is_deleted', false).eq('type', 'EXPENSE').in('user_id', userIds).gte('date', todayStr).lte('date', sevenDaysAheadStr).order('date', { ascending: true })
    ]);

    for (const u of filteredUsers) {
      const txs = (txRes.data || []).filter((t: any) => t.user_id === u.user_id);
      const accounts = (accountsRes.data || []).filter((a: any) => a.user_id === u.user_id);
      const upcoming = (pendingRes.data || []).filter((b: any) => b.user_id === u.user_id);

      const weekIncome = txs.filter((t: any) => t.type === 'INCOME').reduce((s: number, t: any) => s + Number(t.amount), 0);
      const weekExpense = txs.filter((t: any) => t.type === 'EXPENSE').reduce((s: number, t: any) => s + Number(t.amount), 0);
      const totalBalance = accounts.reduce((s: number, a: any) => s + Number(a.current_balance || 0), 0);

      const catSummary: Record<string, number> = {};
      txs.filter((t: any) => t.type === 'EXPENSE').forEach((t: any) => {
        catSummary[t.category || 'Outros'] = (catSummary[t.category || 'Outros'] || 0) + Number(t.amount);
      });
      const topCats = Object.entries(catSummary).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([cat, val]) => `  • ${cat}: R$ ${val.toFixed(2)}`).join('\n');

      const upcomingLines = upcoming.slice(0, 5).map((b: any) => {
        const dateFmt = b.date ? b.date.split('T')[0].split('-').reverse().join('/') : '';
        return `  • ${b.description}: R$ ${Number(b.amount).toFixed(2)} (${dateFmt})`;
      }).join('\n');

      const weekStart = sevenDaysAgo.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const weekEnd = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

      let msg = `📊 *Resumo Semanal Zyvion*\n_${weekStart} a ${weekEnd}_\n\n`;
      msg += `💰 *Entradas na semana:* R$ ${weekIncome.toFixed(2)}\n`;
      msg += `💸 *Saídas na semana:* R$ ${weekExpense.toFixed(2)}\n`;
      msg += `🏦 *Saldo atual:* R$ ${totalBalance.toFixed(2)}\n`;
      if (topCats) msg += `\n📌 *Top gastos da semana:*\n${topCats}\n`;
      if (upcoming.length > 0) msg += `\n📅 *Contas vencendo nos próximos 7 dias (${upcoming.length}):*\n${upcomingLines}\n`;
      msg += `\nBoa semana! 🚀`;

      if (u.whatsapp_enabled && u.whatsapp_number) await sendWhatsApp(u.whatsapp_number, msg);
    }

    return res.status(200).json({ success: true, usersNotified: filteredUsers.length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
