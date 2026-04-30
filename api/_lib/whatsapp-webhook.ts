import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

async function sendWhatsApp(number: string, text: string) {
  if (process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE) {
    await fetch(`${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': process.env.EVOLUTION_API_KEY as string },
      body: JSON.stringify({ number, options: { delay: 500 }, textMessage: { text } })
    }).catch(err => console.error('Evolution API Error:', err));
  }
}

export async function handleWhatsAppWebhook(req: any, res: any) {
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
