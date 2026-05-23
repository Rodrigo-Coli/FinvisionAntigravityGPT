import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function sendWhatsApp(number: string, text: string) {
  if (process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE) {
    await fetch(`${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': process.env.EVOLUTION_API_KEY as string },
      body: JSON.stringify({ number, options: { delay: 500 }, textMessage: { text } })
    }).catch(err => console.error('Evolution API Error:', err));
  }
}

async function downloadEvolutionMedia(message: any): Promise<{ base64: string; mimeType: string } | null> {
  if (!process.env.EVOLUTION_API_URL || !process.env.EVOLUTION_API_KEY || !process.env.EVOLUTION_INSTANCE) {
    return null;
  }
  const url = `${process.env.EVOLUTION_API_URL}/message/downloadMedia/${process.env.EVOLUTION_INSTANCE}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.EVOLUTION_API_KEY as string
      },
      body: JSON.stringify({
        message: {
          key: message.key,
          message: message.message
        }
      })
    });
    
    if (!res.ok) {
      console.error('Failed to download media from Evolution API. Status:', res.status);
      return null;
    }
    
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const json = await res.json();
      const base64 = json.base64 || json.data || '';
      return { base64, mimeType: message.message?.imageMessage?.mimetype || 'image/jpeg' };
    } else {
      const buffer = await res.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      return { base64, mimeType: message.message?.imageMessage?.mimetype || 'image/jpeg' };
    }
  } catch (err) {
    console.error('Error downloading media from Evolution API:', err);
    return null;
  }
}

