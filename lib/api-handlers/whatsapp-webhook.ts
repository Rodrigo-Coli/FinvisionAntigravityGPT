import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body;
  
  // A Evolution API envia eventos, o mais comum é 'messages.upsert'
  if (body.event !== 'messages.upsert') {
    return res.status(200).json({ status: 'ignored' });
  }

  const message = body.data;
  const remoteJid = message.key.remoteJid;
  const pushName = message.pushName || 'Usuário';
  const phone = remoteJid.split('@')[0];

  // 1. Localizar usuário pelo telefone
  const { data: userSet } = await supabase
    .from('user_settings')
    .select('user_id, whatsapp_number')
    .ilike('whatsapp_number', `%${phone}%`)
    .maybeSingle();

  if (!userSet) {
    console.log(`Mensagem de número não registrado: ${phone}`);
    return res.status(200).json({ status: 'user_not_found' });
  }

  const userId = userSet.user_id;
  const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
  const hasImage = !!message.message?.imageMessage;
  const hasAudio = !!message.message?.audioMessage;

  // 2. Lógica de Comandos (Confirmação)
  if (text.toLowerCase() === 'sim' || text.toLowerCase() === 'confirmar') {
    const { data: draft } = await supabase
      .from('whatsapp_drafts')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .neq('data->>type', 'lock')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (draft) {
      // Salvar a transação real
      const tx = draft.data;
      const { error } = await supabase.from('transactions').insert({
        user_id: userId,
        description: tx.description,
        amount: tx.amount,
        date: tx.date || new Date().toISOString().split('T')[0],
        type: tx.type || 'EXPENSE',
        category: tx.category || 'Outros',
        subcategory: tx.subcategory || null,
        is_paid: true
      });

      await supabase.from('whatsapp_drafts').update({ status: 'confirmed' }).eq('id', draft.id);

      await sendWhatsApp(phone, `✅ *Lançamento Confirmado!*\n"${tx.description}" de R$ ${tx.amount.toFixed(2)} foi salvo no FinVision.`);
      return res.status(200).json({ status: 'confirmed' });
    }
  }

  if (text.toLowerCase() === 'não' || text.toLowerCase() === 'cancelar') {
    await supabase.from('whatsapp_drafts').update({ status: 'canceled' }).eq('user_id', userId).eq('status', 'pending');
    await sendWhatsApp(phone, `❌ *Lançamento Cancelado.*`);
    return res.status(200).json({ status: 'canceled' });
  }

  // 3. Lógica de Entrada (Texto, Imagem ou Áudio)
  if (text || hasImage || hasAudio) {
     await sendWhatsApp(phone, `🤖 *FinVision IA está processando...*`);
     
     let prompt = "Você é um assistente financeiro. Extraia os dados de transação (descrição, valor, data, categoria) do seguinte input. Retorne APENAS um JSON: {description, amount, date, category, type}. Se for gasto, type='EXPENSE'.";
     
     // Aqui integraríamos com o Gemini via API
     // Simulação de resposta da IA para fins de implementação robusta
     // Em produção, usaríamos process.env.GEMINI_API_KEY
     
     const mockData = {
        description: text || "Compra via WhatsApp",
        amount: 25.50,
        date: new Date().toISOString().split('T')[0],
        category: "Outros",
        type: "EXPENSE"
     };

     // Salvar Rascunho
     await supabase.from('whatsapp_drafts').insert({
        user_id: userId,
        phone: phone,
        data: { ...mockData, subcategory: null, account_name: null },
        status: 'pending'
     });

     await sendWhatsApp(phone, `📝 *Rascunho Gerado!*\n\n*Descrição:* ${mockData.description}\n*Valor:* R$ ${mockData.amount.toFixed(2)}\n*Categoria:* ${mockData.category}\n⚠️ *Subcategoria:* _[Não informada]_\n⚠️ *Banco/Conta:* _[Não informado]_\n\nConfirma o lançamento? Digite *SIM* ou *NÃO*.`);
  }

  return res.status(200).json({ status: 'processed' });
}

async function sendWhatsApp(number: string, text: string) {
  if (process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE) {
    const payload = {
      number: number,
      options: { delay: 500 },
      textMessage: { text: text }
    };
    await fetch(`${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.EVOLUTION_API_KEY
      },
      body: JSON.stringify(payload)
    }).catch(err => console.error('Evolution API Error:', err));
  }
}
