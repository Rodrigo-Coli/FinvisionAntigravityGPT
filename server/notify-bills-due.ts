import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

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
    
    // Get all users with WhatsApp enabled
    const { data: users } = await supabase
      .from('user_settings')
      .select('user_id, whatsapp_number')
      .eq('whatsapp_enabled', true)
      .not('whatsapp_number', 'is', null)
      .not('whatsapp_number', 'eq', '');

    if (!users || users.length === 0) return res.status(200).json({ message: 'No users subscribed.' });

    const userIds = users.map(u => u.user_id);

    // Get unpaid expenses due today or tomorrow
    const { data: expenses } = await supabase
      .from('transactions')
      .select('id, description, amount, date, user_id')
      .eq('type', 'EXPENSE')
      .eq('is_paid', false)
      .in('user_id', userIds)
      .gte('date', todayStr)
      .lte('date', tomorrowStr);

    const userExpenses: Record<string, any[]> = {};
    expenses?.forEach(exp => {
      if (!userExpenses[exp.user_id]) userExpenses[exp.user_id] = [];
      userExpenses[exp.user_id].push(exp);
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
          msg += `- ${e.description}: R$ ${e.amount.toFixed(2)}\n`;
        });
        msg += '\n';
      }

      if (dueTomorrow.length > 0) {
        hasBills = true;
        msg += `🟡 *Vencendo Amanhã:*\n`;
        dueTomorrow.forEach(e => {
          msg += `- ${e.description}: R$ ${e.amount.toFixed(2)}\n`;
        });
      }

      if (!hasBills) continue;

      msg += `\nFaça a baixa no sistema: https://finvision.automanow.com.br`;

      // Log to console for observability
      console.log(`Sending to ${u.whatsapp_number}: ${dueToday.length + dueTomorrow.length} bills.`);

      // Send via Evolution API Integration
      if (process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE) {
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
      } else {
        console.log('Evolution API not configured. Notification skipped.');
      }

      sentCount++;
    }

    return res.status(200).json({ success: true, notifications_sent: sentCount });

  } catch (err: any) {
    console.error('CRON Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
