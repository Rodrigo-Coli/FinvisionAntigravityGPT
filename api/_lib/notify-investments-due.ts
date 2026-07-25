import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { isCronAuthorized } from './cron-auth.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

let vapidPub = process.env.VAPID_PUBLIC_KEY || '';
let vapidPriv = process.env.VAPID_PRIVATE_KEY || '';

if (vapidPub.startsWith("'") && vapidPub.endsWith("'")) vapidPub = vapidPub.slice(1, -1);
if (vapidPub.startsWith('"') && vapidPub.endsWith('"')) vapidPub = vapidPub.slice(1, -1);
if (vapidPriv.startsWith("'") && vapidPriv.endsWith("'")) vapidPriv = vapidPriv.slice(1, -1);
if (vapidPriv.startsWith('"') && vapidPriv.endsWith('"')) vapidPriv = vapidPriv.slice(1, -1);

if (vapidPub && vapidPriv) {
  try {
    webpush.setVapidDetails('mailto:suporte@finvision.com.br', vapidPub, vapidPriv);
  } catch (err: any) {
    console.error('⚠️ [VAPID] Erro ao carregar chaves de notificacao push (investimentos):', err.message);
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
          text: text,
          options: { delay: 1200, presence: 'composing' },
          textMessage: { text: text }
        })
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error(`[Evolution API sendWhatsApp Error - Investimentos] Status ${res.status}: ${errText}`);
      }
    } catch (err) {
      console.error('Evolution API Error (Investimentos):', err);
    }
  }
}

const INVEST_TYPE_LABEL: Record<string, string> = {
  CDB: 'CDB', LCI_LCA: 'LCI/LCA', TESOURO: 'Tesouro', DEBENTURES: 'Debêntures',
  CRI_CRA: 'CRI/CRA', COE: 'COE', ACOES: 'Ações', FIIS: 'FIIs', FUNDOS: 'Fundos',
  CRIPTO: 'Cripto', PREVIDENCIA: 'Previdência', POUPANCA: 'Poupança', OUTROS: 'Outros'
};

// Avisa véspera/dia/vencimento de investimentos com data de vencimento cadastrada,
// seguindo a mesma régua já usada para contas a pagar (handleNotifyBillsDue).
export async function handleNotifyInvestmentsDue(req: any, res: any) {
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

    const { data: assets } = await supabase
      .from('physical_assets')
      .select('id, user_id, name, metadata, estimated_value')
      .eq('category', 'INVESTMENT')
      .in('user_id', userIds)
      .gte('metadata->>vencimentoDate', sevenDaysAgoStr)
      .lte('metadata->>vencimentoDate', tomorrowStr);

    const dueAssets = (assets || []).filter((a: any) => a.metadata?.status !== 'RESGATADO');
    if (dueAssets.length === 0) return res.status(200).json({ message: 'No investments due.' });

    const assetIds = dueAssets.map((a: any) => a.id);
    const { data: reminders } = await supabase
      .from('investment_reminders')
      .select('asset_id, note')
      .in('asset_id', assetIds);
    const reminderByAsset = new Map((reminders || []).map((r: any) => [r.asset_id, r.note]));

    for (const u of filteredUsers) {
      const userAssets = dueAssets.filter((a: any) => a.user_id === u.user_id);
      if (userAssets.length === 0) continue;

      let msg = `*Zyvion* 📈\nVocê tem *${userAssets.length}* investimento${userAssets.length !== 1 ? 's' : ''} vencendo:\n\n`;
      userAssets.forEach((a: any) => {
        const vDate = a.metadata?.vencimentoDate || '';
        const dateFmt = vDate ? vDate.split('-').reverse().join('/') : 'Sem data';

        let statusLabel = '';
        if (vDate === yesterdayStr) statusLabel = `🚨 Venceu em ${dateFmt} (Ontem)`;
        else if (vDate === todayStr) statusLabel = `📅 Vence Hoje - ${dateFmt}`;
        else if (vDate === tomorrowStr) statusLabel = `📅 Vence Amanhã - ${dateFmt}`;
        else if (vDate < todayStr) statusLabel = `🚨 Venceu em ${dateFmt}`;
        else statusLabel = `📅 Vence em ${dateFmt}`;

        const typeLabel = INVEST_TYPE_LABEL[a.metadata?.investmentType] || a.metadata?.investmentType || 'Investimento';
        const note = reminderByAsset.get(a.id);

        msg += `• *${a.name}* (${typeLabel})\n  └─ Saldo: *R$ ${Number(a.estimated_value || 0).toFixed(2)}*\n  └─ Status: *${statusLabel}*\n`;
        if (note) msg += `  └─ ⭐ Seu plano: _${note}_\n`;
        msg += '\n';
      });
      msg += `Confira e decida: resgatar ou reinvestir. 🚀`;

      if (u.whatsapp_enabled && u.whatsapp_number) await sendWhatsApp(u.whatsapp_number, msg);
      if (u.push_enabled && u.push_subscription) {
        try {
          await webpush.sendNotification(u.push_subscription, JSON.stringify({
            title: 'Zyvion 📈',
            body: `Você tem ${userAssets.length} investimento${userAssets.length !== 1 ? 's' : ''} vencendo.`,
            url: '/#/assets?view=investments'
          }));
        } catch (pushErr: any) {
          console.error(`[WebPush Error - Investimentos] Falha ao enviar para o usuário ${u.user_id}:`, pushErr.message || pushErr);
        }
      }
    }
    return res.status(200).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
