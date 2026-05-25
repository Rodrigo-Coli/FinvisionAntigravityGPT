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
      body: JSON.stringify({ 
        number: number, 
        text: text
      })
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
    const mimeType = message.message?.imageMessage?.mimetype 
      || message.message?.audioMessage?.mimetype 
      || message.message?.documentMessage?.mimetype 
      || 'application/octet-stream';

    if (contentType.includes('application/json')) {
      const json = await res.json();
      let base64 = json.base64 || json.data || '';
      if (base64.includes(';base64,')) {
        base64 = base64.split(';base64,')[1];
      }
      return { base64, mimeType };
    } else {
      const buffer = await res.arrayBuffer();
      let base64 = Buffer.from(buffer).toString('base64');
      if (base64.includes(';base64,')) {
        base64 = base64.split(';base64,')[1];
      }
      return { base64, mimeType };
    }
  } catch (err) {
    console.error('Error downloading media from Evolution API:', err);
    return null;
  }
}

async function handleInteractiveFinancialQuery(userId: string, queryText: string, phone: string, history: any[] = []) {
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

  // Mapear o histórico para o formato do Gemini
  const contents = history.map(h => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: h.content }]
  }));

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: contents,
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.7,
    }
  });

  const rawReply = (response as any).text || (response as any).candidates?.[0]?.content?.parts?.[0]?.text || 'Desculpe, não consegui obter resposta da análise agora.';
  await sendWhatsApp(phone, rawReply);

  // Salvar a resposta no histórico de chat
  history.push({ role: 'model', content: rawReply });
  await supabase.from('whatsapp_chat_sessions').upsert({
    phone: phone,
    messages: history,
    updated_at: new Date().toISOString()
  }, { onConflict: 'phone' });
}

async function findMatchingTransactions(userId: string, filters: { description?: string; amount?: number; date?: string }, isPay: boolean = false) {
  let query = supabase
    .from('transactions')
    .select('id, description, amount, date, is_paid')
    .eq('user_id', userId)
    .is('is_deleted', false);

  if (isPay) {
    query = query.eq('is_paid', false).eq('type', 'EXPENSE');
  }

  if (filters.date) {
    const targetDate = filters.date.split('T')[0];
    query = query.eq('date', targetDate);
  }

  const { data: txs, error } = await query.order('date', { ascending: false }).limit(50);
  if (error) {
    console.error('Error fetching matching transactions:', error);
    return [];
  }
  if (!txs || txs.length === 0) {
    if (filters.date) {
      const fallbackQuery = supabase
        .from('transactions')
        .select('id, description, amount, date, is_paid')
        .eq('user_id', userId)
        .is('is_deleted', false);
      const { data: fallbackTxs } = await (isPay ? fallbackQuery.eq('is_paid', false).eq('type', 'EXPENSE') : fallbackQuery)
        .order('date', { ascending: false })
        .limit(50);
      if (fallbackTxs && fallbackTxs.length > 0) {
        return filterTransactionsInMemory(fallbackTxs, filters);
      }
    }
    return [];
  }

  return filterTransactionsInMemory(txs, filters);
}

function filterTransactionsInMemory(txs: any[], filters: { description?: string; amount?: number; date?: string }) {
  return txs.filter(tx => {
    let matchesAmount = true;
    let matchesDesc = true;

    if (filters.amount !== undefined && filters.amount !== null) {
      const txAmt = Math.abs(Number(tx.amount));
      const targetAmt = Math.abs(Number(filters.amount));
      if (Math.abs(txAmt - targetAmt) > 0.01) {
        matchesAmount = false;
      }
    }

    if (filters.description) {
      const txDesc = String(tx.description || '').toLowerCase().trim();
      const targetDesc = String(filters.description).toLowerCase().trim();
      if (!txDesc.includes(targetDesc) && !targetDesc.includes(txDesc)) {
        matchesDesc = false;
      }
    }

    if (filters.amount !== undefined && filters.amount !== null && filters.description) {
      return matchesAmount && matchesDesc;
    }
    if (filters.amount !== undefined && filters.amount !== null) {
      return matchesAmount;
    }
    if (filters.description) {
      return matchesDesc;
    }
    return true;
  });
}