async function handleInteractiveFinancialQuery(userId: string, queryText: string, phone: string) {
  const now = new Date();
  const filterStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const filterEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  threeMonthsAgo.setDate(1);
  const historyStart = threeMonthsAgo.toISOString().split('T')[0];

  const [accountsRes, txRes, cardsRes, assetsRes, liabilitiesRes, historyRes] = await Promise.all([
    supabase.from('accounts').select('institution, type, current_balance').eq('user_id', userId).eq('is_archived', false),
    supabase.from('transactions')
      .select('amount, type, category, date, description, is_amortization, liability_id, is_paid, metadata')
      .eq('user_id', userId)
      .is('is_deleted', false)
      .neq('type', 'ADJUSTMENT')
      .gte('date', filterStart)
      .lte('date', filterEnd)
      .order('date', { ascending: false })
      .limit(100),
    supabase.from('credit_cards').select('brand, limit').eq('user_id', userId),
    supabase.from('physical_assets').select('id, name, category, estimated_value').eq('user_id', userId),
    supabase.from('liabilities').select('id, name, type, total_amount, remaining_balance, installment_amount, installments_remaining, interest_rate, metadata').eq('user_id', userId),
    supabase.from('transactions')
      .select('amount, type, category, date, is_amortization')
      .eq('user_id', userId)
      .is('is_deleted', false)
      .neq('type', 'ADJUSTMENT')
      .gte('date', historyStart)
      .lt('date', filterStart)
  ]);

  const accounts = accountsRes.data || [];
  const transactions = txRes.data || [];
  const creditCards = cardsRes.data || [];
  const assetsData = assetsRes.data || [];
  const liabilitiesData = liabilitiesRes.data || [];
  const historicalData = historyRes?.data || [];

  const totalBalance = accounts.reduce((s: number, a: any) => s + Number(a.current_balance || 0), 0);
  const totalPhysicalAssets = assetsData.reduce((s: number, l: any) => s + Number(l.estimated_value || 0), 0);
  const totalDebt = liabilitiesData.reduce((s: number, l: any) => s + Number(l.remaining_balance || 0), 0);
  const netWorth = totalBalance + totalPhysicalAssets - totalDebt;

  const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let currentMonthIncome = 0;
  let currentMonthExpense = 0;
  const categorySummary: Record<string, number> = {};

  transactions.forEach((t: any) => {
    if (t.date && t.date.startsWith(currentMonthPrefix)) {
      const amt = Math.abs(Number(t.amount) || 0);
      if (t.is_amortization) return; // skip amortizations from regular monthly flow totals
      if (t.type === 'INCOME') {
        currentMonthIncome += amt;
      } else if (t.type === 'EXPENSE') {
        currentMonthExpense += amt;
        categorySummary[t.category] = (categorySummary[t.category] || 0) + amt;
      }
    }
  });

  const topCategories = Object.entries(categorySummary)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cat, val]) => `${cat}: R$ ${val.toFixed(2)}`)
    .join(' | ');

  const periodLabel = `De ${filterStart.split('-').reverse().join('/')} até ${filterEnd.split('-').reverse().join('/')}`;

  const histTxs = historicalData.filter((t: any) => t.type === 'EXPENSE' && !t.is_amortization) || [];
  const histCategoryTotals: Record<string, number> = {};
  const monthsCaptured = new Set();
  histTxs.forEach((t: any) => {
    const m = t.date.substring(0, 7);
    monthsCaptured.add(m);
    histCategoryTotals[t.category] = (histCategoryTotals[t.category] || 0) + Math.abs(t.amount);
  });
  const numMonths = monthsCaptured.size || 1;
  const historicalAverages = Object.entries(histCategoryTotals)
    .map(([cat, total]) => `${cat}: R$ ${(total / numMonths).toFixed(2)}/mês`)
    .slice(0, 10).join(' | ');

  const dataHoje = now.toLocaleDateString('pt-BR', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric'
  });

  // Construct detailed liabilities summary just like handle-wealth-analysis
  const liabilitiesSummary = liabilitiesData.map((l: any) => {
    const ir = l.interest_rate ? `juros ${l.interest_rate}% a.a.` : 'sem juros definidos';
    const propertyStatus = l.metadata?.propertyType ? `[Status Imóvel: ${l.metadata.propertyType}]` : '';
    const parcelas = l.installments_remaining 
      ? `${l.installments_remaining} parcelas de R$ ${Number(l.installment_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` 
      : 'sem parcelas mensais configuradas';
    
    // Extract balloons and down payments linked to this liability inside current fetched txs
    const linkedTxs = transactions.filter(t => t.liability_id === l.id);
    const atos = linkedTxs.filter(t => t.metadata?.type === 'DOWN_PAYMENT' || (t.description || '').toUpperCase().includes('ATO'));
    const baloes = linkedTxs.filter(t => t.metadata?.type === 'INTERMEDIARY' || (t.description || '').toUpperCase().includes('INTERMEDIÁRIA') || (t.description || '').toUpperCase().includes('BALÃO'));
    
    const atosSummary = atos.length > 0 
      ? `\n    └─ Entrada/Atos: ${atos.map(a => `${a.description.split(' - ')[0]}: R$ ${Number(a.amount).toLocaleString('pt-BR')} (${a.is_paid ? 'PAGO' : 'PENDENTE'})`).join(', ')}`
      : '';
    const baloesSummary = baloes.length > 0 
      ? `\n    └─ Balões/Intermediárias: ${baloes.map(b => `${b.description.split(' - ')[0]}: R$ ${Number(b.amount).toLocaleString('pt-BR')} (${b.is_paid ? 'PAGO' : 'PENDENTE'})`).join(', ')}`
      : '';
    
    return `${l.name} (${l.type}) ${propertyStatus}: Saldo Devedor R$ ${Number(l.remaining_balance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}, ${ir}, ${parcelas}${atosSummary}${baloesSummary}`;
  }).join('\n- ');

  const systemPrompt = `
# IDENTIDADE
Você é a FinVision AI, a Assistente Financeira Premium do software FinVision Pro.
Seu tom de voz deve ser de especialista, educado, curto e sucinto. Use emojis úteis (📊, 💼, 💸, 💰).

# REGRAS DO WHATSAPP
1. Limite sua resposta a no máximo 3 ou 4 parágrafos curtos.
2. Use formatações em negrito do WhatsApp (*texto*).
3. Nunca invente dados. Use as métricas reais fornecidas abaixo para responder à dúvida.

# DADOS DO USUÁRIO
Hoje é ${dataHoje}.
*Período Ativo do Usuário: ${periodLabel}*
• Saldo Consolidado: R$ ${totalBalance.toFixed(2)}
• Entradas no Mês: R$ ${currentMonthIncome.toFixed(2)}
• Saídas no Mês: R$ ${currentMonthExpense.toFixed(2)}
• Top Despesas: ${topCategories || 'Nenhuma registrada'}
• Bens/Ativos: R$ ${totalPhysicalAssets.toFixed(2)}
• Dívidas (Passivos): R$ ${totalDebt.toFixed(2)}
• Patrimônio Líquido: R$ ${netWorth.toFixed(2)}
• Contas: ${accounts.map((a: any) => `${a.institution}(R$${Number(a.current_balance).toFixed(2)})`).join(', ')}
• Bens Detalhados: ${assetsData.map((a: any) => `${a.name}(R$${Number(a.estimated_value).toFixed(2)})`).join(', ')}
• Dívidas Detalhadas:
- ${liabilitiesSummary || 'Nenhuma registrada'}
• Cartões Cadastrados: ${creditCards.map((c: any) => `${c.brand}(Lim:R$${c.limit})`).join(', ') || 'Nenhum'}
• Últimas 15 transações:
${transactions.slice(0, 15).map((t: any) => `- ${t.date.split('T')[0]}|${t.category}|R$ ${t.amount}|${t.type}|${t.description}${t.is_amortization ? ' (Amortização)' : ''}`).join('\n')}
`;

  const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!geminiKey) throw new Error('GEMINI_API_KEY não configurada.');
  const ai = new GoogleGenAI({ apiKey: geminiKey });

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: queryText }] }],
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.7,
    }
  });

  const rawReply = (response as any).text || (response as any).candidates?.[0]?.content?.parts?.[0]?.text || 'Desculpe, não consegui obter resposta da análise agora.';
  await sendWhatsApp(phone, rawReply);
}

