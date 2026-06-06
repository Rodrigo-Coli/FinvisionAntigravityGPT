import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:suporte@finvision.com.br',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export default async function handler(req: any, res: any) {
  // CRON Authentication
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    // Permitimos chamadas locais ou com master key pra debug
    if (!process.env.IS_LOCAL && req.query.key !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized CRON request' });
    }
  }

  try {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayStr = today.toISOString().split('T')[0];
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    // Get all users with WhatsApp OR Push enabled
    const { data: allUsers } = await supabase
      .from('user_settings')
      .select('user_id, whatsapp_number, whatsapp_enabled, push_subscription, push_enabled');

    const users = allUsers?.filter(u => 
      (u.whatsapp_enabled && u.whatsapp_number) || 
      (u.push_enabled && u.push_subscription)
    ) || [];

    if (users.length === 0) return res.status(200).json({ message: 'No users subscribed.' });

    const userIds = users.map(u => u.user_id);

    // Get unpaid expenses due today or tomorrow
    const { data: expenses } = await supabase
      .from('transactions')
      .select('id, description, amount, date, user_id')
      .eq('type', 'EXPENSE')
      .eq('is_paid', false)
      .eq('is_deleted', false)
      .in('user_id', userIds)
      .gte('date', todayStr)
      .lte('date', tomorrowStr);

    // Get open credit card statements due today or tomorrow
    const { data: statements } = await supabase
      .from('card_statements')
      .select('id, total_amount, paid_amount, due_date, user_id, cards(name)')
      .eq('status', 'OPEN')
      .in('user_id', userIds)
      .gte('due_date', todayStr)
      .lte('due_date', tomorrowStr);

    const userExpenses: Record<string, any[]> = {};
    expenses?.forEach(exp => {
      if (!userExpenses[exp.user_id]) userExpenses[exp.user_id] = [];
      userExpenses[exp.user_id].push({ ...exp, is_card: false });
    });

    statements?.forEach(stmt => {
      if (!userExpenses[stmt.user_id]) userExpenses[stmt.user_id] = [];
      const amountDue = (stmt.total_amount || 0) - (stmt.paid_amount || 0);
      if (amountDue > 0) {
        userExpenses[stmt.user_id].push({
          id: stmt.id,
          description: `Fatura ${Array.isArray(stmt.cards) ? (stmt.cards[0] as any)?.name : (stmt.cards as any)?.name || 'Cartão'}`,
          amount: amountDue,
          date: stmt.due_date,
          is_card: true
        });
      }
    });

    let sentCount = 0;

    for (const u of users) {
      const userExp = userExpenses[u.user_id];
      if (!userExp || userExp.length === 0) continue;

      const dueToday = userExp.filter(e => e.date === todayStr);
      const dueTomorrow = userExp.filter(e => e.date === tomorrowStr);

      let msg = `*FinVision Pro* 🤖\nResumo de Contas a Pagar:\n\n`;
      let hasBills = false;

      if (dueToday.length > 0) {
        hasBills = true;
        msg += `🔴 *Vencendo HOJE:*\n`;
        dueToday.forEach(e => {
          const icon = e.is_card ? '💳' : '📄';
          msg += `- ${icon} ${e.description}: R$ ${e.amount.toFixed(2)}\n`;
        });
        msg += '\n';
      }

      if (dueTomorrow.length > 0) {
        hasBills = true;
        msg += `🟡 *Vencendo Amanhã:*\n`;
        dueTomorrow.forEach(e => {
          const icon = e.is_card ? '💳' : '📄';
          msg += `- ${icon} ${e.description}: R$ ${e.amount.toFixed(2)}\n`;
        });
      }

      if (!hasBills) continue;

      msg += `\nFaça a baixa no sistema: https://finvision.automanow.com.br`;

      // Log to console for observability
      console.log(`Sending to ${u.whatsapp_number}: ${dueToday.length + dueTomorrow.length} bills.`);

      // Send via Evolution API Integration
      if (u.whatsapp_enabled && u.whatsapp_number && process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE) {
        const payload = {
          number: u.whatsapp_number,
          options: { delay: 1200, presence: "composing" },
          textMessage: { text: msg }
        };
        await fetch(`${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.EVOLUTION_API_KEY
          },
          body: JSON.stringify(payload)
        }).catch(err => console.error('Evolution API Error:', err));
      } else if (u.whatsapp_enabled) {
        console.log('Evolution API not configured. WhatsApp Notification skipped.');
      }

      // Send via Web Push API
      if (u.push_enabled && u.push_subscription && process.env.VAPID_PUBLIC_KEY) {
        try {
          const pushPayload = JSON.stringify({
            title: 'FinVision Pro: Contas a Pagar',
            body: `Você tem ${dueToday.length + dueTomorrow.length} vencimento(s) precisando de revisão hoje.`,
            icon: '/logo.png', // Fallback icon path (can be absolute url)
            url: 'https://finvision.automanow.com.br/#/dashboard'
          });
          
          await webpush.sendNotification(u.push_subscription, pushPayload);
          console.log(`Web Push sent successfully to ${u.user_id}`);
        } catch (pushErr) {
          console.error(`Error sending Web Push to ${u.user_id}:`, pushErr);
        }
      }

      sentCount++;
    }

    return res.status(200).json({ success: true, notifications_sent: sentCount });

  } catch (err: any) {
    console.error('CRON Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