export async function handleWhatsAppWebhook(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();
  const body = req.body || {};
  
  const eventName = String(body.event || '').toLowerCase();
  if (eventName !== 'messages.upsert' && eventName !== 'messages_upsert') {
    return res.status(200).json({ status: 'ignored', receivedEvent: body.event });
  }

  try {
    console.log('[WhatsApp Webhook] Received body:', JSON.stringify(body));

    let message = body.data;
    if (Array.isArray(message)) {
      console.log('[WhatsApp Webhook] body.data is an array. Extracting first message.');
      message = message[0];
    }

    if (!message || !message.key) {
      console.log('[WhatsApp Webhook] Ignored - No message or key found.');
      return res.status(200).json({ status: 'ignored', reason: 'no_message_data' });
    }

    // Ignorar se a mensagem foi enviada pelo próprio bot para evitar loops
    if (message.key.fromMe) {
      console.log('[WhatsApp Webhook] Ignored - Sent by self.');
      return res.status(200).json({ status: 'ignored_from_me' });
    }

    const remoteJid = message.key.remoteJid;
    if (!remoteJid) {
      return res.status(200).json({ status: 'ignored', reason: 'no_remote_jid' });
    }
    const phone = remoteJid.split('@')[0];

    // Geração de variantes robusta para números brasileiros (com e sem o nono dígito)
    let cleanPhone = phone.replace(/\D/g, '');
    let phoneVariants = [cleanPhone];
    
    if (cleanPhone.startsWith('55') && cleanPhone.length === 13 && cleanPhone[4] === '9') {
      const withoutNine = '55' + cleanPhone.substring(2, 4) + cleanPhone.substring(5);
      phoneVariants.push(withoutNine);
    } else if (cleanPhone.startsWith('55') && cleanPhone.length === 12) {
      const withNine = '55' + cleanPhone.substring(2, 4) + '9' + cleanPhone.substring(4);
      phoneVariants.push(withNine);
    }

    let userSet = null;
    for (const variant of phoneVariants) {
      const { data } = await supabase
        .from('user_settings')
        .select('user_id, whatsapp_number, whatsapp_enabled')
        .ilike('whatsapp_number', `%${variant}%`)
        .maybeSingle();
      if (data) {
        userSet = data;
        break;
      }
    }

    if (!userSet) {
      await sendWhatsApp(phone, `Olá! Bem-vindo ao *FinVision AI* 💎\n\nEu sou o seu consultor financeiro pessoal inteligente.\n\nIdentifiquei que seu número ainda não está vinculado a uma conta ativa no FinVision Pro.\n\nPara começar a gerenciar suas contas, escanear comprovantes via foto e receber análises de Private Banking em tempo real, faça seu cadastro rápido em segundos:\n\n👉 https://finvision.automanow.com.br/signup?wp=${phone}\n\n*Aproveite 7 dias grátis de acesso Wealth Premium no nosso lançamento!*`);
      return res.status(200).json({ status: 'user_invited', phoneUsed: phone });
    }
    if (!userSet.whatsapp_enabled) return res.status(200).json({ status: 'whatsapp_disabled_by_user' });

    const userId = userSet.user_id;

    // 1. Carregar histórico de mensagens das últimas 24 horas para este número
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const { data: session } = await supabase
      .from('whatsapp_chat_sessions')
      .select('*')
      .eq('phone', phone)
      .gte('updated_at', oneDayAgo.toISOString())
      .maybeSingle();

    let history = session?.messages || [];

    // Detecção de tipos de mídia
    const isImage = !!message.message?.imageMessage;
    const isPDF = !!message.message?.documentMessage && String(message.message.documentMessage.mimetype).includes('pdf');
    const isAudio = !!message.message?.audioMessage;

    // Processamento especial de mensagens de voz (Áudio)
    let text = (message.message?.conversation || message.message?.extendedTextMessage?.text || '').trim();

    if (isAudio) {
      await sendWhatsApp(phone, `🤖 *Ouvindo sua mensagem de voz...*`);
      const media = await downloadEvolutionMedia(message);
      if (!media) {
        await sendWhatsApp(phone, `❌ *Não consegui processar seu áudio.*`);
        return res.status(200).json({ status: 'audio_error' });
      }

      let cleanMimeType = media.mimeType.split(';')[0].trim();
      if (cleanMimeType.includes('audio/ogg') || cleanMimeType.includes('opus')) {
        cleanMimeType = 'audio/opus';
      }

      const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!geminiKey) throw new Error('GEMINI_API_KEY não configurada.');
      const ai = new GoogleGenAI({ apiKey: geminiKey });

      const voicePrompt = `
      Você é a inteligência transcritora da assistente financeira FinVision AI.
      Sua tarefa é ouvir o áudio do usuário e transcrever EXATAMENTE o que ele disse em formato de texto.
      Retorne apenas a transcrição do áudio em formato de texto simples, sem aspas, comentários ou decorações em português.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{
          parts: [
            { text: voicePrompt },
            { inlineData: { data: media.base64, mimeType: cleanMimeType } }
          ]
        }]
      });

      const transcribedText = ((response as any).text || (response as any).candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
      
      if (!transcribedText) {
        await sendWhatsApp(phone, `❌ *Não consegui compreender o áudio. Pode tentar falar novamente ou enviar por texto?*`);
        return res.status(200).json({ status: 'audio_unclear' });
      }

      await sendWhatsApp(phone, `🎙️ *Transcrição:* "${transcribedText}"`);
      text = transcribedText;
    }

    // Number Selection / Disambiguation logic
    const parsedNum = parseInt(text, 10);
    if (!isNaN(parsedNum) && parsedNum > 0) {
      const { data: draft } = await supabase
        .from('whatsapp_drafts')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (draft && draft.data && (draft.data.type === 'delete_disambiguation' || draft.data.type === 'pay_disambiguation')) {
        const candidates = draft.data.candidates || [];
        const selectedTx = candidates[parsedNum - 1];

        if (selectedTx) {
          const actionType = draft.data.type === 'delete_disambiguation' ? 'delete' : 'pay';
          await supabase.from('whatsapp_drafts').update({
            data: {
              type: actionType,
              transactionId: selectedTx.id,
              description: selectedTx.description,
              amount: selectedTx.amount,
              date: selectedTx.date
            }
          }).eq('id', draft.id);

          const dateFmt = selectedTx.date ? selectedTx.date.split('T')[0].split('-').reverse().join('/') : '';
          const actionLabel = actionType === 'delete' ? 'exclusão' : 'pagamento';
          await sendWhatsApp(phone, `📝 *Confirmação de Ação!* 🤖\n\nVocê selecionou: *${selectedTx.description}* - R$ ${Number(selectedTx.amount).toFixed(2)} (${dateFmt}).\n\nConfirma a ${actionLabel}? Digite *SIM* ou *NÃO*.`);
          return res.status(200).json({ status: 'disambiguation_resolved' });
        } else {
          await sendWhatsApp(phone, `❌ *Opção inválida.* Por favor, escolha um número entre 1 e ${candidates.length}, ou digite CANCELAR.`);
          return res.status(200).json({ status: 'disambiguation_invalid_option' });
        }
      }
    }

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
        
        if (tx.type === 'delete') {
          await supabase.from('transactions').update({ is_deleted: true }).eq('id', tx.transactionId);
          await supabase.from('whatsapp_drafts').update({ status: 'confirmed' }).eq('id', draft.id);
          await sendWhatsApp(phone, `✅ *Lançamento Excluído com Sucesso!*\n\n"${tx.description}" de R$ ${Number(tx.amount).toFixed(2)} foi removido.`);
          return res.status(200).json({ status: 'confirmed_delete' });
        } else if (tx.type === 'pay') {
          await supabase.from('transactions').update({ is_paid: true, paid_at: new Date().toISOString() }).eq('id', tx.transactionId);
          await supabase.from('whatsapp_drafts').update({ status: 'confirmed' }).eq('id', draft.id);
          await sendWhatsApp(phone, `✅ *Conta Marcada como Paga!*\n\n"${tx.description}" de R$ ${Number(tx.amount).toFixed(2)} foi quitada.`);
          return res.status(200).json({ status: 'confirmed_pay' });
        } else if (tx.type === 'multi') {
          const { data: defaultAcc } = await supabase
            .from('accounts')
            .select('id')
            .eq('user_id', userId)
            .eq('is_archived', false)
            .limit(1)
            .maybeSingle();

          for (const op of tx.operations) {
            if (op.intent === 'TRANSACTION') {
              await supabase.from('transactions').insert({
                user_id: userId,
                account_id: defaultAcc?.id || null,
                description: op.transaction.description,
                amount: op.transaction.amount,
                date: op.transaction.date || new Date().toISOString().split('T')[0],
                type: op.transaction.type || 'EXPENSE',
                category: op.transaction.category || 'Outros',
                is_paid: true
              });
            } else if (op.intent === 'DELETE') {
              await supabase.from('transactions').update({ is_deleted: true }).eq('id', op.transactionId);
            } else if (op.intent === 'PAY') {
              await supabase.from('transactions').update({ is_paid: true, paid_at: new Date().toISOString() }).eq('id', op.transactionId);
            }
          }
          await supabase.from('whatsapp_drafts').update({ status: 'confirmed' }).eq('id', draft.id);
          await sendWhatsApp(phone, `✅ *Múltiplas operações confirmadas e executadas com sucesso!*`);
          return res.status(200).json({ status: 'confirmed_multi' });
        } else {
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
    }

    // Cancel draft logic
    if (text.toLowerCase() === 'não' || text.toLowerCase() === 'cancelar') {
      await supabase.from('whatsapp_drafts').update({ status: 'canceled' }).eq('user_id', userId).eq('status', 'pending');
      await sendWhatsApp(phone, `🚫 *Ação Cancelada.*`);
      return res.status(200).json({ status: 'canceled' });
    }

    // Receipt OCR processing (Images & PDFs)
    if (isImage || isPDF) {
      const typeLabel = isPDF ? 'PDF' : 'foto';
      await sendWhatsApp(phone, `🤖 *Processando seu comprovante (${typeLabel})...*`);
      const media = await downloadEvolutionMedia(message);
      if (!media) {
        await sendWhatsApp(phone, `❌ *Não consegui carregar o arquivo.*`);
        return res.status(200).json({ status: 'media_error' });
      }

      const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!geminiKey) throw new Error('GEMINI_API_KEY não configurada.');
      const ai = new GoogleGenAI({ apiKey: geminiKey });

      const ocrPrompt = isPDF ? `
      Você é um especialista em análise de comprovantes, faturas e extratos bancários em formato PDF.
      Analise o conteúdo deste documento e extraia as informações financeiras relevantes.

      RETORNE ESTRITAMENTE UM OBJETO JSON COM O FORMATO:
      {
        "description": "Nome do estabelecimento / identificação da transação",
        "amount": 0.00,
        "date": "YYYY-MM-DD",
        "category": "Alimentação | Transporte | Lazer | Lojas | Saúde | Outros",
        "type": "EXPENSE"
      }
      ` : `
      Você é um especialista em análise de comprovantes e notas fiscais de compras em imagem.
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
      if (!rawText) throw new Error('AI response empty');

      const cleanJson = rawText.replace(/```json|```/g, "").trim();
      const ocrData = JSON.parse(cleanJson);

      await supabase.from('whatsapp_drafts').insert({
        user_id: userId,
        phone: phone,
        data: ocrData,
        status: 'pending'
      });

      const dateFmt = ocrData.date ? ocrData.date.split('-').reverse().join('/') : '';
      await sendWhatsApp(phone, `📝 *Rascunho Extraído via ${isPDF ? 'PDF' : 'IA'}!* 📸\n\n*Estabelecimento:* ${ocrData.description}\n*Valor:* R$ ${Number(ocrData.amount).toFixed(2)}\n*Categoria:* ${ocrData.category}\n*Data:* ${dateFmt}\n\nConfirma o lançamento? Digite *SIM* ou *NÃO*.`);
      return res.status(200).json({ status: 'file_processed' });
    }

    // Text parsing or query classification
    if (text) {
      // Salvar a mensagem do usuário no histórico
      history.push({ role: 'user', content: text });
      await supabase.from('whatsapp_chat_sessions').upsert({
        phone: phone,
        messages: history,
        updated_at: new Date().toISOString()
      }, { onConflict: 'phone' });

      const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!geminiKey) throw new Error('GEMINI_API_KEY não configurada.');
      const ai = new GoogleGenAI({ apiKey: geminiKey });

      const classificationPrompt = `
      Você é o cérebro classificador da assistente FinVision AI.
      Classifique a mensagem atual do usuário levando em consideração o histórico recente da conversa para entender pronomes ou continuações.
      O usuário pode solicitar a execução de uma ou múltiplas operações financeiras na mesma mensagem (ex: "gastei 15 de lanche e paguei a luz", "exclua o pix de 10 e me diga o saldo").
      
      # HISTÓRICO RECENTE DA CONVERSA
      ${history.slice(-5, -1).map((h: any) => `${h.role === 'user' ? 'Usuário' : 'FinVision'}: ${h.content}`).join('\n')}

      # MENSAGEM ATUAL DO USUÁRIO
      Mensagem: "${text}"

      RETORNE ESTRITAMENTE UM OBJETO JSON COM O FORMATO:
      {
        "operations": [
          {
            "intent": "TRANSACTION" | "DELETE" | "PAY" | "QUERY" | "CHAT",
            "transaction": {
              "description": "Ex: Mercado Extra, Posto Ipiranga",
              "amount": 0.00,
              "category": "Alimentação | Transporte | Moradia | Saúde | Lazer | Salário | Outros",
              "type": "EXPENSE" | "INCOME",
              "date": "YYYY-MM-DD"
            },
            "deleteFilters": {
              "description": "Ex: mercado (termo de busca ou null)",
              "amount": 50.00 (ou null),
              "date": "YYYY-MM-DD (ou null)"
            },
            "payFilters": {
              "description": "Ex: energia (termo de busca ou null)",
              "amount": 120.00 (ou null),
              "date": "YYYY-MM-DD (ou null)"
            },
            "chatReply": "Resposta caso seja intenção CHAT"
          }
        ]
      }

      Regras de classificação:
      - Divida a mensagem em uma ou mais operações caso o usuário peça mais de uma ação.
      - Para cada operação, defina a intenção ("TRANSACTION", "DELETE", "PAY", "QUERY" ou "CHAT") e preencha os campos relevantes.
      - Se a intenção for cadastrar um gasto ou ganho ("gastei X", "recebi Y"), use "TRANSACTION". Se não houver data explícita, use hoje: ${new Date().toISOString().split('T')[0]}.
      - Se a intenção for excluir/apagar um lançamento ("exclui X", "deleta Y"), use "DELETE". Preencha "deleteFilters".
      - Se a intenção for marcar uma conta/despesa como paga ("paguei X", "liquida Y"), use "PAY". Preencha "payFilters".
      - Se for consulta de dados ("saldo", "gastos do mês"), use "QUERY".
      - Se for conversa casual, use "CHAT".
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
      const operations = analysis.operations || [];

      if (operations.length === 0) {
        return res.status(200).json({ status: 'no_operations_detected' });
      }

      const immediateOps = operations.filter((op: any) => op.intent === 'QUERY' || op.intent === 'CHAT');
      const writeOps = operations.filter((op: any) => op.intent === 'TRANSACTION' || op.intent === 'DELETE' || op.intent === 'PAY');

      // Process immediate operations
      for (const op of immediateOps) {
        if (op.intent === 'QUERY') {
          await sendWhatsApp(phone, `📊 *Analisando seus dados financeiros em tempo real...*`);
          await handleInteractiveFinancialQuery(userId, text, phone, history);
        } else if (op.intent === 'CHAT') {
          const systemPromptChat = `
          Você é a FinVision AI, a Assistente Financeira Premium do software FinVision Pro.
          Seu tom de voz deve ser de especialista, extremamente educado, curto e sucinto. Use emojis úteis.
          Use formatações em negrito do WhatsApp (*texto*).
          Seja amigável e utilize o histórico da conversa para responder de forma contínua e natural.
          `;

          const chatContents = history.map((h: any) => ({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.content }]
          }));

          const chatResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: chatContents,
            config: {
              systemInstruction: systemPromptChat,
              temperature: 0.7,
            }
          });

          const chatReply = (chatResponse as any).text || (chatResponse as any).candidates?.[0]?.content?.parts?.[0]?.text || op.chatReply || 'Olá! Sou a FinVision AI. Como posso te ajudar com suas finanças hoje?';
          await sendWhatsApp(phone, chatReply);

          // Salvar a resposta no histórico de chat
          history.push({ role: 'model', content: chatReply });
          await supabase.from('whatsapp_chat_sessions').upsert({
            phone: phone,
            messages: history,
            updated_at: new Date().toISOString()
          }, { onConflict: 'phone' });
        }
      }

      // If there are no write operations, we are done
      if (writeOps.length === 0) {
        return res.status(200).json({ status: 'immediate_operations_processed' });
      }

      // Exact 1 write operation
      if (writeOps.length === 1) {
        const op = writeOps[0];

        if (op.intent === 'TRANSACTION') {
          const tx = op.transaction;
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

        if (op.intent === 'DELETE') {
          const filters = op.deleteFilters || {};
          const matches = await findMatchingTransactions(userId, filters, false);

          if (matches.length === 0) {
            await sendWhatsApp(phone, `❌ *Não encontrei nenhum lançamento recente correspondente* para exclusão.`);
            return res.status(200).json({ status: 'delete_no_match' });
          }

          if (matches.length === 1) {
            const matchedTx = matches[0];
            await supabase.from('whatsapp_drafts').insert({
              user_id: userId,
              phone: phone,
              data: {
                type: 'delete',
                transactionId: matchedTx.id,
                description: matchedTx.description,
                amount: matchedTx.amount,
                date: matchedTx.date
              },
              status: 'pending'
            });

            const dateFmt = matchedTx.date ? matchedTx.date.split('T')[0].split('-').reverse().join('/') : '';
            await sendWhatsApp(phone, `📝 *Confirmação de Exclusão!* 🗑️\n\nEncontrei o lançamento:\n*Descrição:* ${matchedTx.description}\n*Valor:* R$ ${Number(matchedTx.amount).toFixed(2)}\n*Data:* ${dateFmt}\n\nConfirma a exclusão deste lançamento? Digite *SIM* ou *NÃO*.`);
            return res.status(200).json({ status: 'delete_draft_created' });
          }

          // Multiple matches -> Disambiguation
          await supabase.from('whatsapp_drafts').insert({
            user_id: userId,
            phone: phone,
            data: {
              type: 'delete_disambiguation',
              candidates: matches.map(m => ({ id: m.id, description: m.description, amount: m.amount, date: m.date }))
            },
            status: 'pending'
          });

          let listMsg = `🔍 *Encontrei múltiplos lançamentos parecidos.* Qual deseja excluir? Digite o número:\n\n`;
          matches.forEach((m, idx) => {
            const dateFmt = m.date ? m.date.split('T')[0].split('-').reverse().join('/') : '';
            listMsg += `*${idx + 1}.* ${m.description} - R$ ${Number(m.amount).toFixed(2)} (${dateFmt})\n`;
          });
          listMsg += `\nDigite *CANCELAR* para desistir.`;

          await sendWhatsApp(phone, listMsg);
          return res.status(200).json({ status: 'delete_disambiguation' });
        }

        if (op.intent === 'PAY') {
          const filters = op.payFilters || {};
          const matches = await findMatchingTransactions(userId, filters, true);

          if (matches.length === 0) {
            await sendWhatsApp(phone, `❌ *Não encontrei nenhuma conta pendente correspondente* para marcar como paga.`);
            return res.status(200).json({ status: 'pay_no_match' });
          }

          if (matches.length === 1) {
            const matchedTx = matches[0];
            await supabase.from('whatsapp_drafts').insert({
              user_id: userId,
              phone: phone,
              data: {
                type: 'pay',
                transactionId: matchedTx.id,
                description: matchedTx.description,
                amount: matchedTx.amount,
                date: matchedTx.date
              },
              status: 'pending'
            });

            const dateFmt = matchedTx.date ? matchedTx.date.split('T')[0].split('-').reverse().join('/') : '';
            await sendWhatsApp(phone, `📝 *Confirmação de Pagamento!* 💵\n\nEncontrei a conta pendente:\n*Descrição:* ${matchedTx.description}\n*Valor:* R$ ${Number(matchedTx.amount).toFixed(2)}\n*Vencimento:* ${dateFmt}\n\nConfirma o pagamento desta conta? Digite *SIM* ou *NÃO*.`);
            return res.status(200).json({ status: 'pay_draft_created' });
          }

          // Multiple matches -> Disambiguation
          await supabase.from('whatsapp_drafts').insert({
            user_id: userId,
            phone: phone,
            data: {
              type: 'pay_disambiguation',
              candidates: matches.map(m => ({ id: m.id, description: m.description, amount: m.amount, date: m.date }))
            },
            status: 'pending'
          });

          let listMsg = `🔍 *Encontrei múltiplas contas pendentes parecidas.* Qual deseja marcar como paga? Digite o número:\n\n`;
          matches.forEach((m, idx) => {
            const dateFmt = m.date ? m.date.split('T')[0].split('-').reverse().join('/') : '';
            listMsg += `*${idx + 1}.* ${m.description} - R$ ${Number(m.amount).toFixed(2)} (${dateFmt})\n`;
          });
          listMsg += `\nDigite *CANCELAR* para desistir.`;

          await sendWhatsApp(phone, listMsg);
          return res.status(200).json({ status: 'pay_disambiguation' });
        }
      }

      // If there are multiple write operations
      if (writeOps.length > 1) {
        const resolvedOps = [];
        const disambigOps = [];

        for (const op of writeOps) {
          if (op.intent === 'TRANSACTION') {
            resolvedOps.push({
              intent: 'TRANSACTION',
              transaction: op.transaction
            });
          } else if (op.intent === 'DELETE') {
            const filters = op.deleteFilters || {};
            const matches = await findMatchingTransactions(userId, filters, false);
            if (matches.length === 0) {
              await sendWhatsApp(phone, `⚠️ *Não encontrei correspondência para excluir:* "${filters.description || ''}"`);
            } else if (matches.length === 1) {
              resolvedOps.push({
                intent: 'DELETE',
                transactionId: matches[0].id,
                description: matches[0].description,
                amount: matches[0].amount,
                date: matches[0].date
              });
            } else {
              disambigOps.push({ op, matches });
            }
          } else if (op.intent === 'PAY') {
            const filters = op.payFilters || {};
            const matches = await findMatchingTransactions(userId, filters, true);
            if (matches.length === 0) {
              await sendWhatsApp(phone, `⚠️ *Não encontrei conta pendente correspondente para pagar:* "${filters.description || ''}"`);
            } else if (matches.length === 1) {
              resolvedOps.push({
                intent: 'PAY',
                transactionId: matches[0].id,
                description: matches[0].description,
                amount: matches[0].amount,
                date: matches[0].date
              });
            } else {
              disambigOps.push({ op, matches });
            }
          }
        }

        // Halt if disambiguation is required
        if (disambigOps.length > 0) {
          const firstDisambig = disambigOps[0];
          const matches = firstDisambig.matches;
          const isPay = firstDisambig.op.intent === 'PAY';

          await supabase.from('whatsapp_drafts').insert({
            user_id: userId,
            phone: phone,
            data: {
              type: isPay ? 'pay_disambiguation' : 'delete_disambiguation',
              candidates: matches.map(m => ({ id: m.id, description: m.description, amount: m.amount, date: m.date }))
            },
            status: 'pending'
          });

          let listMsg = `🔍 *Há múltiplas correspondências para uma das ações.* Qual você deseja escolher? Digite o número:\n\n`;
          matches.forEach((m, idx) => {
            const dateFmt = m.date ? m.date.split('T')[0].split('-').reverse().join('/') : '';
            listMsg += `*${idx + 1}.* ${m.description} - R$ ${Number(m.amount).toFixed(2)} (${dateFmt})\n`;
          });
          listMsg += `\nDigite *CANCELAR* para desistir.`;

          await sendWhatsApp(phone, listMsg);
          return res.status(200).json({ status: 'multi_disambiguation_halted' });
        }

        // If all write operations are successfully resolved
        if (resolvedOps.length > 0) {
          await supabase.from('whatsapp_drafts').insert({
            user_id: userId,
            phone: phone,
            data: {
              type: 'multi',
              operations: resolvedOps
            },
            status: 'pending'
          });

          let summaryMsg = `📝 *Lote de Operações Criado via IA!* 🤖\n\nEntendi que deseja executar as seguintes ações:\n\n`;
          resolvedOps.forEach((op, idx) => {
            if (op.intent === 'TRANSACTION') {
              summaryMsg += `*${idx + 1}. Cadastrar:* "${op.transaction.description}" - R$ ${Number(op.transaction.amount).toFixed(2)}\n`;
            } else if (op.intent === 'DELETE') {
              summaryMsg += `*${idx + 1}. Excluir:* "${op.description}" - R$ ${Number(op.amount).toFixed(2)}\n`;
            } else if (op.intent === 'PAY') {
              summaryMsg += `*${idx + 1}. Marcar Paga:* "${op.description}" - R$ ${Number(op.amount).toFixed(2)}\n`;
            }
          });
          summaryMsg += `\nConfirma a execução de todas as operações acima? Digite *SIM* ou *NÃO*.`;

          await sendWhatsApp(phone, summaryMsg);
          return res.status(200).json({ status: 'multi_draft_created' });
        }
      }
    }

    return res.status(200).json({ status: 'no_action' });
  } catch (err: any) {
    console.error('Error handling whatsapp webhook:', err);
    return res.status(500).json({ error: err.message });
  }
}