export async function handleWhatsAppWebhook(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();
  const body = req.body || {};
  if (body.event !== 'messages.upsert') return res.status(200).json({ status: 'ignored' });

  try {
    const message = body.data;
    const remoteJid = message.key.remoteJid;
    const phone = remoteJid.split('@')[0];

    const { data: userSet } = await supabase
      .from('user_settings')
      .select('user_id, whatsapp_number, whatsapp_enabled')
      .ilike('whatsapp_number', `%${phone}%`)
      .maybeSingle();

    if (!userSet) return res.status(200).json({ status: 'user_not_found' });
    if (!userSet.whatsapp_enabled) return res.status(200).json({ status: 'whatsapp_disabled_by_user' });

    const userId = userSet.user_id;
    const text = (message.message?.conversation || message.message?.extendedTextMessage?.text || '').trim();

    // Confirm draft logic
    if (text.toLowerCase() === 'sim' || text.toLowerCase() === 'confirmar') {
      const { data: draft } = await supabase
        .from('whatsapp_drafts')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (draft) {
        const tx = draft.data;
        
        // Find checking account for transaction binding, fallback if none
        const { data: defaultAcc } = await supabase
          .from('accounts')
          .select('id')
          .eq('user_id', userId)
          .eq('is_archived', false)
          .limit(1)
          .maybeSingle();

        await supabase.from('transactions').insert({
          user_id: userId,
          account_id: defaultAcc?.id || null,
          description: tx.description,
          amount: tx.amount,
          date: tx.date || new Date().toISOString().split('T')[0],
          type: tx.type || 'EXPENSE',
          category: tx.category || 'Outros',
          is_paid: true
        });

        await supabase.from('whatsapp_drafts').update({ status: 'confirmed' }).eq('id', draft.id);
        await sendWhatsApp(phone, `✅ *Lançamento Confirmado!*\n\n"${tx.description}" de R$ ${Number(tx.amount).toFixed(2)} foi inserido com sucesso!`);
        return res.status(200).json({ status: 'confirmed' });
      }
    }

    // Cancel draft logic
    if (text.toLowerCase() === 'não' || text.toLowerCase() === 'cancelar') {
      await supabase.from('whatsapp_drafts').update({ status: 'canceled' }).eq('user_id', userId).eq('status', 'pending');
      await sendWhatsApp(phone, `🚫 *Lançamento Cancelado.*`);
      return res.status(200).json({ status: 'canceled' });
    }

    // Receipt OCR processing
    if (message.message?.imageMessage) {
      await sendWhatsApp(phone, `🤖 *Processando foto do comprovante...*`);
      const media = await downloadEvolutionMedia(message);
      if (!media) {
        await sendWhatsApp(phone, `❌ *Não consegui baixar a imagem.* Verifique a configuração da Evolution API.`);
        return res.status(200).json({ status: 'media_error' });
      }

      const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!geminiKey) throw new Error('GEMINI_API_KEY não configurada.');
      const ai = new GoogleGenAI({ apiKey: geminiKey });

      const ocrPrompt = `
      Você é um especialista em análise de comprovantes e notas fiscais de compras.
      Extraia as informações cruciais desta imagem.

      RETORNE ESTRITAMENTE UM OBJETO JSON COM O FORMATO:
      {
        "description": "Nome do estabelecimento / loja",
        "amount": 0.00,
        "date": "YYYY-MM-DD",
        "category": "Alimentação | Transporte | Lazer | Lojas | Saúde | Outros",
        "type": "EXPENSE"
      }
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{
          parts: [
            { text: ocrPrompt },
            { inlineData: { data: media.base64, mimeType: media.mimeType } }
          ]
        }],
        config: {
          responseMimeType: "application/json"
        }
      });

      const rawText = (response as any).text || (response as any).candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!rawText) throw new Error('OCR response empty');

      const cleanJson = rawText.replace(/```json|```/g, "").trim();
      const ocrData = JSON.parse(cleanJson);

      await supabase.from('whatsapp_drafts').insert({
        user_id: userId,
        phone: phone,
        data: ocrData,
        status: 'pending'
      });

      const dateFmt = ocrData.date ? ocrData.date.split('-').reverse().join('/') : '';
      await sendWhatsApp(phone, `📝 *Rascunho Extraído via Foto!* 📸\n\n*Estabelecimento:* ${ocrData.description}\n*Valor:* R$ ${Number(ocrData.amount).toFixed(2)}\n*Categoria:* ${ocrData.category}\n*Data:* ${dateFmt}\n\nConfirma o lançamento? Digite *SIM* ou *NÃO*.`);
      return res.status(200).json({ status: 'photo_processed' });
    }

    // Text parsing or query classification
    if (text) {
      const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!geminiKey) throw new Error('GEMINI_API_KEY não configurada.');
      const ai = new GoogleGenAI({ apiKey: geminiKey });

      const classificationPrompt = `
      Você é o cérebro classificador da assistente FinVision AI.
      Classifique a mensagem do usuário a seguir.
      Mensagem: "${text}"

      RETORNE ESTRITAMENTE UM OBJETO JSON COM O FORMATO:
      {
        "intent": "TRANSACTION" | "QUERY" | "CHAT",
        "transaction": {
          "description": "Ex: Mercado Extra, Posto Ipiranga",
          "amount": 0.00,
          "category": "Alimentação | Transporte | Moradia | Saúde | Lazer | Salário | Outros",
          "type": "EXPENSE" | "INCOME",
          "date": "YYYY-MM-DD"
        },
        "chatReply": "Resposta caso seja intenção CHAT"
      }

      Regras de classificação:
      - Se a mensagem indica um lançamento de gasto ou ganho ("gastei 50 no mercado", "recebi 200 de pix", "salário de 5000 caiu"), a intenção é "TRANSACTION". Preencha os campos de "transaction". Se não houver data explícita, use a data de hoje: ${new Date().toISOString().split('T')[0]}.
      - Se a mensagem é uma pergunta financeira sobre dados, contas, saldos, ou resumos ("quanto gastei no mês", "qual o saldo atual", "resumo"), a intenção é "QUERY".
      - Se for uma saudação casual ou conversa genérica, a intenção é "CHAT". Crie uma resposta em "chatReply" curta e carismática em português com emojis.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: classificationPrompt }] }],
        config: {
          responseMimeType: "application/json"
        }
      });

      const rawText = (response as any).text || (response as any).candidates?.[0]?.content?.parts?.[0]?.text || '';
      const cleanJson = rawText.replace(/```json|```/g, "").trim();
      const analysis = JSON.parse(cleanJson);

      if (analysis.intent === 'TRANSACTION') {
        const tx = analysis.transaction;
        await supabase.from('whatsapp_drafts').insert({
          user_id: userId,
          phone: phone,
          data: tx,
          status: 'pending'
        });

        const dateFmt = tx.date ? tx.date.split('-').reverse().join('/') : '';
        await sendWhatsApp(phone, `📝 *Rascunho Criado via IA!* 🤖\n\n*Descrição:* ${tx.description}\n*Valor:* R$ ${Number(tx.amount).toFixed(2)}\n*Categoria:* ${tx.category}\n*Data:* ${dateFmt}\n\nConfirma o lançamento? Digite *SIM* ou *NÃO*.`);
        return res.status(200).json({ status: 'draft_created' });
      }

      if (analysis.intent === 'QUERY') {
        await sendWhatsApp(phone, `📊 *Analisando seus dados financeiros em tempo real...*`);
        await handleInteractiveFinancialQuery(userId, text, phone);
        return res.status(200).json({ status: 'query_answered' });
      }

      if (analysis.intent === 'CHAT') {
        await sendWhatsApp(phone, analysis.chatReply || 'Olá! Sou a FinVision AI. Como posso te ajudar com suas finanças hoje?');
        return res.status(200).json({ status: 'chat_replied' });
      }
    }

    return res.status(200).json({ status: 'no_action' });
  } catch (err: any) {
    console.error('Error handling whatsapp webhook:', err);
    return res.status(500).json({ error: err.message });
  }
}
