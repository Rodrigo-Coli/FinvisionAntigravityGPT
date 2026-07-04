import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Cache global em memória para otimizar tempo de resposta (reaproveitado entre execuções mornas da Vercel)
let cachedAllSettings: any[] | null = null;
let cachedSettingsTimestamp = 0;

interface CachedUserLists {
  timestamp: number;
  accountsPromptList: string;
  cardsPromptList: string;
  categoriesPromptList: string;
  subcategoriesPromptList: string;
  entitiesPromptList: string;
  rawEntities: string[];
}
const userListsCache = new Map<string, CachedUserLists>();

interface CachedPendingBills {
  timestamp: number;
  formattedPendingBills: string;
}
const pendingBillsCache = new Map<string, CachedPendingBills>();

// Cache da última ação de pagamento para suporte ao "desfazer"
const lastPayActionCache = new Map<string, { transactionId: string; description: string; amount: number; accountId: string | null; timestamp: number }>();

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => Array(n + 1).fill(0).map((_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

async function sendReaction(messageKey: any, emoji: string) {
  if (!process.env.EVOLUTION_API_URL || !process.env.EVOLUTION_API_KEY || !process.env.EVOLUTION_INSTANCE) return;
  const cleanBaseUrl = process.env.EVOLUTION_API_URL.endsWith('/') ? process.env.EVOLUTION_API_URL.slice(0, -1) : process.env.EVOLUTION_API_URL;
  try {
    await fetch(`${cleanBaseUrl}/message/sendReaction/${process.env.EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': process.env.EVOLUTION_API_KEY as string },
      body: JSON.stringify({ key: messageKey, reaction: emoji })
    });
  } catch (err) {
    console.error('[sendReaction] Erro:', err);
  }
}

const HELP_MESSAGE = `🤖 *FinVision AI — O que posso fazer por você:*

💳 *Lançar Gastos e Receitas*
• "Gastei 50 no mercado no Nubank"
• "Recebi 2000 de salário"
• "Transferi 500 do Itaú para o Bradesco"
• Envie uma *foto* do cupom ou nota fiscal
• Envie um *áudio* descrevendo o gasto

📋 *Gerenciar Contas a Pagar*
• "Paguei o IPTV hoje pelo Nubank"
• "Quita a conta da energia"
• "Baixa a fatura do cartão Bradesco"

🔄 *Editar e Excluir*
• "Muda o valor do mercado para 80"
• "Altera a categoria para lazer"
• "Exclui o lançamento do posto"
• "Desfazer" — desfaz a última ação

🔍 *Consultas*
• "Qual meu saldo?"
• "Quanto gastei este mês?"
• "Mostra meus gastos de alimentação"
• "Qual meu patrimônio líquido?"

💡 *Dica:* Responda *citando* qualquer mensagem minha para operar sobre aquele lançamento específico!`;

async function getUserLists(userId: string): Promise<CachedUserLists> {
  const nowTime = Date.now();
  const cached = userListsCache.get(userId);
  if (cached && (nowTime - cached.timestamp < 300000)) {
    return cached;
  }

  const [accountsRes, cardsRes, categoriesRes, subcategoriesRes, entitiesRes] = await Promise.all([
    supabase.from('accounts').select('institution').eq('user_id', userId).eq('is_archived', false),
    supabase.from('cards').select('name').eq('user_id', userId).eq('is_archived', false),
    supabase.from('categories').select('id, name').eq('user_id', userId),
    supabase.from('subcategories').select('name, category_id').eq('user_id', userId),
    supabase.from('entities').select('name').eq('user_id', userId).eq('is_archived', false)
  ]);

  const availableAccounts = (accountsRes.data || []).map(a => a.institution);
  const availableCards = (cardsRes.data || []).map(c => c.name);
  const availableCategories = (categoriesRes.data || []).map(c => c.name);
  const availableSubcategories = (subcategoriesRes.data || []).map(s => {
    const cat = (categoriesRes.data || []).find(c => c.id === s.category_id);
    return cat ? `${cat.name} > ${s.name}` : s.name;
  });
  const availableEntities = (entitiesRes.data || []).map(e => e.name);

  const accountsPromptList = availableAccounts.length > 0 ? availableAccounts.join(', ') : 'Nenhuma cadastrada';
  const cardsPromptList = availableCards.length > 0 ? availableCards.join(', ') : 'Nenhum cadastrado';
  const categoriesPromptList = availableCategories.length > 0 ? availableCategories.join(', ') : 'Alimentação, Transporte, Lazer, Moradia, Saúde, Outros';
  const subcategoriesPromptList = availableSubcategories.length > 0 ? availableSubcategories.join(', ') : 'Nenhuma cadastrada';
  const entitiesPromptList = availableEntities.length > 0 ? availableEntities.join(', ') : 'Pessoal';

  const data: CachedUserLists = {
    timestamp: nowTime,
    accountsPromptList,
    cardsPromptList,
    categoriesPromptList,
    subcategoriesPromptList,
    entitiesPromptList,
    rawEntities: availableEntities
  };

  userListsCache.set(userId, data);
  return data;
}

async function resolveOwnerName(userId: string, parsedOwner: string | null | undefined): Promise<string> {
  if (!parsedOwner) return 'Pessoal';
  
  const cleanParsed = parsedOwner.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (cleanParsed === 'pessoal' || cleanParsed === 'default') return 'Pessoal';

  const userLists = await getUserLists(userId);
  const entities = userLists.rawEntities;

  // 1. Exact match (case insensitive and normalized)
  const exactMatch = entities.find(e => 
    e.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === cleanParsed
  );
  if (exactMatch) return exactMatch;

  // 2. Substring match
  const substringMatch = entities.find(e => {
    const cleanE = e.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return cleanParsed.includes(cleanE) || cleanE.includes(cleanParsed);
  });
  if (substringMatch) return substringMatch;

  // 3. Word intersection match
  const parsedWords = cleanParsed.split(/\s+/).filter(w => w.length > 1);
  for (const entity of entities) {
    const cleanE = entity.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const entityWords = cleanE.split(/\s+/).filter(w => w.length > 1);
    const hasOverlap = parsedWords.some(pw => entityWords.includes(pw));
    if (hasOverlap) return entity;
  }

  return 'Pessoal';
}

const COMPETITOR_RESTRICTION_PROMPT = `Você é a FinVision AI, exclusiva do FinVision Pro. Você está expressamente proibida de responder perguntas sobre concorrentes do mercado financeiro (ex: Mobills, Organizze, Olivia, Minhas Economias, Guiabolso) ou qualquer assunto não relacionado diretamente ao sistema FinVision. Se o usuário perguntar sobre concorrentes ou fizer comparações, recuse educadamente, explicando que seu foco é exclusivamente ajudar a gerenciar as finanças e analisar os dados dentro do FinVision Pro.`;

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
            delay: 200,
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
function extractMessageContent(msg: any): { text: string; media: any; mediaType: 'image' | 'audio' | 'document' | null; mimeType: string | null } {
  const content = msg?.message;
  if (!content) return { text: '', media: null, mediaType: null, mimeType: null };

  // Recursive search for specific media keys
  function findKeyRecursively(obj: any, keyName: string): any {
    if (!obj || typeof obj !== 'object') return null;
    if (obj[keyName]) return obj[keyName];
    for (const key of Object.keys(obj)) {
      const res = findKeyRecursively(obj[key], keyName);
      if (res) return res;
    }
    return null;
  }

  const imageMessage = findKeyRecursively(content, 'imageMessage');
  const audioMessage = findKeyRecursively(content, 'audioMessage');
  const documentMessage = findKeyRecursively(content, 'documentMessage');

  let text = '';
  if (content.conversation) {
    text = content.conversation;
  } else if (content.extendedTextMessage?.text) {
    text = content.extendedTextMessage.text;
  } else if (imageMessage?.caption) {
    text = imageMessage.caption;
  } else if (documentMessage?.caption) {
    text = documentMessage.caption;
  }

  if (imageMessage) {
    return { text, media: imageMessage, mediaType: 'image', mimeType: imageMessage.mimetype };
  }
  if (audioMessage) {
    return { text, media: audioMessage, mediaType: 'audio', mimeType: audioMessage.mimetype };
  }
  if (documentMessage) {
    return { text, media: documentMessage, mediaType: 'document', mimeType: documentMessage.mimetype };
  }

  // Fallback for wrapped messages (e.g. ephemeralMessage, viewOnceMessage, etc.) that might contain text/media
  let innerText = '';
  if (content.ephemeralMessage?.message) {
    const inner = extractMessageContent({ message: content.ephemeralMessage.message });
    if (inner.media) return inner;
    innerText = inner.text;
  } else if (content.viewOnceMessage?.message) {
    const inner = extractMessageContent({ message: content.viewOnceMessage.message });
    if (inner.media) return inner;
    innerText = inner.text;
  } else if (content.viewOnceMessageV2?.message) {
    const inner = extractMessageContent({ message: content.viewOnceMessageV2.message });
    if (inner.media) return inner;
    innerText = inner.text;
  } else if (content.documentWithCaptionMessage?.message) {
    const inner = extractMessageContent({ message: content.documentWithCaptionMessage.message });
    if (inner.media) return inner;
    innerText = inner.text;
  }

  return { text: text || innerText, media: null, mediaType: null, mimeType: null };
}

async function downloadEvolutionMedia(message: any): Promise<{ base64: string; mimeType: string } | null> {
  if (!process.env.EVOLUTION_API_URL || !process.env.EVOLUTION_API_KEY || !process.env.EVOLUTION_INSTANCE) {
    return null;
  }

  const extracted = extractMessageContent(message);
  const mimeType = extracted.mimeType || 'application/octet-stream';
  const mediaObj = extracted.media;

  const cleanBaseUrl = process.env.EVOLUTION_API_URL.endsWith('/') 
    ? process.env.EVOLUTION_API_URL.slice(0, -1) 
    : process.env.EVOLUTION_API_URL;

  // 1. Tentar o endpoint oficial /chat/getBase64FromMediaMessage/{instance} (Mais estável e descriptografa no servidor)
  const base64Url = `${cleanBaseUrl}/chat/getBase64FromMediaMessage/${process.env.EVOLUTION_INSTANCE}`;
  console.log('[downloadEvolutionMedia] Tentando endpoint /chat/getBase64FromMediaMessage...');
  try {
    const res = await fetch(base64Url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.EVOLUTION_API_KEY as string
      },
      body: JSON.stringify({
        message: {
          key: {
            id: message.key.id
          }
        }
      })
    });
    
    if (res.ok) {
      const json = await res.json();
      let base64 = json.base64 || json.data || '';
      if (base64) {
        if (base64.includes(';base64,')) {
          base64 = base64.split(';base64,')[1];
        }
        console.log('[downloadEvolutionMedia] Sucesso com getBase64FromMediaMessage!');
        return { base64, mimeType };
      }
    } else {
      const errText = await res.text().catch(() => '');
      console.warn(`[downloadEvolutionMedia] getBase64FromMediaMessage retornou status ${res.status}: ${errText}`);
    }
  } catch (err) {
    console.error('[downloadEvolutionMedia] Erro no /chat/getBase64FromMediaMessage:', err);
  }

  // 2. Se houver uma URL direta pública de S3/Local (que NÃO seja do whatsapp.net e NÃO seja criptografada .enc)
  const isDirectDecryptedUrl = mediaObj?.url && mediaObj.url.startsWith('http') && !mediaObj.url.includes('whatsapp.net') && !mediaObj.url.includes('.enc');
  if (isDirectDecryptedUrl) {
    console.log('[downloadEvolutionMedia] Encontrada URL direta pública e descriptografada:', mediaObj.url);
    try {
      const res = await fetch(mediaObj.url);
      if (res.ok) {
        const buffer = await res.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        return { base64, mimeType };
      }
    } catch (err) {
      console.error('[downloadEvolutionMedia] Erro ao baixar da URL direta pública:', err);
    }
  }

  // 3. Tentar endpoint /message/downloadMedia com FORMATO A (Root level key/message)
  const downloadUrl = `${cleanBaseUrl}/message/downloadMedia/${process.env.EVOLUTION_INSTANCE}`;
  console.log('[downloadEvolutionMedia] Tentando /message/downloadMedia com Formato A...');
  try {
    const res = await fetch(downloadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.EVOLUTION_API_KEY as string
      },
      body: JSON.stringify({
        key: message.key,
        message: message.message
      })
    });
    
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      let base64 = '';
      if (contentType.includes('application/json')) {
        const json = await res.json();
        base64 = json.base64 || json.data || '';
      } else {
        const buffer = await res.arrayBuffer();
        base64 = Buffer.from(buffer).toString('base64');
      }
      if (base64) {
        if (base64.includes(';base64,')) {
          base64 = base64.split(';base64,')[1];
        }
        return { base64, mimeType };
      }
    } else {
      const errText = await res.text().catch(() => '');
      console.warn(`[downloadEvolutionMedia] Formato A retornou status ${res.status}: ${errText}`);
    }
  } catch (err) {
    console.error('[downloadEvolutionMedia] Erro no /message/downloadMedia Formato A:', err);
  }

  // 4. Tentar endpoint /message/downloadMedia com FORMATO B (Nested message object)
  console.log('[downloadEvolutionMedia] Tentando /message/downloadMedia com Formato B...');
  try {
    const res = await fetch(downloadUrl, {
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
    
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      let base64 = '';
      if (contentType.includes('application/json')) {
        const json = await res.json();
        base64 = json.base64 || json.data || '';
      } else {
        const buffer = await res.arrayBuffer();
        base64 = Buffer.from(buffer).toString('base64');
      }
      if (base64) {
        if (base64.includes(';base64,')) {
          base64 = base64.split(';base64,')[1];
        }
        return { base64, mimeType };
      }
    } else {
      const errText = await res.text().catch(() => '');
      console.warn(`[downloadEvolutionMedia] Formato B retornou status ${res.status}: ${errText}`);
    }
  } catch (err) {
    console.error('[downloadEvolutionMedia] Erro no /message/downloadMedia Formato B:', err);
  }

  // 5. Tentar endpoint /s3/getMedia
  const getMediaUrl = `${cleanBaseUrl}/s3/getMedia/${process.env.EVOLUTION_INSTANCE}`;
  console.log('[downloadEvolutionMedia] Tentando fallback para /s3/getMedia...');
  try {
    const res = await fetch(getMediaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.EVOLUTION_API_KEY as string
      },
      body: JSON.stringify({
        messageId: message.key.id,
        remoteJid: message.key.remoteJid,
        fromMe: message.key.fromMe || false
      })
    });

    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      let base64 = '';
      if (contentType.includes('application/json')) {
        const json = await res.json();
        base64 = json.base64 || json.data || '';
      } else {
        const buffer = await res.arrayBuffer();
        base64 = Buffer.from(buffer).toString('base64');
      }
      if (base64) {
        if (base64.includes(';base64,')) {
          base64 = base64.split(';base64,')[1];
        }
        return { base64, mimeType };
      }
    } else {
      const errText = await res.text().catch(() => '');
      console.error(`[downloadEvolutionMedia] Fallback /s3/getMedia falhou com status ${res.status}: ${errText}`);
    }
  } catch (err) {
    console.error('[downloadEvolutionMedia] Erro no fallback /s3/getMedia:', err);
  }

  return null;
}

function formatDraftConfirmation(tx: any, isUpdate: boolean = false): string {
  const dateFmt = tx.date ? tx.date.split('-').reverse().join('/') : '';
  const isTransfer = tx.category?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('transfer') || tx.type === 'TRANSFER';

  if (isTransfer) {
    let text = `🔄 *Confirmar Transferência!* 🤖\n\n`;
    text += `*Descrição:* ${tx.description || '⚠️ _[Não informada - Diga o que é]_'}\n`;
    text += `*Valor:* R$ ${tx.amount !== undefined && tx.amount !== null ? Number(tx.amount).toFixed(2) : '⚠️ _[Não informado - Diga o valor]_'}\n`;
    text += `*Categoria:* ${tx.category || 'transferência'}\n`;
    if (tx.subcategory) {
      text += `*Subcategoria:* ${tx.subcategory}\n`;
    }
    text += `*Data:* ${dateFmt || '⚠️ _[Não informada]_'}\n`;
    text += `*Banco Origem:* ${tx.account_name || '⚠️ _[Não informado - Diga de qual banco debitar (ex: "é do Itaú")]_'}\n`;
    text += `*Banco Destino:* ${tx.destination_account_name || '⚠️ _[Não informado - Diga o banco de destino (ex: "destino Bradesco")]_'}\n`;
    
    if (tx.owner_name) {
      text += `*Perfil:* ${tx.owner_name}\n`;
    }
    if (tx.notes) {
      text += `*Observações:* ${tx.notes}\n`;
    }
    if (tx.tags && tx.tags.length > 0) {
      text += `*Tags:* ${tx.tags.join(', ')}\n`;
    }

    text += `\nConfirma o lançamento? Digite *SIM* ou *NÃO*.\n\n`;
    text += `💡 *Dica:* Se faltar alguma informação ou quiser mudar algo, basta me dizer (ex: *"destino Itaú"*, *"mudar valor para 40"*) antes de confirmar!`;
    return text;
  }

  const isExpense = tx.type === 'EXPENSE';
  const titleEmoji = isExpense ? '💳' : '💰';
  const titleText = isExpense 
    ? (isUpdate ? 'Confirmar Gasto Atualizado!' : 'Confirmar Novo Gasto!') 
    : (isUpdate ? 'Confirmar Receita Atualizada!' : 'Confirmar Nova Receita!');

  let text = `${titleEmoji} *${titleText}* 🤖\n\n`;
  text += `*Descrição:* ${tx.description || '⚠️ _[Não informada - Diga o que é]_'}\n`;
  text += `*Valor:* R$ ${tx.amount !== undefined && tx.amount !== null ? Number(tx.amount).toFixed(2) : '⚠️ _[Não informado - Diga o valor]_'}\n`;
  text += `*Categoria:* ${tx.category || 'Outros'}\n`;
  
  if (tx.subcategory) {
    text += `*Subcategoria:* ${tx.subcategory}\n`;
  } else {
    text += `*Subcategoria:* _[Não informada (opcional)]_\n`;
  }
  
  text += `*Data:* ${dateFmt || '⚠️ _[Não informada]_'}\n`;

  if (tx.is_card) {
    text += `*Cartão:* ${tx.card_name || 'Sim'}\n`;
  } else {
    if (tx.account_name) {
      text += `*Banco/Conta:* ${tx.account_name}\n`;
    } else {
      text += `⚠️ *Banco/Conta:* _[Não informado - Diga de qual banco debitar (ex: Nubank, Itaú)]_\n`;
    }
  }

  if (tx.owner_name) {
    text += `*Perfil:* ${tx.owner_name}\n`;
  }
  if (tx.notes) {
    text += `*Observações:* ${tx.notes}\n`;
  }
  if (tx.tags && tx.tags.length > 0) {
    text += `*Tags:* ${tx.tags.join(', ')}\n`;
  }
  if (tx.is_recurring) {
    text += `*Recorrência:* ${tx.recurrence_period || 'mensal'}\n`;
  }

  text += `\nConfirma o lançamento? Digite *SIM* ou *NÃO*.\n\n`;
  text += `💡 *Dica:* Se faltar alguma informação ou quiser mudar algo, basta me dizer (ex: *"é no Itaú"*, *"sub restaurante"*, *"mudar valor para 40"*) antes de confirmar!`;

  return text;
}

async function getLastLaunchedTransaction(userId: string): Promise<{ id: string; description: string; amount: number; date: string; isCard: boolean } | null> {
  const [normalRes, cardRes] = await Promise.all([
    supabase.from('transactions')
      .select('id, description, amount, date, created_at')
      .eq('user_id', userId)
      .is('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('card_transactions')
      .select('id, description, amount, date, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  const normalTx = normalRes.data;
  const cardTx = cardRes.data;

  if (!normalTx && !cardTx) return null;
  if (normalTx && !cardTx) {
    return { id: normalTx.id, description: normalTx.description, amount: Number(normalTx.amount), date: normalTx.date.split('T')[0], isCard: false };
  }
  if (!normalTx && cardTx) {
    return { id: cardTx.id, description: cardTx.description, amount: Number(cardTx.amount), date: cardTx.date, isCard: true };
  }

  if (normalTx && cardTx) {
    const normalTime = new Date(normalTx.created_at).getTime();
    const cardTime = new Date(cardTx.created_at).getTime();

    if (normalTime >= cardTime) {
      return { id: normalTx.id, description: normalTx.description, amount: Number(normalTx.amount), date: normalTx.date.split('T')[0], isCard: false };
    } else {
      return { id: cardTx.id, description: cardTx.description, amount: Number(cardTx.amount), date: cardTx.date, isCard: true };
    }
  }

  return null;
}

interface QuotedTransaction {
  description: string | null;
  amount: number | null;
  date: string | null;
}

function parseQuotedTransaction(message: any): QuotedTransaction | null {
  const contextInfo = message?.message?.extendedTextMessage?.contextInfo;
  if (!contextInfo?.quotedMessage) return null;

  const extractedQuoted = extractMessageContent({ message: contextInfo.quotedMessage });
  const text = extractedQuoted.text;
  if (!text) return null;

  const isConfirmation = text.includes('Cadastrado com Sucesso') || 
                          text.includes('Confirmado') || 
                          text.includes('Marcada como Paga') || 
                          text.includes('Excluído com Sucesso') ||
                          text.includes('Valor: R$') ||
                          text.includes('Descrição:');
  
  if (!isConfirmation) return null;

  const descMatch = text.match(/(?:Descrição|\*Descrição\*|\*Descrição:\*)\s*:\s*(.+)/i) || 
                    text.match(/(?:Descrição|\*Descrição\*|\*Descrição:\*)\s*(.+)/i);
  
  const amountMatch = text.match(/(?:Valor|\*Valor\*|\*Valor:\*)\s*:\s*(?:R\$\s*)?([\d,.]+)/i) || 
                      text.match(/(?:Valor|\*Valor\*|\*Valor:\*)\s*(?:R\$\s*)?([\d,.]+)/i);
  
  const dateMatch = text.match(/(?:Data|\*Data\*|\*Data:\*)\s*:\s*([\d/]+)/i) || 
                    text.match(/(?:Data|\*Data\*|\*Data:\*)\s*([\d/]+)/i);

  const description = descMatch ? descMatch[1].trim() : null;
  let amount = null;
  if (amountMatch) {
    const cleanAmountStr = amountMatch[1].replace(/\./g, '').replace(',', '.');
    amount = parseFloat(cleanAmountStr);
  }
  let date = null;
  if (dateMatch) {
    const parts = dateMatch[1].trim().split('/');
    if (parts.length === 3) {
      date = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }

  if (!description && !amount) return null;

  return { description, amount, date };
}

async function getLastLaunchedPendingTransaction(userId: string): Promise<{ id: string; description: string; amount: number; date: string; isCard: boolean } | null> {
  const { data } = await supabase.from('transactions')
    .select('id, description, amount, date, created_at')
    .eq('user_id', userId)
    .is('is_deleted', false)
    .eq('is_paid', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return { id: data.id, description: data.description, amount: Number(data.amount), date: data.date.split('T')[0], isCard: false };
}


function formatDirectLaunchSummary(tx: any, accountName: string, isCard: boolean): string {
  const dateFmt = tx.date ? tx.date.split('-').reverse().join('/') : '';
  const isTransfer = tx.category?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('transfer') || tx.type === 'TRANSFER';

  if (isTransfer) {
    let text = `✅ *Transferência Cadastrada com Sucesso!* 🔄 🤖\n\n`;
    text += `*Descrição:* ${tx.description}\n`;
    text += `*Valor:* R$ ${Number(tx.amount).toFixed(2)}\n`;
    text += `*Categoria:* ${tx.category || 'transferência'}\n`;
    if (tx.subcategory) {
      text += `*Subcategoria:* ${tx.subcategory}\n`;
    }
    text += `*Data:* ${dateFmt}\n`;
    text += `*Banco Origem:* ${accountName.split(' -> ')[0] || 'Conta Origem'}\n`;
    text += `*Banco Destino:* ${accountName.split(' -> ')[1] || 'Conta Destino'}\n`;
    text += `*Perfil:* ${tx.owner_name || 'Pessoal'}\n`;
    if (tx.notes) {
      text += `*Observações:* ${tx.notes}\n`;
    }
    text += `\n💡 *Dica:* Se quiser alterar ou excluir este lançamento, basta me responder marcando esta mensagem ou dizendo o que corrigir.`;
    return text;
  }

  const isExpense = tx.type === 'EXPENSE';
  const titleEmoji = isExpense ? '💳' : '💰';
  const titleText = isExpense ? 'Gasto Cadastrado com Sucesso!' : 'Receita Cadastrada com Sucesso!';

  let text = `✅ *${titleText}* ${titleEmoji} 🤖\n\n`;
  text += `*Descrição:* ${tx.description}\n`;
  text += `*Valor:* R$ ${Number(tx.amount).toFixed(2)}\n`;
  text += `*Categoria:* ${tx.category || 'Outros'}\n`;
  if (tx.subcategory) {
    text += `*Subcategoria:* ${tx.subcategory}\n`;
  }
  text += `*Data:* ${dateFmt}\n`;

  if (isCard) {
    text += `*Cartão:* ${accountName}\n`;
  } else {
    text += `*Banco/Conta:* ${accountName}\n`;
  }

  text += `*Perfil:* ${tx.owner_name || 'Pessoal'}\n`;

  if (tx.notes) {
    text += `*Observações:* ${tx.notes}\n`;
  }
  if (tx.tags && tx.tags.length > 0) {
    text += `*Tags:* ${tx.tags.join(', ')}\n`;
  }

  text += `\n💡 *Dica:* Se quiser alterar ou excluir este lançamento, basta me responder marcando esta mensagem ou dizendo o que corrigir (ex: *"altera a conta para Itaú"*, *"muda a categoria para Lazer"*, ou *"exclui este lançamento"*).`;
  return text;
}

async function findRecentDuplicate(userId: string, description: string, amount: number, date: string): Promise<{ id: string; description: string; amount: number } | null> {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const descNorm = description.toLowerCase().trim();
  const { data: recent } = await supabase
    .from('transactions')
    .select('id, description, amount, created_at')
    .eq('user_id', userId)
    .eq('date', date)
    .gte('created_at', fiveMinutesAgo)
    .is('is_deleted', false);
  if (!recent) return null;
  return recent.find(t => {
    const tDescNorm = (t.description || '').toLowerCase().trim();
    const sameAmount = Math.abs(Number(t.amount) - amount) < 0.01;
    const sameDesc = tDescNorm === descNorm || tDescNorm.includes(descNorm) || descNorm.includes(tDescNorm);
    return sameAmount && sameDesc;
  }) || null;
}

async function executeDirectLaunch(userId: string, tx: any): Promise<{ success: boolean; accountName: string; isCard: boolean; cardName?: string }> {
  const dateVal = tx.date || new Date().toISOString().split('T')[0];
  const resolvedOwner = await resolveOwnerName(userId, tx.owner_name);
  const ownerVal = resolvedOwner === 'Pessoal' ? null : resolvedOwner;

  // Smart Category Resolution
  let finalCategory = tx.category || 'Outros';
  let finalCategoryId = null;

  if (tx.category || tx.description) {
    const { data: allCats } = await supabase.from('categories').select('id, name').eq('user_id', userId);
    if (allCats && allCats.length > 0) {
      const normCat = (tx.category || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      const normDesc = (tx.description || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

      // 1. Direct match on category
      let matched = allCats.find(c => c.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() === normCat);

      // 2. Fuel rule: Posto, Combustível, Abastecer, Carro, Veículo
      if (!matched && (
        normCat.includes('transporte') ||
        normCat.includes('combust') ||
        normCat.includes('abastec') ||
        normCat.includes('posto') ||
        normCat.includes('carro') ||
        normCat.includes('veiculo') ||
        normDesc.includes('abastec') ||
        normDesc.includes('posto') ||
        normDesc.includes('combust') ||
        normDesc.includes('posto de comb')
      )) {
        matched = allCats.find(c => 
          c.name.toLowerCase().includes('carro') || 
          c.name.toLowerCase().includes('transporte') || 
          c.name.toLowerCase().includes('veiculo') ||
          c.name.toLowerCase().includes('combust')
        );
      }

      // 3. Food rule: Alimentação, Restaurante, Mercado, Supermercado
      if (!matched && (
        normCat.includes('alimenta') || 
        normCat.includes('comida') || 
        normCat.includes('restaurante') || 
        normCat.includes('mercado') || 
        normCat.includes('supermercado') ||
        normDesc.includes('mercado') ||
        normDesc.includes('supermercado') ||
        normDesc.includes('restaurante')
      )) {
        matched = allCats.find(c => 
          c.name.toLowerCase().includes('mercado') || 
          c.name.toLowerCase().includes('alimenta') ||
          c.name.toLowerCase().includes('refeic') ||
          c.name.toLowerCase().includes('comida')
        );
      }

      // 4. Fuzzy / substring match
      if (!matched && normCat) {
        matched = allCats.find(c => 
          c.name.toLowerCase().includes(normCat) || 
          normCat.includes(c.name.toLowerCase())
        );
      }

      if (matched) {
        finalCategoryId = matched.id;
        finalCategory = matched.name;
      }
    }
  }

  const isTransfer = (tx.category || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('transfer') || tx.type === 'TRANSFER';

  if (isTransfer) {
    const { data: userAccounts } = await supabase.from('accounts').select('id, institution').eq('user_id', userId).eq('is_archived', false);
    const { data: defaultAcc } = await supabase.from('accounts').select('id, institution').eq('user_id', userId).eq('is_archived', false).limit(1).maybeSingle();

    let finalAccountId = defaultAcc?.id || null;
    let finalAccountName = defaultAcc?.institution || 'Conta Origem';

    if (tx.account_name && userAccounts) {
      const matched = userAccounts.find(a => 
        a.institution.toLowerCase().includes(tx.account_name.toLowerCase()) ||
        tx.account_name.toLowerCase().includes(a.institution.toLowerCase())
      );
      if (matched) {
        finalAccountId = matched.id;
        finalAccountName = matched.institution;
      }
    }

    let finalDestAccountId = null;
    let finalDestAccountName = 'Conta Destino';

    if (tx.destination_account_name && userAccounts) {
      const matchedDest = userAccounts.find(a => 
        a.institution.toLowerCase().includes(tx.destination_account_name.toLowerCase()) ||
        tx.destination_account_name.toLowerCase().includes(a.institution.toLowerCase())
      );
      if (matchedDest) {
        finalDestAccountId = matchedDest.id;
        finalDestAccountName = matchedDest.institution;
      }
    }

    if (!finalDestAccountId && userAccounts) {
      const fallbackDest = userAccounts.find(a => a.id !== finalAccountId);
      if (fallbackDest) {
        finalDestAccountId = fallbackDest.id;
        finalDestAccountName = fallbackDest.institution;
      }
    }

    const descriptionVal = tx.description?.toLowerCase().includes('[transf]') ? tx.description : `[TRANSF] ${tx.description || 'Transferência'}`;

    // 1. Source Transaction (debit)
    await supabase.from('transactions').insert({
      user_id: userId,
      account_id: finalAccountId,
      description: descriptionVal,
      amount: tx.amount || 0,
      date: dateVal,
      type: 'TRANSFER',
      category: 'Transferência',
      subcategory: tx.subcategory || null,
      is_paid: true,
      owner_name: ownerVal,
      notes: tx.notes || '',
      tags: tx.tags || [],
      metadata: { is_transfer: true, transfer_side: 'SOURCE', counter_account_id: finalDestAccountId }
    });

    // 2. Destination Transaction (credit)
    if (finalDestAccountId) {
      await supabase.from('transactions').insert({
        user_id: userId,
        account_id: finalDestAccountId,
        description: descriptionVal,
        amount: tx.amount || 0,
        date: dateVal,
        type: 'TRANSFER',
        category: 'Transferência',
        subcategory: tx.subcategory || null,
        is_paid: true,
        owner_name: ownerVal,
        notes: tx.notes || '',
        tags: tx.tags || [],
        metadata: { is_transfer: true, transfer_side: 'DESTINATION', counter_account_id: finalAccountId }
      });
    }

    // Recalculate balances
    if (finalAccountId) await supabase.rpc('recalculate_account_balance', { p_account_id: finalAccountId });
    if (finalDestAccountId) await supabase.rpc('recalculate_account_balance', { p_account_id: finalDestAccountId });

    return { success: true, accountName: `${finalAccountName} -> ${finalDestAccountName}`, isCard: false };
  }

  if (tx.is_card || tx.card_id || tx.card_name) {
    const { data: cards } = await supabase.from('cards').select('*').eq('user_id', userId).eq('is_archived', false);
    let selectedCard = cards?.find(c => c.id === tx.card_id) || cards?.find(c => tx.card_name && c.name.toLowerCase().includes(tx.card_name.toLowerCase())) || cards?.[0];
    if (selectedCard) {
      const targetStmtId = await getOrCreateStatementHelper(userId, selectedCard.id, dateVal);
      await supabase.from('card_transactions').insert({
        user_id: userId,
        card_id: selectedCard.id,
        statement_id: targetStmtId || null,
        date: dateVal,
        description: tx.description || 'Gasto no Cartão',
        amount: Math.abs(tx.amount || 0),
        status: 'POSTED',
        source: 'MANUAL',
        is_manual: true,
        category_id: finalCategoryId,
        category: finalCategory,
        subcategory: tx.subcategory || null,
        owner_name: ownerVal,
        is_recurring: tx.is_recurring || false,
        recurrence_period: tx.recurrence_period || null,
        is_installment: tx.is_installment || false,
        installment_number: tx.installment_number || null,
        installment_total: tx.installment_total || null,
        notes: tx.notes || '',
        tags: tx.tags || []
      });
      return { success: true, accountName: selectedCard.name, isCard: true, cardName: selectedCard.name };
    }
  }

  const { data: userAccounts } = await supabase.from('accounts').select('id, institution').eq('user_id', userId).eq('is_archived', false);
  const { data: defaultAcc } = await supabase.from('accounts').select('id, institution').eq('user_id', userId).eq('is_archived', false).limit(1).maybeSingle();

  let finalAccountId = defaultAcc?.id || null;
  let finalAccountName = defaultAcc?.institution || 'Conta';

  if (tx.account_name && userAccounts) {
    const matched = userAccounts.find(a => 
      a.institution.toLowerCase().includes(tx.account_name.toLowerCase()) ||
      tx.account_name.toLowerCase().includes(a.institution.toLowerCase())
    );
    if (matched) {
      finalAccountId = matched.id;
      finalAccountName = matched.institution;
    }
  }

  await supabase.from('transactions').insert({
    user_id: userId,
    account_id: finalAccountId,
    description: tx.description || 'Lançamento',
    amount: tx.amount || 0,
    date: dateVal,
    type: tx.type || 'EXPENSE',
    category: finalCategory,
    category_id: finalCategoryId,
    subcategory: tx.subcategory || null,
    is_paid: tx.is_paid !== undefined ? tx.is_paid : true,
    owner_name: ownerVal,
    is_recurring: tx.is_recurring || false,
    recurrence_period: tx.recurrence_period || null,
    is_installment: tx.is_installment || false,
    installment_number: tx.installment_number || null,
    installment_total: tx.installment_total || null,
    notes: tx.notes || '',
    tags: tx.tags || []
  });

  return { success: true, accountName: finalAccountName, isCard: false };
}

async function handleInteractiveFinancialQuery(
  userId: string,
  queryText: string,
  phone: string,
  history: any[] = [],
  preExtractedDates?: { startDate?: string; endDate?: string; periodLabel?: string }
) {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;

  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  threeMonthsAgo.setDate(1);
  let historyStart = threeMonthsAgo.toISOString().split('T')[0];

  let targetStartDate = historyStart; // Por padrão, traz 90 dias
  let targetEndDate = todayStr;
  let customPeriodLabel = 'Últimos 90 dias';

  // Usar datas pré-extraídas se fornecidas pelo classificador principal
  if (preExtractedDates && preExtractedDates.startDate && preExtractedDates.endDate) {
    targetStartDate = preExtractedDates.startDate;
    targetEndDate = preExtractedDates.endDate;
    customPeriodLabel = preExtractedDates.periodLabel || 'Período personalizado';
    console.log(`[WhatsApp Query Period] Usando datas pré-extraídas pelo classificador: ${targetStartDate} a ${targetEndDate} (${customPeriodLabel})`);
  } else {
    // Chamada de extração de data inteligente usando Gemini
    if (geminiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiKey });
        
        const dateExtractionPrompt = `
        Você é a inteligência de processamento temporal do FinVision Pro.
        Hoje é ${now.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} (data do sistema: ${todayStr}).

        Analise a pergunta do usuário para identificar se ele está solicitando transações ou dados financeiros de um período temporal específico (ex: "lançamentos dos dois últimos meses", "gastos de janeiro", "ano passado", "mês passado", "últimos 6 meses", "desde março").
        Com base na análise, determine a data de início (startDate) e fim (endDate) adequada no formato YYYY-MM-DD.

        Regras importantes:
        1. Se o usuário pedir "últimos dois meses" ou "dois últimos meses", partindo de hoje (${todayStr}), o início deve retroceder 2 meses (ex: de 01/03/2026 até hoje).
        2. Se o usuário falar em "mês passado", calcule o início e fim exatos do mês anterior completo.
        3. Se o usuário NÃO especificar período nenhum ou se for uma pergunta geral de saldo, use como padrão de busca os últimos 90 dias (início: ${historyStart}, fim: ${todayStr}).
        4. Se o usuário pedir um período muito longo (ex: "histórico completo", "tudo", "desde o começo"), use os últimos 365 dias (1 ano).

        Mensagem do Usuário: "${queryText}"

        RETORNE ESTRITAMENTE UM OBJETO JSON COM O FORMATO:
        {
          "startDate": "YYYY-MM-DD",
          "endDate": "YYYY-MM-DD",
          "periodLabel": "Descrição do período em texto curto para o prompt (ex: 'Março a Maio de 2026' ou 'Janeiro de 2026')"
        }
        `;

        const dateResponse = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [{ text: dateExtractionPrompt }] }],
          config: {
            responseMimeType: "application/json"
          }
        });

        const dateRaw = (dateResponse as any).text || (dateResponse as any).candidates?.[0]?.content?.parts?.[0]?.text || '';
        const dateClean = dateRaw.replace(/```json|```/g, "").trim();
        const dateJson = JSON.parse(dateClean);
        
        if (dateJson.startDate && dateJson.endDate) {
          targetStartDate = dateJson.startDate;
          targetEndDate = dateJson.endDate;
          customPeriodLabel = dateJson.periodLabel || 'Período personalizado';
          console.log(`[WhatsApp Query Period] Período extraído dinamicamente: ${targetStartDate} a ${targetEndDate} (${customPeriodLabel})`);
        }
      } catch (err) {
        console.error('[WhatsApp Query Period] Erro ao extrair data inteligente, usando fallback:', err);
      }
    }
  }

  const [accountsRes, txRes, cardsRes, assetsRes, liabilitiesRes] = await Promise.all([
    supabase.from('accounts').select('id, institution, type, current_balance').eq('user_id', userId).eq('is_archived', false),
    supabase.from('transactions')
      .select('id, account_id, amount, type, category, subcategory, date, description, is_amortization, liability_id, is_paid, metadata')
      .eq('user_id', userId)
      .is('is_deleted', false)
      .neq('type', 'ADJUSTMENT')
      .gte('date', targetStartDate)
      .lte('date', targetEndDate)
      .order('date', { ascending: false })
      .limit(150),
    supabase.from('credit_cards').select('brand, limit').eq('user_id', userId),
    supabase.from('physical_assets').select('id, name, category, estimated_value').eq('user_id', userId),
    supabase.from('liabilities').select('id, name, type, total_amount, remaining_balance, installment_amount, installments_remaining, interest_rate, metadata').eq('user_id', userId)
  ]);

  const accounts = accountsRes.data || [];
  const transactions = txRes.data || [];
  const creditCards = cardsRes.data || [];
  const assetsData = assetsRes.data || [];
  const liabilitiesData = liabilitiesRes.data || [];

  const totalBalance = accounts.reduce((s: number, a: any) => s + Number(a.current_balance || 0), 0);
  const totalPhysicalAssets = assetsData.reduce((s: number, l: any) => s + Number(l.estimated_value || 0), 0);
  const totalDebt = liabilitiesData.reduce((s: number, l: any) => s + Number(l.remaining_balance || 0), 0);
  const netWorth = totalBalance + totalPhysicalAssets - totalDebt;

  let periodIncome = 0;
  let periodExpense = 0;
  const categorySummary: Record<string, number> = {};

  transactions.forEach((t: any) => {
    const amt = Math.abs(Number(t.amount) || 0);
    if (t.is_amortization) return; // skip amortizations from regular monthly totals
    if (t.type === 'INCOME') {
      periodIncome += amt;
    } else if (t.type === 'EXPENSE') {
      periodExpense += amt;
      categorySummary[t.category] = (categorySummary[t.category] || 0) + amt;
    }
  });

  const topCategories = Object.entries(categorySummary)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cat, val]) => `${cat}: R$ ${val.toFixed(2)}`)
    .join(' | ');

  const dataHoje = now.toLocaleDateString('pt-BR', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric'
  });

  // Construct detailed liabilities summary
  const liabilitiesSummary = liabilitiesData.map((l: any) => {
    const ir = l.interest_rate ? `juros ${l.interest_rate}% a.a.` : 'sem juros definidos';
    const propertyStatus = l.metadata?.propertyType ? `[Status Imóvel: ${l.metadata.propertyType}]` : '';
    const parcelas = l.installments_remaining 
      ? `${l.installments_remaining} parcelas de R$ ${Number(l.installment_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` 
      : 'sem parcelas mensais configuradas';
    
    // Extract balloons and down payments linked to this liability
    const linkedTxs = transactions.filter(t => t.liability_id === l.id);
    const atos = linkedTxs.filter(t => t.metadata?.type === 'DOWN_PAYMENT' || (t.description || '').toUpperCase().includes('ATO'));
    const baloes = linkedTxs.filter(t => t.metadata?.type === 'INTERMEDIARY' || (t.description || '').toUpperCase().includes('INTERMEDIÁRIA') || (t.description || '').toUpperCase().includes('BALÃO'));
    
    const atosSummary = atos.length > 0 
      ? `\n    └─ Entrada/Atos: ${atos.map(a => `${(a.description || '').split(' - ')[0]}: R$ ${Number(a.amount).toLocaleString('pt-BR')} (${a.is_paid ? 'PAGO' : 'PENDENTE'})`).join(', ')}`
      : '';
    const baloesSummary = baloes.length > 0 
      ? `\n    └─ Balões/Intermediárias: ${baloes.map(b => `${(b.description || '').split(' - ')[0]}: R$ ${Number(b.amount).toLocaleString('pt-BR')} (${b.is_paid ? 'PAGO' : 'PENDENTE'})`).join(', ')}`
      : '';
    
    return `${l.name} (${l.type}) ${propertyStatus}: Saldo Devedor R$ ${Number(l.remaining_balance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}, ${ir}, ${parcelas}${atosSummary}${baloesSummary}`;
  }).join('\n- ');

  const accountMap = new Map(accounts.map((a: any) => [a.id, a.institution]));

  const formattedTransactions = transactions.map((t: any) => {
    const dateFmt = t.date ? t.date.split('T')[0].split('-').reverse().join('/') : '';
    const categoryFmt = t.category + (t.subcategory ? ` > ${t.subcategory}` : '');
    const accountName = t.account_id ? (accountMap.get(t.account_id) || 'Conta') : 'Conta';
    const statusFmt = t.is_paid ? 'Pago' : 'Pendente';
    return `- ${dateFmt} | Descrição: "${t.description}" | R$ ${Number(t.amount).toFixed(2)} | Tipo: ${t.type} | Categoria: ${categoryFmt} | Conta: ${accountName} | Status: ${statusFmt}`;
  }).join('\n');

  const systemPrompt = `
# IDENTIDADE
Você é a FinVision AI, a Assistente Financeira Premium do software FinVision Pro.
Seu tom de voz deve ser de especialista, educado, curto e sucinto. Use emojis úteis (📊, 💼, 💸, 💰).

# REGRAS DO WHATSAPP
1. Limite sua resposta a no máximo 3 ou 4 parágrafos curtos.
2. Use formatações em negrito do WhatsApp (*texto*).
3. Nunca invente dados. Use as métricas reais fornecidas abaixo para responder à dúvida.
4. IMPORTANTÍSSIMO: Sempre que o usuário perguntar sobre transações, gastos ou lançamentos de contas ou cartões, verifique detalhadamente a lista de "TRANSAÇÕES DETALHADAS NO PERÍODO SOLICITADO" abaixo. Os termos pesquisados podem estar na *descrição*, *categoria* ou *subcategoria*. Responda de forma completa, detalhando os lançamentos correspondentes (com data, descrição, valor e status de pagamento).
5. RESTRIÇÃO IMPORTANTE DE CONCORRENTES: Você é a FinVision AI, exclusiva do FinVision Pro. Você está expressamente proibida de responder perguntas sobre concorrentes do mercado financeiro (ex: Mobills, Organizze, Olivia, Minhas Economias, Guiabolso) ou qualquer assunto não relacionado diretamente ao sistema FinVision. Se o usuário perguntar sobre concorrentes ou fizer comparações, recuse educadamente, explicando que seu foco é exclusivamente ajudar a gerenciar as finanças e analisar os dados dentro do FinVision Pro.


# DADOS DO USUÁRIO
Hoje é ${dataHoje}.
*Período Ativo da Consulta: ${customPeriodLabel} (de ${targetStartDate.split('-').reverse().join('/')} até ${targetEndDate.split('-').reverse().join('/')})*
• Saldo Consolidado: R$ ${totalBalance.toFixed(2)}
• Total de Entradas no Período: R$ ${periodIncome.toFixed(2)}
• Total de Saídas no Período: R$ ${periodExpense.toFixed(2)}
• Top Despesas do Período: ${topCategories || 'Nenhuma registrada'}
• Bens/Ativos: R$ ${totalPhysicalAssets.toFixed(2)}
• Dívidas (Passivos): R$ ${totalDebt.toFixed(2)}
• Patrimônio Líquido: R$ ${netWorth.toFixed(2)}
• Contas: ${accounts.map((a: any) => `${a.institution}(R$${Number(a.current_balance).toFixed(2)})`).join(', ')}
• Bens Detalhados: ${assetsData.map((a: any) => `${a.name}(R$${Number(a.estimated_value).toFixed(2)})`).join(', ')}
• Dívidas Detalhadas:
- ${liabilitiesSummary || 'Nenhuma registrada'}
• Cartões Cadastrados: ${creditCards.map((c: any) => `${c.brand}(Lim:R$${c.limit})`).join(', ') || 'Nenhum'}

# TRANSAÇÕES DETALHADAS NO PERÍODO SOLICITADO (Máximo 150 lançamentos, mais recentes primeiro):
${formattedTransactions || 'Nenhuma transação registrada neste período.'}
`;

  if (!geminiKey) throw new Error('GEMINI_API_KEY não configurada.');
  const ai = new GoogleGenAI({ apiKey: geminiKey });

  // Mapear o histórico para o formato do Gemini
  const contents = history.map(h => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: h.content }]
  }));

  // Adicionar a pergunta atual do usuário ao final do histórico enviado à API do Gemini
  contents.push({
    role: 'user',
    parts: [{ text: queryText }]
  });

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

  // Salvar a pergunta do usuário e a resposta no histórico de chat
  history.push({ role: 'user', content: queryText });
  history.push({ role: 'model', content: rawReply });
  await supabase.from('whatsapp_chat_sessions').upsert({
    phone: phone,
    messages: history,
    updated_at: new Date().toISOString()
  }, { onConflict: 'phone' });
}

async function findMatchingTransactions(userId: string, filters: { description?: string; amount?: number; date?: string }, isPay: boolean = false) {
  // Query both transactions and card_transactions if not isPay
  let txsQuery = supabase
    .from('transactions')
    .select('id, description, amount, date, is_paid, created_at')
    .eq('user_id', userId)
    .is('is_deleted', false);

  if (isPay) {
    txsQuery = txsQuery.eq('is_paid', false).eq('type', 'EXPENSE');
  }

  if (filters.date) {
    txsQuery = txsQuery.eq('date', filters.date.split('T')[0]);
  }

  const { data: txs, error: txsErr } = await txsQuery.order('date', { ascending: false }).limit(50);
  if (txsErr) console.error('Error fetching transactions:', txsErr);

  let combined: any[] = (txs || []).map(t => ({ ...t, is_card: false }));

  if (!isPay) {
    let cardQuery = supabase
      .from('card_transactions')
      .select('id, description, amount, date, created_at')
      .eq('user_id', userId);

    if (filters.date) {
      cardQuery = cardQuery.eq('date', filters.date.split('T')[0]);
    }

    const { data: cardTxs, error: cardErr } = await cardQuery.order('date', { ascending: false }).limit(50);
    if (cardErr) console.error('Error fetching card transactions:', cardErr);
    
    if (cardTxs && cardTxs.length > 0) {
      combined = [...combined, ...cardTxs.map(ct => ({ ...ct, is_card: true, is_paid: true }))];
    }
  }

  // Sort combined transactions by date descending, then by created_at descending
  combined.sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    if (dateA !== dateB) return dateB - dateA;
    const createA = new Date(a.created_at || 0).getTime();
    const createB = new Date(b.created_at || 0).getTime();
    return createB - createA;
  });

  const hasNoFilters = (!filters.description && (filters.amount === undefined || filters.amount === null));

  if (hasNoFilters) {
    // Check if there is any transaction created in the last 15 minutes
    const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
    const veryRecent = combined.find(t => new Date(t.created_at || 0).getTime() >= fifteenMinutesAgo);
    
    if (veryRecent) {
      console.log('[findMatchingTransactions] Found very recent transaction, prioritizing:', veryRecent.description);
      return [veryRecent];
    }
    
    // Otherwise, return only the single most recent transaction overall to avoid massive disambiguation lists
    if (combined.length > 0) {
      return [combined[0]];
    }
    return [];
  }

  // Apply in-memory filters
  const filtered = filterTransactionsInMemory(combined, filters);

  // Limit to max 5 matches for clean disambiguation
  return filtered.slice(0, 5);
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
      const exactMatch = txDesc.includes(targetDesc) || targetDesc.includes(txDesc);
      if (!exactMatch) {
        const targetWords = targetDesc.split(/\s+/).filter(w => w.length >= 3);
        const txWords = txDesc.split(/\s+/);
        const hasFuzzy = targetWords.some(tw =>
          txWords.some(xw => {
            const maxDist = tw.length >= 6 ? 2 : tw.length >= 4 ? 1 : 0;
            return levenshtein(tw, xw) <= maxDist;
          })
        );
        if (!hasFuzzy) matchesDesc = false;
      }
    }

    return matchesAmount && matchesDesc;
  });
}

export async function handleWhatsAppWebhook(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();
  const body = req.body || {};
  let phone = '';
  let userId: string = '';
  let message: any = null;
  
  const eventName = String(body.event || '').toLowerCase();
  if (eventName !== 'messages.upsert' && eventName !== 'messages_upsert') {
    return res.status(200).json({ status: 'ignored', receivedEvent: body.event });
  }

  try {
    console.log('[WhatsApp Webhook] Received body:', JSON.stringify(body));

    message = body.data;
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
    phone = remoteJid.split('@')[0];

    // Geração de variantes robusta para números brasileiros (com e sem o nono dígito)
    let userSet = null;

    // Buscar todas as configurações de usuário com WhatsApp ativo (com cache de 1 minuto)
    let allSettings = cachedAllSettings;
    const nowTime = Date.now();
    if (!allSettings || (nowTime - cachedSettingsTimestamp > 60000)) {
      const { data, error: settingsError } = await supabase
        .from('user_settings')
        .select('user_id, whatsapp_number, whatsapp_enabled')
        .eq('whatsapp_enabled', true);

      if (settingsError) {
        console.error('[WhatsApp Webhook] Erro ao buscar user_settings:', settingsError);
      } else {
        allSettings = data;
        cachedAllSettings = data;
        cachedSettingsTimestamp = nowTime;
      }
    }

    if (allSettings && allSettings.length > 0) {
      // Normaliza um número de telefone para apenas dígitos, removendo código do país 55 e zeros à esquerda
      const normalizePhoneDigits = (numStr: string) => {
        let clean = String(numStr || '').replace(/\D/g, '');
        if (clean.startsWith('55')) {
          clean = clean.substring(2);
        }
        if (clean.startsWith('0')) {
          clean = clean.substring(1);
        }
        return clean;
      };

      // Retorna variantes com e sem o nono dígito (para números brasileiros)
      const getDDDVariants = (cleanDigits: string) => {
        const variants = [cleanDigits];
        if (cleanDigits.length === 11 && cleanDigits[2] === '9') {
          const withoutNine = cleanDigits.substring(0, 2) + cleanDigits.substring(3);
          variants.push(withoutNine);
        } else if (cleanDigits.length === 10) {
          const withNine = cleanDigits.substring(0, 2) + '9' + cleanDigits.substring(2);
          variants.push(withNine);
        }
        return variants;
      };

      const incomingClean = normalizePhoneDigits(phone);
      const incomingVariants = getDDDVariants(incomingClean);

      console.log('[WhatsApp Webhook] Telefone recebido:', phone, 'Normalizado:', incomingClean, 'Variantes:', incomingVariants);

      for (const setting of allSettings) {
        if (!setting.whatsapp_number) continue;
        const dbClean = normalizePhoneDigits(setting.whatsapp_number);
        const dbVariants = getDDDVariants(dbClean);

        // Verifica se alguma variante do telefone recebido coincide com alguma variante salva no banco
        const isMatch = incomingVariants.some(v => dbVariants.includes(v));
        if (isMatch) {
          userSet = setting;
          console.log('[WhatsApp Webhook] Usuário encontrado:', setting.user_id, 'para o telefone:', setting.whatsapp_number);
          break;
        }
      }
    }


    if (!userSet) {
      await sendWhatsApp(phone, `Olá! Bem-vindo ao *FinVision AI* 💎\n\nEu sou o seu consultor financeiro pessoal inteligente.\n\nIdentifiquei que seu número ainda não está vinculado a uma conta ativa no FinVision Pro.\n\n🆕 *É novo por aqui? Faça seu cadastro rápido em segundos:*\n👉 https://finvision.automanow.com.br/signup?wp=${phone}\n_(Ganhe 7 dias grátis de acesso Wealth Premium no nosso lançamento!)_\n\n🔄 *Já possui uma conta ativa? Veja como é fácil vincular seu número de WhatsApp:*\n1️⃣ Acesse o FinVision Pro pelo computador ou celular.\n2️⃣ Vá no menu **Ajustes** (ícone de engrenagem no painel).\n3️⃣ Na aba **Preferências**, ative a opção **Notificações via WhatsApp**.\n4️⃣ Digite seu número de telefone com DDD (ex: +55 45 99999-9999) e salve.\n\nPronto! Em segundos, seu assistente pessoal estará ativo para receber fotos de cupons, áudios e comandar suas finanças direto por aqui!`);
      return res.status(200).json({ status: 'user_invited', phoneUsed: phone });
    }
    if (!userSet.whatsapp_enabled) return res.status(200).json({ status: 'whatsapp_disabled_by_user' });

    userId = userSet.user_id;

    // Prevenção contra loops de retransmissão de webhook do Vercel (Early Lock)
    const { data: existingDraft } = await supabase
      .from('whatsapp_drafts')
      .select('id, status, data')
      .eq('user_id', userId)
      .eq('data->>messageId', message.key.id)
      .maybeSingle();

    if (existingDraft) {
      console.log('[WhatsApp Webhook] Mensagem já está sendo processada ou rascunho criado:', message.key.id);
      return res.status(200).json({ status: 'already_processed', messageId: message.key.id });
    }

    // Criar lock row imediatamente
    await supabase
      .from('whatsapp_drafts')
      .insert({
        user_id: userId,
        phone: phone,
        data: { messageId: message.key.id, type: 'lock' },
        status: 'pending'
      });

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

    // Detecção de tipos de mídia robusta e unwrap de mensagens WhatsApp
    const extracted = extractMessageContent(message);
    const isImage = extracted.mediaType === 'image' || (extracted.mediaType === 'document' && String(extracted.mimeType).startsWith('image/'));
    const isPDF = extracted.mediaType === 'document' && String(extracted.mimeType).includes('pdf');
    const isAudio = extracted.mediaType === 'audio';

    // Processamento especial de mensagens de voz (Áudio) ou texto
    let text = (extracted.text || '').trim();

    // Onboarding: detectar primeiro contato (histórico vazio + saudação)
    if (history.length === 0 && !isImage && !isPDF && !isAudio && text) {
      const textLowOnboard = text.toLowerCase().trim();
      const isGreeting = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'oie', 'ei', 'hey', 'boa', 'hello', 'hi'].some(p => textLowOnboard === p || textLowOnboard.startsWith(p + ' ') || textLowOnboard.startsWith(p + '!') || textLowOnboard.startsWith(p + ','));
      if (isGreeting) {
        const onboardMsg = `👋 *Olá! Seja bem-vindo ao FinVision AI!*\n\nSou seu assistente financeiro pessoal. Estou pronto para ajudar você a controlar suas finanças direto pelo WhatsApp!\n\n${HELP_MESSAGE}`;
        await sendWhatsApp(phone, onboardMsg);
        history.push({ role: 'user', content: text });
        history.push({ role: 'model', content: onboardMsg });
        await supabase.from('whatsapp_chat_sessions').upsert({ phone, messages: history.slice(-30), updated_at: new Date().toISOString() }, { onConflict: 'phone' });
        await supabase.from('whatsapp_drafts').delete().eq('user_id', userId).eq('data->>messageId', message.key.id);
        return res.status(200).json({ status: 'onboarding_sent' });
      }
    }

    // Comando de ajuda
    if (!isAudio && !isImage && !isPDF && text) {
      const textLowHelp = text.toLowerCase().trim();
      const helpTriggers = ['ajuda', 'help', 'o que você faz', 'o que voce faz', 'como funciona', 'comandos', 'menu', 'tutorial', 'o que pode fazer', 'o que posso fazer'];
      if (helpTriggers.some(p => textLowHelp === p || textLowHelp.startsWith(p))) {
        await sendWhatsApp(phone, HELP_MESSAGE);
        await supabase.from('whatsapp_drafts').delete().eq('user_id', userId).eq('data->>messageId', message.key.id);
        return res.status(200).json({ status: 'help_sent' });
      }
    }

    // Extração de informações da transação citada na resposta do usuário (se houver)
    const quotedTx = parseQuotedTransaction(message);

    if (isAudio) {
      await sendWhatsApp(phone, `🤖 *Ouvindo sua mensagem de voz...*`);
      const media = await downloadEvolutionMedia(message);
      if (!media) {
        await sendWhatsApp(phone, `❌ *Não consegui processar seu áudio.*`);
        await supabase.from('whatsapp_drafts').delete().eq('user_id', userId).eq('data->>messageId', message.key.id);
        return res.status(200).json({ status: 'audio_error' });
      }

      let cleanMimeType = media.mimeType.split(';')[0].trim();
      if (cleanMimeType.includes('audio/ogg') || cleanMimeType.includes('opus')) {
        cleanMimeType = 'audio/ogg';
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
        await supabase.from('whatsapp_drafts').delete().eq('user_id', userId).eq('data->>messageId', message.key.id);
        return res.status(200).json({ status: 'audio_unclear' });
      }

      await sendWhatsApp(phone, `🎙️ *Transcrição:* "${transcribedText}"`);
      text = transcribedText;
    }

    // Interceptação de comandos de cancelamento/parada de forma prioritária
    const cancelWords = ['parar', 'pode parar', 'cancela', 'cancelar', 'esquece', 'sair', 'para'];
    if (text && cancelWords.includes(text.toLowerCase().trim())) {
      await supabase
        .from('whatsapp_drafts')
        .update({ status: 'canceled' })
        .eq('user_id', userId)
        .eq('status', 'pending');

      await sendWhatsApp(phone, `🚫 *Entendido! Cancelei qualquer rascunho pendente.*`);
      
      await supabase
        .from('whatsapp_drafts')
        .delete()
        .eq('user_id', userId)
        .eq('data->>messageId', message.key.id);

      return res.status(200).json({ status: 'canceled_by_user' });
    }

    // Number Selection / Disambiguation logic
    const parsedNum = parseInt(text, 10);
    if (!isNaN(parsedNum) && parsedNum > 0) {
      const { data: draft } = await supabase
        .from('whatsapp_drafts')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .neq('data->>type', 'lock')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (draft && draft.data && (draft.data.type === 'delete_disambiguation' || draft.data.type === 'pay_disambiguation' || draft.data.type === 'update_disambiguation')) {
        const candidates = draft.data.candidates || [];
        const selectedTx = candidates[parsedNum - 1];

        if (selectedTx) {
          let actionType = 'delete';
          if (draft.data.type === 'pay_disambiguation') actionType = 'pay';
          if (draft.data.type === 'update_disambiguation') actionType = 'update';

          if (actionType === 'delete') {
            if (selectedTx.is_card) {
              await supabase.from('card_transactions').delete().eq('id', selectedTx.id).eq('user_id', userId);
            } else {
              const { data: dbTx } = await supabase.from('transactions').select('account_id').eq('id', selectedTx.id).eq('user_id', userId).maybeSingle();
              await supabase.from('transactions').update({ is_deleted: true }).eq('id', selectedTx.id).eq('user_id', userId);
              if (dbTx?.account_id) {
                await supabase.rpc('recalculate_account_balance', { p_account_id: dbTx.account_id });
              }
            }
            await supabase.from('whatsapp_drafts').delete().eq('id', draft.id);
            await sendWhatsApp(phone, `✅ *Lançamento Excluído com Sucesso!*\n\n"${selectedTx.description}" de R$ ${Number(selectedTx.amount).toFixed(2)} foi removido.`);
            await supabase.from('whatsapp_drafts').delete().eq('user_id', userId).eq('data->>messageId', message.key.id);
            return res.status(200).json({ status: 'confirmed_delete' });
          } else if (actionType === 'pay') {
            const { data: dbTx } = await supabase.from('transactions').select('account_id').eq('id', selectedTx.id).eq('user_id', userId).maybeSingle();
            const disambigPayDate = draft.data.payDate;
            const paidAtDisambig = disambigPayDate ? new Date(disambigPayDate + 'T12:00:00') : new Date();
            const paidDateStrDisambig = paidAtDisambig.toLocaleDateString('pt-BR');
            await supabase.from('transactions').update({ is_paid: true, paid_at: paidAtDisambig.toISOString() }).eq('id', selectedTx.id).eq('user_id', userId);
            if (dbTx?.account_id) {
              await supabase.rpc('recalculate_account_balance', { p_account_id: dbTx.account_id });
            }
            pendingBillsCache.delete(userId);
            lastPayActionCache.set(userId, { transactionId: selectedTx.id, description: selectedTx.description, amount: Number(selectedTx.amount), accountId: dbTx?.account_id || null, timestamp: Date.now() });
            await supabase.from('whatsapp_drafts').delete().eq('id', draft.id);
            const disambigSuccessMsg = `✅ *Conta Marcada como Paga!*\n\n"${selectedTx.description}" de R$ ${Number(selectedTx.amount).toFixed(2)} foi quitada.\n📅 *Data de pagamento registrada:* ${paidDateStrDisambig}`;
            await sendWhatsApp(phone, disambigSuccessMsg);
            sendReaction(message.key, '✅').catch(() => {});
            history.push({ role: 'user', content: text });
            history.push({ role: 'model', content: disambigSuccessMsg });
            await supabase.from('whatsapp_chat_sessions').upsert({ phone, messages: history.slice(-30), updated_at: new Date().toISOString() }, { onConflict: 'phone' });
            await supabase.from('whatsapp_drafts').delete().eq('user_id', userId).eq('data->>messageId', message.key.id);
            return res.status(200).json({ status: 'confirmed_pay' });
          } else if (actionType === 'update') {
            const patch = draft.data.patch || {};
            const txId = selectedTx.id;

            const { data: normalTx } = await supabase.from('transactions').select('id, account_id, type, metadata, amount, date, description').eq('id', txId).eq('user_id', userId).maybeSingle();
            if (normalTx) {
              const isTransfer = normalTx.type === 'TRANSFER' || normalTx.metadata?.is_transfer;
              if (isTransfer) {
                const { data: counterTx } = await supabase
                  .from('transactions')
                  .select('id, account_id, metadata, type')
                  .eq('user_id', userId)
                  .eq('type', 'TRANSFER')
                  .eq('description', normalTx.description)
                  .eq('amount', normalTx.amount)
                  .eq('date', normalTx.date)
                  .is('is_deleted', false)
                  .neq('id', normalTx.id)
                  .maybeSingle();

                let sourceTx = normalTx.metadata?.transfer_side === 'DESTINATION' ? counterTx : normalTx;
                let destTx = normalTx.metadata?.transfer_side === 'DESTINATION' ? normalTx : counterTx;

                let updatePayloadSource: any = {};
                let updatePayloadDest: any = {};

                if (patch.description) {
                  updatePayloadSource.description = patch.description;
                  if (destTx) updatePayloadDest.description = patch.description;
                }
                if (patch.amount) {
                  updatePayloadSource.amount = Number(patch.amount);
                  if (destTx) updatePayloadDest.amount = Number(patch.amount);
                }
                if (patch.date) {
                  updatePayloadSource.date = patch.date;
                  if (destTx) updatePayloadDest.date = patch.date;
                }
                if (patch.notes) {
                  updatePayloadSource.notes = patch.notes;
                  if (destTx) updatePayloadDest.notes = patch.notes;
                }
                if (patch.tags) {
                  updatePayloadSource.tags = patch.tags;
                  if (destTx) updatePayloadDest.tags = patch.tags;
                }
                if (patch.owner_name) {
                  const resolvedOwner = await resolveOwnerName(userId, patch.owner_name);
                  const oVal = resolvedOwner === 'Pessoal' ? null : resolvedOwner;
                  updatePayloadSource.owner_name = oVal;
                  if (destTx) updatePayloadDest.owner_name = oVal;
                }

                const { data: userAccounts } = await supabase.from('accounts').select('id, institution').eq('user_id', userId).eq('is_archived', false);

                if (patch.account_name && userAccounts) {
                  const matched = userAccounts.find(a => a.institution.toLowerCase().includes(patch.account_name.toLowerCase()) || patch.account_name.toLowerCase().includes(a.institution.toLowerCase()));
                  if (matched) {
                    if (sourceTx) {
                      updatePayloadSource.account_id = matched.id;
                      updatePayloadSource.account_name = matched.institution;
                    }
                    if (destTx) {
                      updatePayloadDest.metadata = { ...(destTx.metadata || {}), counter_account_id: matched.id };
                    }
                  }
                }

                if (patch.destination_account_name && userAccounts) {
                  const matchedDest = userAccounts.find(a => a.institution.toLowerCase().includes(patch.destination_account_name.toLowerCase()) || patch.destination_account_name.toLowerCase().includes(a.institution.toLowerCase()));
                  if (matchedDest) {
                    if (destTx) {
                      updatePayloadDest.account_id = matchedDest.id;
                      updatePayloadDest.account_name = matchedDest.institution;
                    }
                    if (sourceTx) {
                      updatePayloadSource.metadata = { ...(sourceTx.metadata || {}), counter_account_id: matchedDest.id };
                    }
                  }
                }

                if (sourceTx && Object.keys(updatePayloadSource).length > 0) {
                  await supabase.from('transactions').update(updatePayloadSource).eq('id', sourceTx.id).eq('user_id', userId);
                  await supabase.rpc('recalculate_account_balance', { p_account_id: updatePayloadSource.account_id || sourceTx.account_id });
                }
                if (destTx && Object.keys(updatePayloadDest).length > 0) {
                  await supabase.from('transactions').update(updatePayloadDest).eq('id', destTx.id).eq('user_id', userId);
                  await supabase.rpc('recalculate_account_balance', { p_account_id: updatePayloadDest.account_id || destTx.account_id });
                }
              } else {
                let updatePayload: any = {};
                if (patch.description) updatePayload.description = patch.description;
                if (patch.amount) updatePayload.amount = Number(patch.amount);
                if (patch.category) updatePayload.category = patch.category;
                if (patch.subcategory) updatePayload.subcategory = patch.subcategory;
                if (patch.date) updatePayload.date = patch.date;
                if (patch.notes) updatePayload.notes = patch.notes;
                if (patch.tags) updatePayload.tags = patch.tags;
                if (patch.owner_name) {
                  const resolvedOwner = await resolveOwnerName(userId, patch.owner_name);
                  updatePayload.owner_name = resolvedOwner === 'Pessoal' ? null : resolvedOwner;
                }

                if (patch.account_name) {
                  const { data: userAccounts } = await supabase.from('accounts').select('id, institution').eq('user_id', userId).eq('is_archived', false);
                  const matched = userAccounts?.find(a => a.institution.toLowerCase().includes(patch.account_name.toLowerCase()) || patch.account_name.toLowerCase().includes(a.institution.toLowerCase()));
                  if (matched) {
                    updatePayload.account_id = matched.id;
                    updatePayload.account_name = matched.institution;
                  }
                }

                await supabase.from('transactions').update(updatePayload).eq('id', txId).eq('user_id', userId);
                await supabase.rpc('recalculate_account_balance', { p_account_id: updatePayload.account_id || normalTx.account_id });
              }
            } else {
              const { data: cardTx } = await supabase.from('card_transactions').select('id, card_id, date').eq('id', txId).eq('user_id', userId).maybeSingle();
              if (cardTx) {
                let updatePayload: any = {};
                if (patch.description) updatePayload.description = patch.description;
                if (patch.amount) updatePayload.amount = Number(patch.amount);
                if (patch.subcategory) updatePayload.subcategory = patch.subcategory;
                if (patch.date) updatePayload.date = patch.date;
                if (patch.notes) updatePayload.notes = patch.notes;
                if (patch.tags) updatePayload.tags = patch.tags;
                if (patch.owner_name) {
                  const resolvedOwner = await resolveOwnerName(userId, patch.owner_name);
                  updatePayload.owner_name = resolvedOwner === 'Pessoal' ? null : resolvedOwner;
                }

                if (patch.category) {
                  const { data: catData } = await supabase.from('categories').select('id').eq('user_id', userId).ilike('name', patch.category).maybeSingle();
                  if (catData) updatePayload.category_id = catData.id;
                }

                if (patch.account_name) {
                  const { data: cards } = await supabase.from('cards').select('id, name').eq('user_id', userId).eq('is_archived', false);
                  const matchedCard = cards?.find(c => c.name.toLowerCase().includes(patch.account_name.toLowerCase()) || patch.account_name.toLowerCase().includes(c.name.toLowerCase()));
                  if (matchedCard) {
                    updatePayload.card_id = matchedCard.id;
                    updatePayload.statement_id = await getOrCreateStatementHelper(userId, matchedCard.id, patch.date || cardTx.date || new Date().toISOString().split('T')[0]);
                  }
                }

                await supabase.from('card_transactions').update(updatePayload).eq('id', txId).eq('user_id', userId);
              }
            }

            await supabase.from('whatsapp_drafts').delete().eq('id', draft.id);
            await sendWhatsApp(phone, `✅ *Lançamento Alterado com Sucesso!* 🔄\n\nO lançamento foi atualizado no FinVision.`);
            await supabase.from('whatsapp_drafts').delete().eq('user_id', userId).eq('data->>messageId', message.key.id);
            return res.status(200).json({ status: 'confirmed_update' });
          }
        } else {
          await sendWhatsApp(phone, `❌ *Opção inválida.* Por favor, escolha um número entre 1 e ${candidates.length}, ou digite CANCELAR.`);
          await supabase.from('whatsapp_drafts').delete().eq('user_id', userId).eq('data->>messageId', message.key.id);
          return res.status(200).json({ status: 'disambiguation_invalid_option' });
        }
      }
    }

    // Pré-processamento e normalização do texto de resposta do usuário
    const cleanConfirmText = text.toLowerCase().trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "");

    const confirmPhrases = [
      'sim', 's', 'ss', 'confirmar', 'confirmo', 'pode', 'pode sim', 
      'pode lancar', 'pode lançar', 'ok', 'bora', 'fechado', 
      'lancar', 'lançar', 'com certeza', 'yes', 'y', 'confirmado'
    ];
    const isConfirm = confirmPhrases.includes(cleanConfirmText) || 
                      cleanConfirmText.startsWith('sim') || 
                      cleanConfirmText === 's' || 
                      cleanConfirmText === 'ss';

    const cancelPhrases = [
      'não', 'nao', 'n', 'nn', 'cancelar', 'cancela', 'esquece',
      'para', 'parar', 'pode parar', 'no', 'sair',
      'desfazer', 'desfaz', 'desfaça', 'desfaca', 'undo', 'desfaz isso', 'desfazer isso'
    ];
    const isCancel = cancelPhrases.includes(cleanConfirmText) || 
                     cleanConfirmText.startsWith('não') || 
                     cleanConfirmText.startsWith('nao') || 
                     cleanConfirmText === 'n' || 
                     cleanConfirmText === 'nn';

    // Confirm draft logic
    if (isConfirm) {
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
        const tx = draft.data;
        
        if (tx.type === 'delete') {
          if (tx.is_card) {
            await supabase.from('card_transactions').delete().eq('id', tx.transactionId).eq('user_id', userId);
          } else {
            const { data: dbTx } = await supabase.from('transactions').select('account_id').eq('id', tx.transactionId).eq('user_id', userId).maybeSingle();
            await supabase.from('transactions').update({ is_deleted: true }).eq('id', tx.transactionId).eq('user_id', userId);
            if (dbTx?.account_id) {
              await supabase.rpc('recalculate_account_balance', { p_account_id: dbTx.account_id });
            }
          }
          await supabase.from('whatsapp_drafts').update({ status: 'confirmed' }).eq('id', draft.id);
          await sendWhatsApp(phone, `✅ *Lançamento Excluído com Sucesso!*\n\n"${tx.description}" de R$ ${Number(tx.amount).toFixed(2)} foi removido.`);
          await supabase.from('whatsapp_drafts').delete().eq('user_id', userId).eq('data->>messageId', message.key.id);
          return res.status(200).json({ status: 'confirmed_delete' });
        } else if (tx.type === 'pay') {
          const paidAt = tx.payDate ? new Date(tx.payDate + 'T12:00:00') : new Date();
          const paidDateStr = paidAt.toLocaleDateString('pt-BR');
          const { data: txForAccount } = await supabase.from('transactions').select('account_id').eq('id', tx.transactionId).eq('user_id', userId).maybeSingle();
          let resolvedPayAccountId = txForAccount?.account_id || null;
          if (tx.accountName) {
            const { data: userAccounts } = await supabase.from('accounts').select('id, institution').eq('user_id', userId).eq('is_archived', false);
            const matchedAcc = userAccounts?.find((a: any) => a.institution.toLowerCase().includes(tx.accountName.toLowerCase()) || tx.accountName.toLowerCase().includes(a.institution.toLowerCase()));
            if (matchedAcc) resolvedPayAccountId = matchedAcc.id;
          }
          const payUpdatePayload: any = { is_paid: true, paid_at: paidAt.toISOString() };
          if (resolvedPayAccountId) payUpdatePayload.account_id = resolvedPayAccountId;
          await supabase.from('transactions').update(payUpdatePayload).eq('id', tx.transactionId).eq('user_id', userId);
          if (resolvedPayAccountId) await supabase.rpc('recalculate_account_balance', { p_account_id: resolvedPayAccountId });
          pendingBillsCache.delete(userId);
          lastPayActionCache.set(userId, { transactionId: tx.transactionId, description: tx.description, amount: Number(tx.amount), accountId: resolvedPayAccountId, timestamp: Date.now() });
          await supabase.from('whatsapp_drafts').update({ status: 'confirmed' }).eq('id', draft.id);
          const successMsg = `✅ *Conta Marcada como Paga!*\n\n"${tx.description}" de R$ ${Number(tx.amount).toFixed(2)} foi quitada.\n📅 *Data de pagamento registrada:* ${paidDateStr}`;
          await sendWhatsApp(phone, successMsg);
          sendReaction(message.key, '✅').catch(() => {});
          history.push({ role: 'user', content: text });
          history.push({ role: 'model', content: successMsg });
          await supabase.from('whatsapp_chat_sessions').upsert({ phone, messages: history.slice(-30), updated_at: new Date().toISOString() }, { onConflict: 'phone' });
          await supabase.from('whatsapp_drafts').delete().eq('user_id', userId).eq('data->>messageId', message.key.id);
          return res.status(200).json({ status: 'confirmed_pay' });
        } else if (tx.type === 'update') {
          const patch = tx.patch || {};
          const txId = tx.transactionId;

          const { data: normalTx } = await supabase.from('transactions').select('id, account_id, type, metadata, amount, date, description').eq('id', txId).eq('user_id', userId).maybeSingle();
          if (normalTx) {
            const isTransfer = normalTx.type === 'TRANSFER' || normalTx.metadata?.is_transfer;
            if (isTransfer) {
              const { data: counterTx } = await supabase
                .from('transactions')
                .select('id, account_id, metadata, type')
                .eq('user_id', userId)
                .eq('type', 'TRANSFER')
                .eq('description', normalTx.description)
                .eq('amount', normalTx.amount)
                .eq('date', normalTx.date)
                .is('is_deleted', false)
                .neq('id', normalTx.id)
                .maybeSingle();

              let sourceTx = normalTx.metadata?.transfer_side === 'DESTINATION' ? counterTx : normalTx;
              let destTx = normalTx.metadata?.transfer_side === 'DESTINATION' ? normalTx : counterTx;

              let updatePayloadSource: any = {};
              let updatePayloadDest: any = {};

              if (patch.description) {
                updatePayloadSource.description = patch.description;
                if (destTx) updatePayloadDest.description = patch.description;
              }
              if (patch.amount) {
                updatePayloadSource.amount = Number(patch.amount);
                if (destTx) updatePayloadDest.amount = Number(patch.amount);
              }
              if (patch.date) {
                updatePayloadSource.date = patch.date;
                if (destTx) updatePayloadDest.date = patch.date;
              }
              if (patch.notes) {
                updatePayloadSource.notes = patch.notes;
                if (destTx) updatePayloadDest.notes = patch.notes;
              }
              if (patch.tags) {
                updatePayloadSource.tags = patch.tags;
                if (destTx) updatePayloadDest.tags = patch.tags;
              }
              if (patch.owner_name) {
                const resolvedOwner = await resolveOwnerName(userId, patch.owner_name);
                const oVal = resolvedOwner === 'Pessoal' ? null : resolvedOwner;
                updatePayloadSource.owner_name = oVal;
                if (destTx) updatePayloadDest.owner_name = oVal;
              }

              const { data: userAccounts } = await supabase.from('accounts').select('id, institution').eq('user_id', userId).eq('is_archived', false);

              if (patch.account_name && userAccounts) {
                const matched = userAccounts.find(a => a.institution.toLowerCase().includes(patch.account_name.toLowerCase()) || patch.account_name.toLowerCase().includes(a.institution.toLowerCase()));
                if (matched) {
                  if (sourceTx) {
                    updatePayloadSource.account_id = matched.id;
                    updatePayloadSource.account_name = matched.institution;
                  }
                  if (destTx) {
                    updatePayloadDest.metadata = { ...(destTx.metadata || {}), counter_account_id: matched.id };
                  }
                }
              }

              if (patch.destination_account_name && userAccounts) {
                const matchedDest = userAccounts.find(a => a.institution.toLowerCase().includes(patch.destination_account_name.toLowerCase()) || patch.destination_account_name.toLowerCase().includes(a.institution.toLowerCase()));
                if (matchedDest) {
                  if (destTx) {
                    updatePayloadDest.account_id = matchedDest.id;
                    updatePayloadDest.account_name = matchedDest.institution;
                  }
                  if (sourceTx) {
                    updatePayloadSource.metadata = { ...(sourceTx.metadata || {}), counter_account_id: matchedDest.id };
                  }
                }
              }

              if (sourceTx && Object.keys(updatePayloadSource).length > 0) {
                await supabase.from('transactions').update(updatePayloadSource).eq('id', sourceTx.id).eq('user_id', userId);
                await supabase.rpc('recalculate_account_balance', { p_account_id: updatePayloadSource.account_id || sourceTx.account_id });
              }
              if (destTx && Object.keys(updatePayloadDest).length > 0) {
                await supabase.from('transactions').update(updatePayloadDest).eq('id', destTx.id).eq('user_id', userId);
                await supabase.rpc('recalculate_account_balance', { p_account_id: updatePayloadDest.account_id || destTx.account_id });
              }
            } else {
              let updatePayload: any = {};
              if (patch.description) updatePayload.description = patch.description;
              if (patch.amount) updatePayload.amount = Number(patch.amount);
              if (patch.category) updatePayload.category = patch.category;
              if (patch.subcategory) updatePayload.subcategory = patch.subcategory;
              if (patch.date) updatePayload.date = patch.date;
              if (patch.notes) updatePayload.notes = patch.notes;
              if (patch.tags) updatePayload.tags = patch.tags;
              if (patch.owner_name) {
                const resolvedOwner = await resolveOwnerName(userId, patch.owner_name);
                updatePayload.owner_name = resolvedOwner === 'Pessoal' ? null : resolvedOwner;
              }

              if (patch.account_name) {
                const { data: userAccounts } = await supabase.from('accounts').select('id, institution').eq('user_id', userId).eq('is_archived', false);
                const matched = userAccounts?.find(a => a.institution.toLowerCase().includes(patch.account_name.toLowerCase()) || patch.account_name.toLowerCase().includes(a.institution.toLowerCase()));
                if (matched) {
                  updatePayload.account_id = matched.id;
                  updatePayload.account_name = matched.institution;
                }
              }

              await supabase.from('transactions').update(updatePayload).eq('id', txId).eq('user_id', userId);
              await supabase.rpc('recalculate_account_balance', { p_account_id: updatePayload.account_id || normalTx.account_id });
            }
          } else {
            const { data: cardTx } = await supabase.from('card_transactions').select('id, card_id, date').eq('id', txId).eq('user_id', userId).maybeSingle();
            if (cardTx) {
              let updatePayload: any = {};
              if (patch.description) updatePayload.description = patch.description;
              if (patch.amount) updatePayload.amount = Number(patch.amount);
              if (patch.subcategory) updatePayload.subcategory = patch.subcategory;
              if (patch.date) updatePayload.date = patch.date;
              if (patch.notes) updatePayload.notes = patch.notes;
              if (patch.tags) updatePayload.tags = patch.tags;
              if (patch.owner_name) {
                const resolvedOwner = await resolveOwnerName(userId, patch.owner_name);
                updatePayload.owner_name = resolvedOwner === 'Pessoal' ? null : resolvedOwner;
              }

              if (patch.category) {
                const { data: catData } = await supabase.from('categories').select('id').eq('user_id', userId).ilike('name', patch.category).maybeSingle();
                if (catData) updatePayload.category_id = catData.id;
              }

              if (patch.account_name) {
                const { data: cards } = await supabase.from('cards').select('id, name').eq('user_id', userId).eq('is_archived', false);
                const matchedCard = cards?.find(c => c.name.toLowerCase().includes(patch.account_name.toLowerCase()) || patch.account_name.toLowerCase().includes(c.name.toLowerCase()));
                if (matchedCard) {
                  updatePayload.card_id = matchedCard.id;
                  updatePayload.statement_id = await getOrCreateStatementHelper(userId, matchedCard.id, patch.date || cardTx.date || new Date().toISOString().split('T')[0]);
                }
              }

              await supabase.from('card_transactions').update(updatePayload).eq('id', txId).eq('user_id', userId);
            }
          }

          await supabase.from('whatsapp_drafts').update({ status: 'confirmed' }).eq('id', draft.id);
          await sendWhatsApp(phone, `✅ *Lançamento Alterado com Sucesso!* 🔄\n\nO lançamento foi atualizado no FinVision.`);
          await supabase.from('whatsapp_drafts').delete().eq('user_id', userId).eq('data->>messageId', message.key.id);
          return res.status(200).json({ status: 'confirmed_update' });
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
              const resolvedOwner = await resolveOwnerName(userId, op.transaction.owner_name);
              const oVal = resolvedOwner === 'Pessoal' ? null : resolvedOwner;

              if (op.transaction.is_card || op.transaction.card_id || op.transaction.card_name) {
                // Multi card insertion
                const { data: cards } = await supabase.from('cards').select('*').eq('user_id', userId).eq('is_archived', false);
                let selectedCard = cards?.find(c => c.id === op.transaction.card_id) || cards?.find(c => op.transaction.card_name && c.name.toLowerCase().includes(op.transaction.card_name.toLowerCase())) || cards?.[0];
                if (selectedCard) {
                  const targetStmtId = await getOrCreateStatementHelper(userId, selectedCard.id, op.transaction.date || new Date().toISOString().split('T')[0]);
                  let categoryId = null;
                  if (op.transaction.category) {
                    const { data: catData } = await supabase.from('categories').select('id').eq('user_id', userId).ilike('name', op.transaction.category).maybeSingle();
                    if (catData) categoryId = catData.id;
                  }
                  await supabase.from('card_transactions').insert({
                    user_id: userId,
                    card_id: selectedCard.id,
                    statement_id: targetStmtId || null,
                    date: op.transaction.date || new Date().toISOString().split('T')[0],
                    description: op.transaction.description,
                    amount: Math.abs(op.transaction.amount || 0),
                    status: 'POSTED',
                    source: 'MANUAL',
                    is_manual: true,
                    category_id: categoryId,
                    category: op.transaction.category || 'Outros',
                    subcategory: op.transaction.subcategory || null,
                    owner_name: oVal,
                    is_recurring: op.transaction.is_recurring || false,
                    recurrence_period: op.transaction.recurrence_period || null,
                    is_installment: op.transaction.is_installment || false,
                    installment_number: op.transaction.installment_number || null,
                    installment_total: op.transaction.installment_total || null,
                    notes: op.transaction.notes || '',
                    tags: op.transaction.tags || []
                  });
                }
              } else {
                await supabase.from('transactions').insert({
                  user_id: userId,
                  account_id: defaultAcc?.id || null,
                  description: op.transaction.description,
                  amount: op.transaction.amount,
                  date: op.transaction.date || new Date().toISOString().split('T')[0],
                  type: op.transaction.type || 'EXPENSE',
                  category: op.transaction.category || 'Outros',
                  subcategory: op.transaction.subcategory || null,
                  is_paid: true,
                  owner_name: oVal,
                  is_recurring: op.transaction.is_recurring || false,
                  recurrence_period: op.transaction.recurrence_period || null,
                  is_installment: op.transaction.is_installment || false,
                  installment_number: op.transaction.installment_number || null,
                  installment_total: op.transaction.installment_total || null,
                  notes: op.transaction.notes || '',
                  tags: op.transaction.tags || []
                });
              }
            } else if (op.intent === 'DELETE') {
              await supabase.from('transactions').update({ is_deleted: true }).eq('id', op.transactionId).eq('user_id', userId);
            } else if (op.intent === 'PAY') {
              await supabase.from('transactions').update({ is_paid: true, paid_at: new Date().toISOString() }).eq('id', op.transactionId).eq('user_id', userId);
            } else if (op.intent === 'UPDATE') {
              const patch = op.patch || {};
              const txId = op.transactionId;

              const { data: normalTx } = await supabase.from('transactions').select('id, account_id').eq('id', txId).eq('user_id', userId).maybeSingle();
              if (normalTx) {
                let updatePayload: any = {};
                if (patch.description) updatePayload.description = patch.description;
                if (patch.amount) updatePayload.amount = Number(patch.amount);
                if (patch.category) updatePayload.category = patch.category;
                if (patch.subcategory) updatePayload.subcategory = patch.subcategory;
                if (patch.date) updatePayload.date = patch.date;
                if (patch.notes) updatePayload.notes = patch.notes;
                if (patch.tags) updatePayload.tags = patch.tags;
                if (patch.owner_name) {
                  const resolvedOwner = await resolveOwnerName(userId, patch.owner_name);
                  updatePayload.owner_name = resolvedOwner === 'Pessoal' ? null : resolvedOwner;
                }

                if (patch.account_name) {
                  const { data: userAccounts } = await supabase.from('accounts').select('id, institution').eq('user_id', userId).eq('is_archived', false);
                  const matched = userAccounts?.find(a => a.institution.toLowerCase().includes(patch.account_name.toLowerCase()) || patch.account_name.toLowerCase().includes(a.institution.toLowerCase()));
                  if (matched) {
                    updatePayload.account_id = matched.id;
                    updatePayload.account_name = matched.institution;
                  }
                }

                await supabase.from('transactions').update(updatePayload).eq('id', txId).eq('user_id', userId);
                await supabase.rpc('recalculate_account_balance', { p_account_id: updatePayload.account_id || normalTx.account_id });
              } else {
                const { data: cardTx } = await supabase.from('card_transactions').select('id, card_id, date').eq('id', txId).eq('user_id', userId).maybeSingle();
                if (cardTx) {
                  let updatePayload: any = {};
                  if (patch.description) updatePayload.description = patch.description;
                  if (patch.amount) updatePayload.amount = Number(patch.amount);
                  if (patch.subcategory) updatePayload.subcategory = patch.subcategory;
                  if (patch.date) updatePayload.date = patch.date;
                  if (patch.notes) updatePayload.notes = patch.notes;
                  if (patch.tags) updatePayload.tags = patch.tags;
                  if (patch.owner_name) {
                    const resolvedOwner = await resolveOwnerName(userId, patch.owner_name);
                    updatePayload.owner_name = resolvedOwner === 'Pessoal' ? null : resolvedOwner;
                  }

                  if (patch.category) {
                    const { data: catData } = await supabase.from('categories').select('id').eq('user_id', userId).ilike('name', patch.category).maybeSingle();
                    if (catData) updatePayload.category_id = catData.id;
                  }

                  if (patch.account_name) {
                    const { data: cards } = await supabase.from('cards').select('id, name').eq('user_id', userId).eq('is_archived', false);
                    const matchedCard = cards?.find(c => c.name.toLowerCase().includes(patch.account_name.toLowerCase()) || patch.account_name.toLowerCase().includes(c.name.toLowerCase()));
                    if (matchedCard) {
                      updatePayload.card_id = matchedCard.id;
                      updatePayload.statement_id = await getOrCreateStatementHelper(userId, matchedCard.id, patch.date || cardTx.date || new Date().toISOString().split('T')[0]);
                    }
                  }

                  await supabase.from('card_transactions').update(updatePayload).eq('id', txId).eq('user_id', userId);
                }
              }
            }
          }
          await supabase.from('whatsapp_drafts').update({ status: 'confirmed' }).eq('id', draft.id);
          await sendWhatsApp(phone, `✅ *Múltiplas operações confirmadas e executadas com sucesso!*`);
          await supabase.from('whatsapp_drafts').delete().eq('user_id', userId).eq('data->>messageId', message.key.id);
          return res.status(200).json({ status: 'confirmed_multi' });
        } else {
          const resolvedOwner = await resolveOwnerName(userId, tx.owner_name);
          const oVal = resolvedOwner === 'Pessoal' ? null : resolvedOwner;

          // If credit card transaction
          if (tx.is_card || tx.card_id || tx.card_name) {
            const { data: cards } = await supabase
              .from('cards')
              .select('*')
              .eq('user_id', userId)
              .eq('is_archived', false);

            let selectedCard = null;
            if (tx.card_id) {
              selectedCard = cards?.find(c => c.id === tx.card_id);
            } else if (tx.card_name) {
              selectedCard = cards?.find(c => c.name.toLowerCase().includes(tx.card_name.toLowerCase()) || tx.card_name.toLowerCase().includes(c.name.toLowerCase()));
            }

            if (!selectedCard && cards && cards.length > 0) {
              selectedCard = cards[0];
            }

            if (selectedCard) {
              const targetStmtId = await getOrCreateStatementHelper(userId, selectedCard.id, tx.date || new Date().toISOString().split('T')[0]);
              let categoryId = null;
              if (tx.category) {
                const { data: catData } = await supabase
                  .from('categories')
                  .select('id')
                  .eq('user_id', userId)
                  .ilike('name', tx.category)
                  .maybeSingle();
                if (catData) categoryId = catData.id;
              }

              await supabase.from('card_transactions').insert({
                user_id: userId,
                card_id: selectedCard.id,
                statement_id: targetStmtId || null,
                date: tx.date || new Date().toISOString().split('T')[0],
                description: tx.description,
                amount: Math.abs(tx.amount || 0),
                status: 'POSTED',
                source: 'MANUAL',
                is_manual: true,
                category_id: categoryId,
                category: tx.category || 'Outros',
                subcategory: tx.subcategory || null,
                owner_name: oVal,
                is_recurring: tx.is_recurring || false,
                recurrence_period: tx.recurrence_period || null,
                is_installment: tx.is_installment || false,
                installment_number: tx.installment_number || null,
                installment_total: tx.installment_total || null,
                notes: tx.notes || '',
                tags: tx.tags || []
              });

              await supabase.from('whatsapp_drafts').update({ status: 'confirmed' }).eq('id', draft.id);
              await sendWhatsApp(phone, `✅ *Lançamento Confirmado no Cartão ${selectedCard.name}!*\n\n"${tx.description}" de R$ ${Number(tx.amount).toFixed(2)} foi lançado.`);
              await supabase.from('whatsapp_drafts').delete().eq('user_id', userId).eq('data->>messageId', message.key.id);
              return res.status(200).json({ status: 'confirmed_card' });
            }
          }

          // Fallback to checking account regular transaction
          const { data: userAccounts } = await supabase
            .from('accounts')
            .select('id, institution')
            .eq('user_id', userId)
            .eq('is_archived', false);

          const { data: defaultAcc } = await supabase
            .from('accounts')
            .select('id, institution')
            .eq('user_id', userId)
            .eq('is_archived', false)
            .limit(1)
            .maybeSingle();

          let finalAccountId = defaultAcc?.id || null;
          let finalAccountName = defaultAcc?.institution || 'Conta';

          if (tx.account_name && userAccounts) {
            const matched = userAccounts.find(a => 
              a.institution.toLowerCase().includes(tx.account_name.toLowerCase()) ||
              tx.account_name.toLowerCase().includes(a.institution.toLowerCase())
            );
            if (matched) {
              finalAccountId = matched.id;
              finalAccountName = matched.institution;
            }
          }

          const isTransfer = tx.category?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('transfer') || tx.type === 'TRANSFER';

          if (isTransfer) {
            let finalDestAccountId = null;
            let finalDestAccountName = 'Conta Destino';

            if (tx.destination_account_name && userAccounts) {
              const matchedDest = userAccounts.find(a => 
                a.institution.toLowerCase().includes(tx.destination_account_name.toLowerCase()) ||
                tx.destination_account_name.toLowerCase().includes(a.institution.toLowerCase())
              );
              if (matchedDest) {
                finalDestAccountId = matchedDest.id;
                finalDestAccountName = matchedDest.institution;
              }
            }

            if (!finalDestAccountId) {
              const accountsPromptList = userAccounts ? userAccounts.map(a => a.institution).join(', ') : 'Nenhuma cadastrada';
              await sendWhatsApp(phone, `⚠️ *Atenção:* Este lançamento foi identificado como uma transferência, mas a *Conta de Destino* não foi informada ou não foi encontrada nas suas contas cadastradas: [${accountsPromptList}].\n\nPor favor, me diga qual é a conta de destino (ex: *\"destino Bradesco\"*, *\"para o Itaú\"*) antes de confirmar!`);
              await supabase.from('whatsapp_drafts').delete().eq('user_id', userId).eq('data->>messageId', message.key.id);
              return res.status(200).json({ status: 'needs_destination_account' });
            }

            const dateVal = tx.date || new Date().toISOString().split('T')[0];
            const descriptionVal = tx.description?.toLowerCase().includes('[transf]') ? tx.description : `[TRANSF] ${tx.description || 'Transferência'}`;

            // 1. Source Transaction (debit)
            await supabase.from('transactions').insert({
              user_id: userId,
              account_id: finalAccountId,
              description: descriptionVal,
              amount: tx.amount || 0,
              date: dateVal,
              type: 'TRANSFER',
              category: 'Transferência',
              subcategory: tx.subcategory || null,
              is_paid: true,
              owner_name: oVal,
              notes: tx.notes || '',
              tags: tx.tags || [],
              metadata: { is_transfer: true, transfer_side: 'SOURCE', counter_account_id: finalDestAccountId }
            });

            // 2. Destination Transaction (credit)
            await supabase.from('transactions').insert({
              user_id: userId,
              account_id: finalDestAccountId,
              description: descriptionVal,
              amount: tx.amount || 0,
              date: dateVal,
              type: 'TRANSFER',
              category: 'Transferência',
              subcategory: tx.subcategory || null,
              is_paid: true,
              owner_name: oVal,
              notes: tx.notes || '',
              tags: tx.tags || [],
              metadata: { is_transfer: true, transfer_side: 'DESTINATION', counter_account_id: finalAccountId }
            });

            // Recalculate balances
            if (finalAccountId) await supabase.rpc('recalculate_account_balance', { p_account_id: finalAccountId });
            if (finalDestAccountId) await supabase.rpc('recalculate_account_balance', { p_account_id: finalDestAccountId });

            await supabase.from('whatsapp_drafts').update({ status: 'confirmed' }).eq('id', draft.id);
            await sendWhatsApp(phone, `✅ *Transferência Confirmada!*\n\n"${tx.description}" de R$ ${Number(tx.amount).toFixed(2)} foi transferido de *${finalAccountName}* para *${finalDestAccountName}* com sucesso!`);
            await supabase.from('whatsapp_drafts').delete().eq('user_id', userId).eq('data->>messageId', message.key.id);
            return res.status(200).json({ status: 'confirmed' });
          }

          await supabase.from('transactions').insert({
            user_id: userId,
            account_id: finalAccountId,
            description: tx.description,
            amount: tx.amount,
            date: tx.date || new Date().toISOString().split('T')[0],
            type: tx.type || 'EXPENSE',
            category: tx.category || 'Outros',
            subcategory: tx.subcategory || null,
            is_paid: tx.is_paid !== undefined ? tx.is_paid : true,
            owner_name: oVal,
            is_recurring: tx.is_recurring || false,
            recurrence_period: tx.recurrence_period || null,
            is_installment: tx.is_installment || false,
            installment_number: tx.installment_number || null,
            installment_total: tx.installment_total || null,
            notes: tx.notes || '',
            tags: tx.tags || []
          });

          await supabase.from('whatsapp_drafts').update({ status: 'confirmed' }).eq('id', draft.id);
          await sendWhatsApp(phone, `✅ *Lançamento Confirmado na conta ${finalAccountName}!*\n\n"${tx.description}" de R$ ${Number(tx.amount).toFixed(2)} foi inserido com sucesso!`);
          await supabase.from('whatsapp_drafts').delete().eq('user_id', userId).eq('data->>messageId', message.key.id);
          return res.status(200).json({ status: 'confirmed' });
        }
      }
    }

    // Cancel draft logic / Undo direct launch
    if (isCancel) {
      // 1. Verificar se há algum rascunho pendente que não seja lock
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
        const type = draft.data?.type;
        if (type === 'delete' || type === 'pay' || type === 'update' || type === 'delete_disambiguation' || type === 'pay_disambiguation' || type === 'update_disambiguation' || type === 'multi') {
          await supabase.from('whatsapp_drafts').update({ status: 'canceled' }).eq('id', draft.id);
          await sendWhatsApp(phone, `🚫 *Ação Cancelada.*`);
        } else {
          await supabase.from('whatsapp_drafts').update({ status: 'canceled' }).eq('id', draft.id);
          await sendWhatsApp(phone, `🚫 *Lançamento Cancelado.*`);
        }
        await supabase.from('whatsapp_drafts').delete().eq('user_id', userId).eq('data->>messageId', message.key.id);
        return res.status(200).json({ status: 'canceled' });
      } else {
        // Se não há rascunho pendente de confirmação, o usuário pode estar respondendo "NÃO" ou "CANCELAR" para desfazer o último lançamento direto
        let matchedTx: any = null;
        if (quotedTx && quotedTx.description) {
          const matches = await findMatchingTransactions(userId, {
            description: quotedTx.description,
            amount: quotedTx.amount || undefined,
            date: quotedTx.date || undefined
          }, false);
          if (matches.length > 0) {
            matchedTx = matches[0];
          }
        }

        if (!matchedTx) {
          const lastTx = await getLastLaunchedTransaction(userId);
          if (lastTx) {
            const { data: fullTx } = lastTx.isCard
              ? await supabase.from('card_transactions').select('created_at').eq('id', lastTx.id).maybeSingle()
              : await supabase.from('transactions').select('created_at').eq('id', lastTx.id).maybeSingle();
            
            if (fullTx && fullTx.created_at) {
              const createdTime = new Date(fullTx.created_at).getTime();
              const nowTime = new Date().getTime();
              if (nowTime - createdTime < 300000) { // 5 minutos
                matchedTx = lastTx;
              }
            }
          }
        }

        if (matchedTx) {
          if (matchedTx.isCard) {
            await supabase.from('card_transactions').delete().eq('id', matchedTx.id).eq('user_id', userId);
          } else {
            const { data: dbTx } = await supabase.from('transactions').select('account_id').eq('id', matchedTx.id).eq('user_id', userId).maybeSingle();
            await supabase.from('transactions').update({ is_deleted: true }).eq('id', matchedTx.id).eq('user_id', userId);
            if (dbTx?.account_id) {
              await supabase.rpc('recalculate_account_balance', { p_account_id: dbTx.account_id });
            }
          }
          await sendWhatsApp(phone, `🗑️ *Lançamento Desfeito e Excluído com Sucesso!*\n\n"${matchedTx.description}" de R$ ${Number(matchedTx.amount).toFixed(2)} foi removido.`);
          await supabase.from('whatsapp_drafts').delete().eq('user_id', userId).eq('data->>messageId', message.key.id);
          return res.status(200).json({ status: 'canceled_and_deleted' });
        }

        // Verificar se há um pagamento recente para desfazer (últimos 5 min)
        const recentPay = lastPayActionCache.get(userId);
        if (recentPay && (Date.now() - recentPay.timestamp < 300000)) {
          await supabase.from('transactions').update({ is_paid: false, paid_at: null }).eq('id', recentPay.transactionId).eq('user_id', userId);
          if (recentPay.accountId) await supabase.rpc('recalculate_account_balance', { p_account_id: recentPay.accountId });
          pendingBillsCache.delete(userId);
          lastPayActionCache.delete(userId);
          await sendWhatsApp(phone, `↩️ *Pagamento Desfeito!*\n\n"${recentPay.description}" de R$ ${recentPay.amount.toFixed(2)} foi marcada como *pendente* novamente.`);
          await supabase.from('whatsapp_drafts').delete().eq('user_id', userId).eq('data->>messageId', message.key.id);
          return res.status(200).json({ status: 'pay_undone' });
        }

        await sendWhatsApp(phone, `🚫 *Ação Cancelada.*`);
        await supabase.from('whatsapp_drafts').delete().eq('user_id', userId).eq('data->>messageId', message.key.id);
        return res.status(200).json({ status: 'canceled' });
      }
    }

    // Receipt OCR processing (Images & PDFs)
    if (isImage || isPDF) {
      const typeLabel = isPDF ? 'PDF' : 'foto';
      await sendWhatsApp(phone, `🤖 *Processando seu comprovante (${typeLabel})...*`);
      const media = await downloadEvolutionMedia(message);
      if (!media) {
        await sendWhatsApp(phone, `❌ *Não consegui carregar o arquivo.*`);
        await supabase.from('whatsapp_drafts').delete().eq('user_id', userId).eq('data->>messageId', message.key.id);
        return res.status(200).json({ status: 'media_error' });
      }

      const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!geminiKey) throw new Error('GEMINI_API_KEY não configurada.');
      const ai = new GoogleGenAI({ apiKey: geminiKey });

      const userLists = await getUserLists(userId);

      let userCaptionContext = "";
      if (text) {
        userCaptionContext = `
        IMPORTANTE: O usuário enviou este comentário/texto junto com o arquivo: "${text}".
        Use esta informação como contexto prioritário para definir a descrição, estabelecimento, categoria, proprietário (owner_name/perfil) ou qualquer detalhe relevante da transação, especialmente se a imagem não estiver totalmente legível ou se o usuário estiver especificando do que se trata o gasto!
        `;
      }

      const ocrPrompt = isPDF ? `
      Você é um especialista em análise de comprovantes, faturas e extratos bancários em formato PDF.
      Analise o conteúdo deste documento e extraia todas as transações financeiras relevantes.
      ${userCaptionContext}

      IMPORTANTE sobre Cartão de Crédito:
      Se o comprovante ou contexto for de uma compra ou transação no cartão de crédito (ex: contém texto como 'compra aprovada no cartão', 'Bradesco Cartões', 'fatura', 'final XXXX', ou comprova pagamento feito com cartão), defina 'is_card': true e preencha 'card_name' com o nome do cartão de crédito correspondente (ex: 'Bradesco').

      IMPORTANTE sobre o Perfil (owner_name):
      O usuário possui os seguintes perfis (perfis adicionais/entidades) cadastrados: [${userLists.entitiesPromptList}].
      Se o comprovante ou o contexto indicar que a compra ou receita pertence a um destes perfis (ex: nome do portador do cartão ou beneficiário corresponder a um deles), preencha 'owner_name' com o nome correspondente exato do perfil da lista. Caso contrário ou por padrão, use 'Pessoal'.

      IMPORTANTE sobre a Data:
      O ano atual do sistema é 2026. Se o ano extraído do comprovante for muito no passado (ex: 2020) ou parecer conter um erro de leitura/digitação do ano, use o ano atual (2026) na data ("YYYY-MM-DD"), a menos que seja explicitamente um comprovante antigo de outro período.

      REGRA DE CORREÇÃO DE NOMES E CATEGORIAS:
      Mapeie a conta (account_name), cartão (card_name), categoria (category) e subcategoria (subcategory) extraídos estritamente para um dos itens cadastrados no banco de dados do usuário:
      - Contas (Bancos) Cadastradas: [${userLists.accountsPromptList}]
      - Cartões de Crédito Cadastrados: [${userLists.cardsPromptList}]
      - Categorias Cadastradas: [${userLists.categoriesPromptList}]
      - Subcategorias Cadastradas: [${userLists.subcategoriesPromptList}]

      RETORNE ESTRITAMENTE UM OBJETO JSON COM O FORMATO:
      {
        "operations": [
          {
            "description": "Nome do estabelecimento / identificação da transação",
            "amount": 0.00,
            "date": "YYYY-MM-DD",
            "category": "Alimentação | Transporte | Lazer | Lojas | Saúde | Outros",
            "subcategory": "Subcategoria específica baseada na categoria se houver (ex: Combustível para Transporte, Supermercado para Alimentação, ou null se não souber)",
            "type": "EXPENSE" | "INCOME",
            "is_card": boolean,
            "card_name": string (ou null),
            "account_name": "Nome da conta/banco caso o comprovante especifique de onde saiu o dinheiro, ex: Nubank, Itaú, Santander (ou null)",
            "owner_name": string (ou null),
            "notes": "Observações ou detalhes relevantes do comprovante (ou null)",
            "tags": [] (Sempre retorne um array vazio [] para tags nesta etapa. NUNCA gere ou invente tags por conta própria!)
          }
        ]
      }
      ` : `
      Você é um especialista em análise de comprovantes e notas fiscais de compras em imagem.
      Extraia todas as transações cruciais desta imagem.
      ${userCaptionContext}

      IMPORTANTE sobre Cartão de Crédito:
      Se a imagem ou contexto for de uma compra ou transação no cartão de crédito (ex: contém texto como 'compra aprovada no cartão', 'Bradesco Cartões', 'fatura', 'final XXXX', ou comprova pagamento feito com cartão), defina 'is_card': true e preencha 'card_name' com o nome do cartão de crédito correspondente (ex: 'Bradesco').

      IMPORTANTE sobre o Perfil (owner_name):
      O usuário possui os seguintes perfis (perfis adicionais/entidades) cadastrados: [${userLists.entitiesPromptList}].
      Se o comprovante ou o contexto indicar que a compra ou receita pertence a um destes perfis (ex: nome do portador do cartão ou beneficiário corresponder a um deles), preencha 'owner_name' com o nome correspondente exato do perfil da lista. Caso contrário ou por padrão, use 'Pessoal'.

      IMPORTANTE sobre a Data:
      O ano atual do sistema é 2026. Se o ano extraído do comprovante for muito no passado (ex: 2020) ou parecer conter um erro de leitura/digitação do ano, use o ano atual (2026) na data ("YYYY-MM-DD"), a menos que seja explicitamente um comprovante antigo de outro período.

      REGRA DE CORREÇÃO DE NOMES E CATEGORIAS:
      Mapeie a conta (account_name), cartão (card_name), categoria (category) e subcategoria (subcategory) extraídos estritamente para um dos itens cadastrados no banco de dados do usuário:
      - Contas (Bancos) Cadastradas: [${userLists.accountsPromptList}]
      - Cartões de Crédito Cadastrados: [${userLists.cardsPromptList}]
      - Categorias Cadastradas: [${userLists.categoriesPromptList}]
      - Subcategorias Cadastradas: [${userLists.subcategoriesPromptList}]

      RETORNE ESTRITAMENTE UM OBJETO JSON COM O FORMATO:
      {
        "operations": [
          {
            "description": "Nome do estabelecimento / loja",
            "amount": 0.00,
            "date": "YYYY-MM-DD",
            "category": "Alimentação | Transporte | Lazer | Lojas | Saúde | Outros",
            "subcategory": "Subcategoria específica baseada na categoria se houver (ex: Combustível para Transporte, Supermercado para Alimentação, ou null se não souber)",
            "type": "EXPENSE" | "INCOME",
            "is_card": boolean,
            "card_name": string (ou null),
            "account_name": "Nome da conta/banco caso o comprovante especifique de onde saiu o dinheiro, ex: Nubank, Itaú, Santander (ou null)",
            "owner_name": string (ou null),
            "notes": "Observações ou detalhes adicionais sobre o produto/compra (ou null)",
            "tags": [] (Sempre retorne um array vazio [] para tags nesta etapa. NUNCA gere ou invente tags por conta própria!)
          }
        ]
      }
      `;

      const cleanMimeType = media.mimeType.split(';')[0].trim();
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{
          parts: [
            { text: ocrPrompt },
            { inlineData: { data: media.base64, mimeType: cleanMimeType } }
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
      const ocrOps = ocrData.operations || [];

      if (ocrOps.length === 0) {
        throw new Error('Nenhuma transação detectada no comprovante.');
      }

      if (ocrOps.length === 1) {
        const singleTx = ocrOps[0];
        if (!singleTx.date) {
          singleTx.date = new Date().toISOString().split('T')[0];
        }
        
        const result = await executeDirectLaunch(userId, singleTx);
        await supabase.from('whatsapp_drafts').delete().eq('user_id', userId).eq('data->>messageId', message.key.id);
        
        const summaryText = formatDirectLaunchSummary(singleTx, result.accountName, result.isCard);
        await sendWhatsApp(phone, summaryText);
        return res.status(200).json({ status: 'file_processed_direct' });
      } else {
        const resolvedOps = ocrOps.map((op: any) => ({
          intent: 'TRANSACTION',
          transaction: {
            description: op.description,
            amount: Number(op.amount || 0),
            category: op.category || 'Outros',
            subcategory: op.subcategory || null,
            type: op.type || 'EXPENSE',
            date: op.date || new Date().toISOString().split('T')[0],
            is_card: op.is_card || false,
            card_name: op.card_name || null,
            account_name: op.account_name || null,
            owner_name: op.owner_name || 'Pessoal',
            notes: op.notes || '',
            tags: op.tags || []
          }
        }));

        const launchResults = [];
        for (const op of resolvedOps) {
          const result = await executeDirectLaunch(userId, op.transaction);
          launchResults.push({ tx: op.transaction, result });
        }
        
        await supabase.from('whatsapp_drafts').delete().eq('user_id', userId).eq('data->>messageId', message.key.id);
        
        let summaryMsg = `✅ *Múltiplos Lançamentos Cadastrados com Sucesso!* 🤖\n\nLancei as seguintes ações no seu FinVision:\n\n`;
        launchResults.forEach((lr: any, idx: number) => {
          const dateFmt = lr.tx.date ? lr.tx.date.split('-').reverse().join('/') : '';
          summaryMsg += `*${idx + 1}. Cadastrado:* "${lr.tx.description}" - R$ ${Number(lr.tx.amount).toFixed(2)} (${dateFmt}) na conta ${lr.result.accountName}\n`;
        });
        summaryMsg += `\n💡 *Dica:* Para corrigir ou excluir qualquer um deles, basta me dizer respondendo à respectiva linha!`;
        
        await sendWhatsApp(phone, summaryMsg);
        return res.status(200).json({ status: 'file_processed_multi_direct' });
      }
    }

    // Text parsing or query classification
    if (text) {
      // Check if there is an active pending draft
      let { data: activeDraft } = await supabase
        .from('whatsapp_drafts')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .neq('data->>type', 'lock')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Proactive Auto-Cleanup: Se o rascunho ativo tiver mais de 20 minutos, consideramos expirado (stale) e deletamos para não assombrar ou travar a conversa
      if (activeDraft) {
        const draftAgeMs = Date.now() - new Date(activeDraft.created_at).getTime();
        const twentyMinutesMs = 20 * 60 * 1000;
        if (draftAgeMs > twentyMinutesMs) {
          console.log('[WhatsApp Webhook] Rascunho pendente expirado (> 20 min). Deletando:', activeDraft.id);
          await supabase.from('whatsapp_drafts').delete().eq('id', activeDraft.id);
          activeDraft = null;
        }
      }

      const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!geminiKey) throw new Error('GEMINI_API_KEY não configurada.');
      const ai = new GoogleGenAI({ apiKey: geminiKey });

      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      // Buscar contas pendentes do usuário dos últimos 60 dias para dar contexto ao classificador (com cache de 2 minutos)
      let formattedPendingBills = '';
      const cachedBills = pendingBillsCache.get(userId);
      if (cachedBills && (nowTime - cachedBills.timestamp < 120000)) {
        formattedPendingBills = cachedBills.formattedPendingBills;
      } else {
        const { data: pendingBills } = await supabase
          .from('transactions')
          .select('id, description, amount, date, category')
          .eq('user_id', userId)
          .is('is_deleted', false)
          .eq('is_paid', false)
          .eq('type', 'EXPENSE')
          .gte('date', sixtyDaysAgo.toISOString().split('T')[0])
          .order('date', { ascending: true })
          .limit(20);

        formattedPendingBills = pendingBills && pendingBills.length > 0
          ? pendingBills.map(b => `- "${b.description}" | R$ ${Math.abs(Number(b.amount)).toFixed(2)} | Vencimento: ${b.date.split('T')[0].split('-').reverse().join('/')}`).join('\n')
          : 'Nenhuma conta pendente em aberto nos últimos 60 dias.';

        pendingBillsCache.set(userId, {
          timestamp: nowTime,
          formattedPendingBills
        });
      }

      // Verificar se o rascunho ativo é editável
      const isDraftEditable = activeDraft && activeDraft.data && 
        activeDraft.data.type !== 'delete_disambiguation' && 
        activeDraft.data.type !== 'pay_disambiguation' && 
        activeDraft.data.type !== 'multi' && 
        activeDraft.data.type !== 'delete' && 
        activeDraft.data.type !== 'pay';

      // Buscar contas, cartões, categorias, subcategorias e entidades do usuário do banco (com cache)
      const userLists = await getUserLists(userId);
      const accountsPromptList = userLists.accountsPromptList;
      const cardsPromptList = userLists.cardsPromptList;
      const categoriesPromptList = userLists.categoriesPromptList;
      const subcategoriesPromptList = userLists.subcategoriesPromptList;
      const entitiesPromptList = userLists.entitiesPromptList;

      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];

      const classificationPrompt = `
      Você é o cérebro central classificador da assistente FinVision AI.
      Sua tarefa é analisar a mensagem atual do usuário, considerando o histórico de conversa recente e as informações do sistema, para classificar as intenções dele com precisão cirúrgica de forma a realizar um processamento extremamente rápido.

      # INFORMAÇÕES DO SISTEMA
      - Hoje é ${now.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} (data do sistema: ${todayStr}).
      
      # RASCUNHO PENDENTE ATIVO NO MOMENTO (Se houver)
      Se houver um rascunho ativo, ele está listado abaixo. Analise se a mensagem atual do usuário é uma tentativa de editar, corrigir ou complementar este rascunho (ex: mudar o valor, a descrição, a categoria, o perfil ou a conta).
      Rascunho ativo: ${isDraftEditable ? JSON.stringify(activeDraft.data) : 'Nenhum rascunho ativo.'}

      IMPORTANTE sobre o Rascunho Ativo:
      - Se o usuário estiver editando o rascunho ativo (tentando complementar informações ou corrigir algo nele), defina "isEdit": true e retorne o rascunho atualizado no campo "updatedDraft", aplicando as alterações.
      - Se o usuário NÃO estiver editando (seja um novo lançamento independente, uma consulta, exclusão ou se ele quiser alterar uma transação já cadastrada no banco), defina "isEdit": false.

      # TRANSAÇÃO DA MENSAGEM CITADA/RESPONDIDA PELO USUÁRIO (Se houver)
      ${quotedTx ? `O usuário está respondendo diretamente (marcando/citando) a uma mensagem de confirmação para esta transação:
      - Descrição: "${quotedTx.description}"
      - Valor: R$ ${quotedTx.amount}
      - Data: ${quotedTx.date}
      Se o usuário pedir para alterar (UPDATE), marcar como paga (PAY) ou excluir (DELETE) e tiver respondido a essa mensagem, use estes dados para preencher os respectivos filtros (updateFilters, payFilters ou deleteFilters) com estes valores exatos!` : 'Nenhuma transação citada.'}

      # CONTAS PENDENTES EM ABERTO NO SISTEMA (Aguardando Pagamento/Baixa)
      Use esta lista para cruzar o pedido do usuário. Se ele pedir para pagar/quitar uma conta que combine com alguma destas descrições (por exemplo "pague a conta mensal mãe" ou "mensal mãe" combina com a conta "Mensal Mãe"), classifique a intenção como "PAY" (e não TRANSACTION) e preencha o "payFilters" correspondente:
      ${formattedPendingBills}

      # HISTÓRICO RECENTE DA CONVERSA
      ${history.slice(-6).map((h: any) => `${h.role === 'user' ? 'Usuário' : 'FinVision'}: ${h.content}`).join('\n')}

      # MENSAGEM ATUAL DO USUÁRIO
      Mensagem: "${text}"

      # REGRAS CRÍTICAS DE EXTRAÇÃO DE DADOS (WHATSAPP PREMIUM):
      1. PERFIL PADRÃO (owner_name): O perfil (proprietário) do lançamento deve padrão para "Pessoal" (owner_name: "Pessoal"). Mapeie o perfil informado pelo usuário estritamente para um dos perfis cadastrados no banco de dados dele descritos a seguir:
         - Perfis Cadastrados: [${entitiesPromptList}]
         O perfil só deve ser diferente de "Pessoal" se o usuário citar explicitamente um desses perfis cadastrados ou se o contexto (como o portador do cartão ou descrição) indicar fortemente um deles. Se não corresponder a nenhum, use "Pessoal". NUNCA extraia CNPJs, nomes de estabelecimentos ou nomes de bancos como perfil.
      2. OBSERVACÕES E TAGS: NÃO gere ou extraia tags ou observações contextuais a menos que o usuário peça explicitamente na mensagem (ex: se ele disse "gastei 50 no almoço com a equipe", coloque notes: "Almoço com a equipe" e tags: ["equipe"], mas se for apenas uma foto ou texto simples como "R$ 50 de combustível", retorne notes: null e tags: []).
      3. REGRA DE OURO PARA ATUALIZAÇÕES/EDIÇÕES (isEdit = true ou intent = UPDATE): No objeto "updatedDraft" (se isEdit for true) ou "updatePatch" (se intent for UPDATE), inclua APENAS as chaves dos campos que o usuário solicitou explicitamente alterar nesta mensagem atual (ex: se ele disse "muda o valor para 40", retorne apenas {"amount": 40} e deixe todos os outros campos como null ou omitidos). NUNCA envie valores padrões como "Outros" para a categoria ou "Pessoal" para o perfil se eles não foram alterados pelo usuário na mensagem atual, pois isso apagaria os dados já preenchidos no rascunho/lançamento anterior!
      4. BLINDAGEM CONTRA CONCORRENTES: \${COMPETITOR_RESTRICTION_PROMPT}
      5. REGRA DE CORREÇÃO DE ERROS DE DIGITAÇÃO E SINÔNIMOS:
         Mapeie a conta (account_name), cartão (card_name), categoria (category) e subcategoria (subcategory) informados pelo usuário estritamente para um dos itens cadastrados no banco de dados dele descritos a seguir:
         - Contas (Bancos) Cadastradas: [${accountsPromptList}]
         - Cartões de Crédito Cadastrados: [${cardsPromptList}]
         - Categorias Cadastradas: [${categoriesPromptList}]
         - Subcategorias Cadastradas: [${subcategoriesPromptList}]
         Se o usuário digitar com erro de ortografia, abreviação, capitalização diferente ou sinônimo (ex: 'Nubnk', 'roxinho' ou 'Nubanck' para 'Nubank'; 'alimentacao', 'Alimentacão' ou 'Comida' para 'Alimentação'; 'itauu' para 'Itaú'; 'Bradesc' para 'Bradesco'), você DEVE corrigir e retornar o nome EXATO correspondente cadastrado no sistema nos respectivos campos 'account_name', 'card_name', 'category', 'subcategory' ou em 'updatedDraft' / 'updatePatch'!
         Você deve fazer o mesmo para subcategories! Se a subcategoria puder ser mapeada para uma das subcategorias cadastradas (ex: 'Supermercado' ou 'Mercado' se houver 'Alimentação > Supermercado'), retorne apenas o nome exato da subcategoria (ex: 'Supermercado') no campo 'subcategory' ou em 'updatedDraft' / 'updatePatch'. Se o usuário solicitar uma subcategoria nova que não esteja na lista de subcategorias cadastradas (ex: "sub restaurante" ou "subcategoria almoço"), você DEVE retornar o nome da subcategoria solicitado pelo usuário (com a primeira letra maiúscula, ex: "Restaurante" ou "Almoço") no campo 'subcategory' ou em 'updatedDraft' / 'updatePatch', permitindo a criação de novas subcategorias.
      6. REGRA DE TRANSFERÊNCIAS:
         Sempre que o usuário informar uma transferência entre contas (ex: "transferi 500 do Itaú para o Bradesco" ou "transferência para Bradesco"), defina a "category" como "transferência". Mapeie a conta de débito (origem) no campo "account_name" (ex: "Itaú") e a conta de crédito (destino) no campo "destination_account_name" (ex: "Bradesco"), respeitando estritamente os nomes da lista de bancos do usuário. Se o usuário disser apenas "transferência para Bradesco", entenda que a origem é a conta padrão e o destino é Bradesco.
      7. REGRA DE RESPOSTA DE CONVERSA (CHAT):
         Se a intenção do usuário for CHAT (conversa casual, saudações, perguntas sobre quem você é ou como funciona, etc.), você DEVE gerar uma resposta completa, amigável, prestativa e sucinta no campo "chatReply" em português, usando o histórico recente para dar continuidade natural à conversa. Respeite sempre a BLINDAGEM CONTRA CONCORRENTES.
      8. REGRA DE FALTA DE FILTROS:
         Se o usuário pedir para alterar, corrigir ou excluir um lançamento, mas não descrever qual (ex: "deleta esse gasto", "altere o perfil para pessoal", "marca como paga"), classifique a intenção correspondente ("UPDATE", "PAY" ou "DELETE") e deixe os filtros em branco (valores nulos ou vazios no objeto de filtro), pois o sistema aplicará a alteração automaticamente na última transação lançada por ele.

      RETORNE ESTRITAMENTE UM OBJETO JSON COM O FORMATO:
      {
        "isEdit": boolean,
        "updatedDraft": {
          "description": string (ou null),
          "amount": number (ou null),
          "date": "YYYY-MM-DD" (ou null),
          "category": string (ou null),
          "subcategory": string (ou null),
          "type": "EXPENSE" | "INCOME" (ou null),
          "is_card": boolean (ou null),
          "card_name": string (ou null),
          "owner_name": string (ou null),
          "account_name": string (ou null),
          "destination_account_name": string (ou null),
          "is_recurring": boolean (ou null),
          "recurrence_period": string (ou null),
          "notes": string (ou null),
          "tags": array de strings (ou null)
        } (ou null se isEdit for false),
        "operations": [
          {
            "intent": "TRANSACTION" | "DELETE" | "PAY" | "QUERY" | "CHAT" | "UPDATE",
            "startDate": "YYYY-MM-DD",
            "endDate": "YYYY-MM-DD",
            "periodLabel": "Texto curto do período",
            "transaction": {
              "description": "Ex: Mercado Extra, Posto Ipiranga",
              "amount": 0.00,
              "category": "Alimentação | Transporte | Moradia | Saúde | Lazer | Salário | transferência | Outros",
              "subcategory": "Subcategoria específica baseada na categoria se houver (ex: Combustível para Transporte, Supermercado para Alimentação, ou null se não souber)",
              "type": "EXPENSE" | "INCOME",
              "date": "YYYY-MM-DD",
              "is_card": boolean,
              "card_name": string (ou null),
              "account_name": "Nome da conta/banco caso o usuário especifique (ex: Nubank, Itaú, ou null)",
              "destination_account_name": "Nome da conta/banco de destino caso seja uma transferência (ex: Bradesco, Itaú, ou null)",
              "owner_name": "Pessoal",
              "is_recurring": boolean,
              "recurrence_period": "weekly" | "monthly" | "yearly" | "biweekly" (ou null),
              "notes": string (ou null),
              "tags": array de strings (ex: [] se não solicitado)
            },
            "deleteFilters": {
              "description": "Ex: mercado (termo de busca ou null)",
              "amount": 50.00 (ou null),
              "date": "YYYY-MM-DD (ou null)"
            },
            "payFilters": {
              "description": "Ex: energia (termo de busca ou null)",
              "amount": 120.00 (ou null),
              "date": "YYYY-MM-DD (ou null - data de vencimento para busca, não filtrar por data quando não informada)",
              "payDate": "YYYY-MM-DD (ou null - data em que o usuário diz que pagou, ex: 'hoje', 'ontem', 'dia 20')",
              "accountName": "Nome da conta/banco usado no pagamento, ex: Nubank, Bradesco (ou null se não informado)"
            },
            "updateFilters": {
              "description": "Ex: mercado (termo de busca para achar o lançamento, ou null)",
              "amount": 50.00 (ou null),
              "date": "YYYY-MM-DD (ou null)"
            },
            "updatePatch": {
              "description": string (ou null),
              "amount": number (ou null),
              "date": "YYYY-MM-DD" (ou null),
              "category": string (ou null),
              "subcategory": string (ou null),
              "is_card": boolean (ou null),
              "card_name": string (ou null),
              "account_name": string (ou null),
              "destination_account_name": string (ou null),
              "owner_name": string (ou null),
              "notes": string (ou null),
              "tags": array de strings (ou null)
            },
            "chatReply": "Resposta caso seja intenção CHAT"
          }
        ] (ou vazio se isEdit for true)
      }

      Regras de classificação e cálculo de datas para operações (QUERY/PAY/DELETE/UPDATE):
      - Se a operação envolver busca de histórico de lançamentos, saldo ou consolidações (intent = QUERY), calcule e preencha "startDate" e "endDate" baseados no período solicitado pelo usuário:
        1. Se ele pedir "dois últimos meses" ou "últimos 2 meses", partindo de hoje (${todayStr}), defina o início retrocedendo 2 meses completos (ex: 2026-03-01) e fim hoje (2026-05-25).
        2. Se ele pedir "mês passado", calcule o início e fim exatos do mês anterior completo.
        3. Se ele NÃO especificar nenhum período de data, use por padrão os últimos 90 dias (início: ${sixtyDaysAgo.toISOString().split('T')[0]}, fim: ${todayStr}).
        4. Se ele pedir um período muito amplo (ex: "meu histórico inteiro", "desde o começo"), use os últimos 365 dias.
      - Para intenções TRANSACTION ("gastei X", "recebi Y"): se não houver data explícita, use hoje: ${todayStr}.
      - Para intenções PAY ("paguei X", "quitei X", "baixar X"): se o usuário mencionar quando pagou (ex: "hoje", "ontem", "dia 20"), extraia essa data em "payFilters.payDate". Se não mencionar data de pagamento explícita, deixe "payFilters.payDate" como null (o sistema usará a data atual). IMPORTANTE: não use "payDate" como filtro de busca; para buscar o lançamento, use apenas "payFilters.description" e "payFilters.amount".
      - Se o usuário falar de cartão de crédito (ex: "no cartão Bradesco", "Bradesco Cartões") ou o contexto/mensagem se referir a transações no cartão, defina "is_card": true e o nome do cartão em "card_name".
      - Se o usuário citar recorrência (ex: "mensal", "todo mês"), defina "is_recurring": true e o período correspondente.
      - Se for excluir um lançamento, use "DELETE" e preencha "deleteFilters".
      - Se for marcar como pago, use "PAY" e preencha "payFilters".
      - Se for alterar/corrigir um lançamento existente, use "UPDATE", preencha "updateFilters" e as alterações desejadas em "updatePatch".
      - Se for consulta de dados ("saldo", "gastos do mês", "quais os lançamentos"), use "QUERY".
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

      // 1. Processar Edição de Rascunho
      if (analysis.isEdit && analysis.updatedDraft && isDraftEditable) {
        const existingData = activeDraft.data || {};
        const draftToUpdate = { ...existingData };
        
        if (existingData.type === 'update') {
          draftToUpdate.patch = draftToUpdate.patch || {};
          for (const key of Object.keys(analysis.updatedDraft)) {
            const newVal = analysis.updatedDraft[key];
            if (newVal !== null && newVal !== undefined) {
              draftToUpdate.patch[key] = newVal;
            }
          }
        } else {
          // Merge keeping fields unless explicitly overridden in the current analysis
          for (const key of Object.keys(analysis.updatedDraft)) {
            const newVal = analysis.updatedDraft[key];
            if (newVal !== null && newVal !== undefined) {
              draftToUpdate[key] = newVal;
            }
          }
        }

        if (!draftToUpdate.date) {
          draftToUpdate.date = activeDraft.data.date || new Date().toISOString().split('T')[0];
        }
        await supabase
          .from('whatsapp_drafts')
          .update({
            data: { ...draftToUpdate, messageId: activeDraft.data.messageId }
          })
          .eq('id', activeDraft.id);

        if (draftToUpdate.type === 'update') {
          const dateFmt = draftToUpdate.date ? draftToUpdate.date.split('T')[0].split('-').reverse().join('/') : '';
          const patch = draftToUpdate.patch || {};
          let changesMsg = `📝 *Confirmação de Alteração Atualizada!* 🔄\n\nVocê está alterando o lançamento:\n*${draftToUpdate.description}* - R$ ${Number(draftToUpdate.amount).toFixed(2)} (${dateFmt}).\n\n*Alterações propostas:*`;
          if (patch.description) changesMsg += `\n└─ Nova Descrição: "${patch.description}"`;
          if (patch.amount) changesMsg += `\n└─ Novo Valor: R$ ${Number(patch.amount).toFixed(2)}`;
          if (patch.category) changesMsg += `\n└─ Nova Categoria: ${patch.category}`;
          if (patch.subcategory) changesMsg += `\n└─ Nova Subcategoria: ${patch.subcategory}`;
          if (patch.date) changesMsg += `\n└─ Nova Data: ${patch.date.split('-').reverse().join('/')}`;
          if (patch.account_name) changesMsg += `\n└─ Novo Banco Origem: ${patch.account_name}`;
          if (patch.destination_account_name) changesMsg += `\n└─ Novo Banco Destino: ${patch.destination_account_name}`;
          if (patch.owner_name) changesMsg += `\n└─ Novo Perfil: ${patch.owner_name}`;
          if (patch.notes) changesMsg += `\n└─ Novas Observações: ${patch.notes}`;
          if (patch.tags && patch.tags.length > 0) changesMsg += `\n└─ Novas Tags: ${patch.tags.join(', ')}`;

          changesMsg += `\n\nConfirma as alterações acima? Digite *SIM* ou *NÃO*.`;
          await sendWhatsApp(phone, changesMsg);
        } else {
          const confirmText = formatDraftConfirmation(draftToUpdate, true);
          await sendWhatsApp(phone, confirmText);
        }

        // Deletar o lock para a mensagem atual
        await supabase
          .from('whatsapp_drafts')
          .delete()
          .eq('user_id', userId)
          .eq('data->>messageId', message.key.id);

        return res.status(200).json({ status: 'draft_updated' });
      }

      // 2. Processar Operações Normais
      const operations = analysis.operations || [];

      if (operations.length === 0) {
        await supabase.from('whatsapp_drafts').delete().eq('user_id', userId).eq('data->>messageId', message.key.id);
        return res.status(200).json({ status: 'no_operations_detected' });
      }

      const immediateOps = operations.filter((op: any) => op.intent === 'QUERY' || op.intent === 'CHAT');
      const writeOps = operations.filter((op: any) => op.intent === 'TRANSACTION' || op.intent === 'DELETE' || op.intent === 'PAY' || op.intent === 'UPDATE');

      // Process immediate operations
      for (const op of immediateOps) {
        if (op.intent === 'QUERY') {
          await sendWhatsApp(phone, `📊 *Analisando seus dados financeiros em tempo real...*`);
          await handleInteractiveFinancialQuery(userId, text, phone, history, {
            startDate: op.startDate,
            endDate: op.endDate,
            periodLabel: op.periodLabel
          });
        } else if (op.intent === 'CHAT') {
          let chatReply = op.chatReply;
          
          if (!chatReply) {
            const systemPromptChat = `
            Você é a FinVision AI, a Assistente Financeira Premium do software FinVision Pro.
            Seu tom de voz deve ser de especialista, extremamente educado, curto e sucinto. Use emojis úteis.
            Use formatações em negrito do WhatsApp (*texto*).
            Seja amigável e utilize o histórico da conversa para responder de forma contínua e natural.

            RESTRIÇÃO IMPORTANTE DE CONCORRENTES: \${COMPETITOR_RESTRICTION_PROMPT}
            `;

            const chatContents = history.map((h: any) => ({
              role: h.role === 'user' ? 'user' : 'model',
              parts: [{ text: h.content }]
            }));

            // Adicionar a mensagem de chat atual do usuário
            chatContents.push({
              role: 'user',
              parts: [{ text: text }]
            });

            const chatResponse = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: chatContents,
              config: {
                systemInstruction: systemPromptChat,
                temperature: 0.7,
              }
            });

            chatReply = (chatResponse as any).text || (chatResponse as any).candidates?.[0]?.content?.parts?.[0]?.text || 'Olá! Sou a FinVision AI. Como posso te ajudar com suas finanças hoje?';
          }

          await sendWhatsApp(phone, chatReply);

          // Salvar a pergunta do usuário e a resposta no histórico de chat
          history.push({ role: 'user', content: text });
          history.push({ role: 'model', content: chatReply });
          await supabase.from('whatsapp_chat_sessions').upsert({
            phone: phone,
            messages: history,
            updated_at: new Date().toISOString()
          }, { onConflict: 'phone' });
        }
      }

      // If there are no write operations, we are done (clean lock and exit)
      if (writeOps.length === 0) {
        await supabase.from('whatsapp_drafts').delete().eq('user_id', userId).eq('data->>messageId', message.key.id);
        return res.status(200).json({ status: 'immediate_operations_processed' });
      }

      // Exact 1 write operation
      if (writeOps.length === 1) {
        const op = writeOps[0];

        // VERIFICAÇÃO PROATIVA DE PAGAMENTO (Auto-correção se a IA classificar "pague X" como TRANSACTION com valor zerado)
        if (op.intent === 'TRANSACTION') {
          const tx = op.transaction;
          const textLower = text.toLowerCase();
          const isPayIntent = textLower.includes('pague') || textLower.includes('pagar') || textLower.includes('quitar') || textLower.includes('baixar') || textLower.includes('liquida') || textLower.includes('venci');
          
          if ((tx.amount === 0 || isPayIntent) && tx.description) {
            const filters = { description: tx.description };
            const pendingMatches = await findMatchingTransactions(userId, filters, true);
            if (pendingMatches.length === 1) {
              console.log('[WhatsApp Webhook] Conversão Proativa: Convertendo TRANSACTION para PAY da conta:', pendingMatches[0].description);
              op.intent = 'PAY';
              op.payFilters = {
                description: pendingMatches[0].description,
                amount: pendingMatches[0].amount,
                date: pendingMatches[0].date
              };
            }
          }
        }

        if (op.intent === 'TRANSACTION') {
          const tx = op.transaction;
          if (!tx.date) {
            tx.date = new Date().toISOString().split('T')[0];
          }

          const isTransfer = (tx.category || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('transfer') || tx.type === 'TRANSFER';
          
          if (isTransfer) {
            const { data: userAccounts } = await supabase.from('accounts').select('id, institution').eq('user_id', userId).eq('is_archived', false);
            let finalDestAccountId = null;
            if (tx.destination_account_name && userAccounts) {
              const matchedDest = userAccounts.find(a => 
                a.institution.toLowerCase().includes(tx.destination_account_name.toLowerCase()) ||
                tx.destination_account_name.toLowerCase().includes(a.institution.toLowerCase())
              );
              if (matchedDest) finalDestAccountId = matchedDest.id;
            }
            
            if (!finalDestAccountId) {
              // Create draft instead of direct launching
              await supabase.from('whatsapp_drafts').update({
                data: {
                  ...tx,
                  type: 'transaction',
                  messageId: message.key.id
                },
                status: 'pending'
              }).eq('user_id', userId).eq('data->>messageId', message.key.id);

              const accountsPromptList = userAccounts ? userAccounts.map(a => a.institution).join(', ') : 'Nenhuma cadastrada';
              await sendWhatsApp(phone, `⚠️ *Atenção:* Este lançamento foi identificado como uma transferência, mas a *Conta de Destino* não foi informada ou não foi encontrada nas suas contas cadastradas: [${accountsPromptList}].\n\nPor favor, me diga qual é a conta de destino (ex: *\"destino Bradesco\"*, *\"para o Itaú\"*) antes de confirmar!`);
              return res.status(200).json({ status: 'transfer_draft_created_needs_destination' });
            }
          }
          
          const dupDate = tx.date || new Date().toISOString().split('T')[0];
          const duplicate = tx.amount && tx.description ? await findRecentDuplicate(userId, tx.description, Number(tx.amount), dupDate) : null;
          if (duplicate) {
            await sendWhatsApp(phone, `⚠️ *Parece que você já lançou este gasto!*\n\n"${duplicate.description}" de R$ ${Number(duplicate.amount).toFixed(2)} foi cadastrado há menos de 5 minutos.\n\nDeseja lançar *novamente* mesmo assim? Digite *SIM* para confirmar ou *NÃO* para cancelar.`);
            await supabase.from('whatsapp_drafts').update({ data: { ...tx, type: 'transaction', messageId: message.key.id }, status: 'pending' }).eq('user_id', userId).eq('data->>messageId', message.key.id);
            return res.status(200).json({ status: 'duplicate_warning' });
          }

          const result = await executeDirectLaunch(userId, tx);
          await supabase.from('whatsapp_drafts').delete().eq('user_id', userId).eq('data->>messageId', message.key.id);

          const summaryText = formatDirectLaunchSummary(tx, result.accountName, result.isCard);
          await sendWhatsApp(phone, summaryText);
          sendReaction(message.key, '✅').catch(() => {});
          return res.status(200).json({ status: 'transaction_direct_launched' });
        }

        if (op.intent === 'DELETE') {
          const filters = op.deleteFilters || {};
          let matchedTx: any = null;

          if (quotedTx && quotedTx.description) {
            const matches = await findMatchingTransactions(userId, {
              description: quotedTx.description,
              amount: quotedTx.amount || undefined,
              date: quotedTx.date || undefined
            }, false);
            if (matches.length > 0) {
              matchedTx = matches[0];
            }
          }

          if (!matchedTx && !filters.description && !filters.amount && !filters.date) {
            matchedTx = await getLastLaunchedTransaction(userId);
          }

          const matches = matchedTx ? [matchedTx] : await findMatchingTransactions(userId, filters, false);

          if (matches.length === 0) {
            await sendWhatsApp(phone, `❌ *Não encontrei nenhum lançamento recente correspondente* para exclusão.`);
            await supabase.from('whatsapp_drafts').delete().eq('user_id', userId).eq('data->>messageId', message.key.id);
            return res.status(200).json({ status: 'delete_no_match' });
          }

          if (matches.length === 1) {
            const matchedTx = matches[0];
            await supabase
              .from('whatsapp_drafts')
              .update({
                data: {
                  type: 'delete',
                  transactionId: matchedTx.id,
                  description: matchedTx.description,
                  amount: matchedTx.amount,
                  date: matchedTx.date,
                  is_card: !!matchedTx.is_card,
                  messageId: message.key.id
                },
                status: 'pending'
              })
              .eq('user_id', userId)
              .eq('data->>messageId', message.key.id);

            const dateFmt = matchedTx.date ? matchedTx.date.split('T')[0].split('-').reverse().join('/') : '';
            await sendWhatsApp(phone, `📝 *Confirmação de Exclusão!* 🗑️\n\nEncontrei the lançamento:\n*Descrição:* ${matchedTx.description}\n*Valor:* R$ ${Number(matchedTx.amount).toFixed(2)}\n*Data:* ${dateFmt}\n\nConfirma a exclusão deste lançamento? Digite *SIM* ou *NÃO*.`);
            return res.status(200).json({ status: 'delete_draft_created' });
          }

          // Multiple matches -> Disambiguation
          await supabase
            .from('whatsapp_drafts')
            .update({
              data: {
                type: 'delete_disambiguation',
                candidates: matches.map(m => ({ id: m.id, description: m.description, amount: m.amount, date: m.date, is_card: !!m.is_card })),
                messageId: message.key.id
              },
              status: 'pending'
            })
            .eq('user_id', userId)
            .eq('data->>messageId', message.key.id);

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
          let matchedTx: any = null;

          if (quotedTx && quotedTx.description) {
            const matches = await findMatchingTransactions(userId, {
              description: quotedTx.description,
              amount: quotedTx.amount || undefined,
              date: quotedTx.date || undefined
            }, true);
            if (matches.length > 0) {
              matchedTx = matches[0];
            }
          }

          if (!matchedTx && !filters.description && !filters.amount && !filters.date) {
            matchedTx = await getLastLaunchedPendingTransaction(userId);
          }

          const matches = matchedTx ? [matchedTx] : await findMatchingTransactions(userId, filters, true);

          if (matches.length === 0) {
            const noMatchMsg = `❌ *Não encontrei nenhuma conta pendente correspondente* para marcar como paga.`;
            await sendWhatsApp(phone, noMatchMsg);
            history.push({ role: 'user', content: text });
            history.push({ role: 'model', content: noMatchMsg });
            await supabase.from('whatsapp_chat_sessions').upsert({ phone, messages: history.slice(-30), updated_at: new Date().toISOString() }, { onConflict: 'phone' });
            await supabase.from('whatsapp_drafts').delete().eq('user_id', userId).eq('data->>messageId', message.key.id);
            return res.status(200).json({ status: 'pay_no_match' });
          }

          if (matches.length === 1) {
            const matchedTx = matches[0];
            const payDate = filters.payDate || todayStr;
            const payAccountName = filters.accountName || null;
            await supabase
              .from('whatsapp_drafts')
              .update({
                data: {
                  type: 'pay',
                  transactionId: matchedTx.id,
                  description: matchedTx.description,
                  amount: matchedTx.amount,
                  date: matchedTx.date,
                  payDate,
                  accountName: payAccountName,
                  messageId: message.key.id
                },
                status: 'pending'
              })
              .eq('user_id', userId)
              .eq('data->>messageId', message.key.id);

            const dateFmt = matchedTx.date ? matchedTx.date.split('T')[0].split('-').reverse().join('/') : '';
            const payDateFmt = payDate.split('-').reverse().join('/');
            const dueLine = dateFmt && dateFmt !== payDateFmt ? `\n*Vencimento:* ${dateFmt}` : '';
            const accountLine = payAccountName ? `\n*Conta usada:* ${payAccountName}` : '';
            const confirmMsg = `📝 *Confirmação de Pagamento!* 💵\n\nEncontrei a conta pendente:\n*Descrição:* ${matchedTx.description}\n*Valor:* R$ ${Number(matchedTx.amount).toFixed(2)}${dueLine}\n*Data de pagamento:* ${payDateFmt}${accountLine}\n\nConfirma o pagamento desta conta? Digite *SIM* ou *NÃO*.`;
            await sendWhatsApp(phone, confirmMsg);
            history.push({ role: 'user', content: text });
            history.push({ role: 'model', content: confirmMsg });
            await supabase.from('whatsapp_chat_sessions').upsert({ phone, messages: history.slice(-30), updated_at: new Date().toISOString() }, { onConflict: 'phone' });
            return res.status(200).json({ status: 'pay_draft_created' });
          }

          // Multiple matches -> Disambiguation
          await supabase
            .from('whatsapp_drafts')
            .update({
              data: {
                type: 'pay_disambiguation',
                candidates: matches.map(m => ({ id: m.id, description: m.description, amount: m.amount, date: m.date })),
                payDate: filters.payDate || todayStr,
                messageId: message.key.id
              },
              status: 'pending'
            })
            .eq('user_id', userId)
            .eq('data->>messageId', message.key.id);

          let listMsg = `🔍 *Encontrei múltiplas contas pendentes parecidas.* Qual deseja marcar como paga? Digite o número:\n\n`;
          matches.forEach((m, idx) => {
            const dateFmt = m.date ? m.date.split('T')[0].split('-').reverse().join('/') : '';
            listMsg += `*${idx + 1}.* ${m.description} - R$ ${Number(m.amount).toFixed(2)} (${dateFmt})\n`;
          });
          listMsg += `\nDigite *CANCELAR* para desistir.`;

          await sendWhatsApp(phone, listMsg);
          return res.status(200).json({ status: 'pay_disambiguation' });
        }

        if (op.intent === 'UPDATE') {
          const filters = op.updateFilters || {};
          let matchedTx: any = null;

          if (quotedTx && quotedTx.description) {
            const matches = await findMatchingTransactions(userId, {
              description: quotedTx.description,
              amount: quotedTx.amount || undefined,
              date: quotedTx.date || undefined
            }, false);
            if (matches.length > 0) {
              matchedTx = matches[0];
            }
          }

          if (!matchedTx) {
            if (!filters.description && !filters.amount && !filters.date) {
              matchedTx = await getLastLaunchedTransaction(userId);
            } else {
              const matches = await findMatchingTransactions(userId, filters, false);
              if (matches.length === 1) {
                matchedTx = matches[0];
              } else if (matches.length > 1) {
              await supabase
                .from('whatsapp_drafts')
                .update({
                  data: {
                    type: 'update_disambiguation',
                    candidates: matches.map(m => ({ id: m.id, description: m.description, amount: m.amount, date: m.date })),
                    patch: op.updatePatch,
                    messageId: message.key.id
                  },
                  status: 'pending'
                })
                .eq('user_id', userId)
                .eq('data->>messageId', message.key.id);

              let listMsg = `🔍 *Encontrei múltiplos lançamentos parecidos.* Qual deseja alterar? Digite o número:\n\n`;
              matches.forEach((m, idx) => {
                const dateFmt = m.date ? m.date.split('T')[0].split('-').reverse().join('/') : '';
                listMsg += `*${idx + 1}.* ${m.description} - R$ ${Number(m.amount).toFixed(2)} (${dateFmt})\n`;
              });
              listMsg += `\nDigite *CANCELAR* para desistir.`;

              await sendWhatsApp(phone, listMsg);
              return res.status(200).json({ status: 'update_disambiguation' });
            }
          }
          }

          if (!matchedTx) {
            await sendWhatsApp(phone, `❌ *Não encontrei nenhum lançamento recente correspondente* para alteração.`);
            await supabase.from('whatsapp_drafts').delete().eq('user_id', userId).eq('data->>messageId', message.key.id);
            return res.status(200).json({ status: 'update_no_match' });
          }

          await supabase
            .from('whatsapp_drafts')
            .update({
              data: {
                type: 'update',
                transactionId: matchedTx.id,
                description: matchedTx.description,
                amount: matchedTx.amount,
                date: matchedTx.date,
                isCard: matchedTx.isCard || false,
                patch: op.updatePatch,
                messageId: message.key.id
              },
              status: 'pending'
            })
            .eq('user_id', userId)
            .eq('data->>messageId', message.key.id);

          const dateFmt = matchedTx.date ? matchedTx.date.split('T')[0].split('-').reverse().join('/') : '';
          const patch = op.updatePatch || {};
          let changesMsg = `📝 *Confirmação de Alteração!* 🔄\n\nVocê está alterando o lançamento:\n*${matchedTx.description}* - R$ ${Number(matchedTx.amount).toFixed(2)} (${dateFmt}).\n\n*Alterações propostas:*`;
          if (patch.description) changesMsg += `\n└─ Nova Descrição: "${patch.description}"`;
          if (patch.amount) changesMsg += `\n└─ Novo Valor: R$ ${Number(patch.amount).toFixed(2)}`;
          if (patch.category) changesMsg += `\n└─ Nova Categoria: ${patch.category}`;
          if (patch.subcategory) changesMsg += `\n└─ Nova Subcategoria: ${patch.subcategory}`;
          if (patch.date) changesMsg += `\n└─ Nova Data: ${patch.date.split('-').reverse().join('/')}`;
          if (patch.account_name) changesMsg += `\n└─ Novo Banco Origem: ${patch.account_name}`;
          if (patch.destination_account_name) changesMsg += `\n└─ Novo Banco Destino: ${patch.destination_account_name}`;
          if (patch.owner_name) changesMsg += `\n└─ Novo Perfil: ${patch.owner_name}`;
          if (patch.notes) changesMsg += `\n└─ Novas Observações: ${patch.notes}`;
          if (patch.tags && patch.tags.length > 0) changesMsg += `\n└─ Novas Tags: ${patch.tags.join(', ')}`;

          changesMsg += `\n\nConfirma as alterações acima? Digite *SIM* ou *NÃO*.`;
          await sendWhatsApp(phone, changesMsg);
          return res.status(200).json({ status: 'update_draft_created' });
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
            let matchedTx: any = null;
            if (quotedTx && quotedTx.description) {
              const qMatches = await findMatchingTransactions(userId, {
                description: quotedTx.description,
                amount: quotedTx.amount || undefined,
                date: quotedTx.date || undefined
              }, false);
              if (qMatches.length > 0) matchedTx = qMatches[0];
            }
            if (!matchedTx && !filters.description && !filters.amount && !filters.date) {
              matchedTx = await getLastLaunchedTransaction(userId);
            }
            const matches = matchedTx ? [matchedTx] : await findMatchingTransactions(userId, filters, false);
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
            let matchedTx: any = null;
            if (quotedTx && quotedTx.description) {
              const qMatches = await findMatchingTransactions(userId, {
                description: quotedTx.description,
                amount: quotedTx.amount || undefined,
                date: quotedTx.date || undefined
              }, true);
              if (qMatches.length > 0) matchedTx = qMatches[0];
            }
            if (!matchedTx && !filters.description && !filters.amount && !filters.date) {
              matchedTx = await getLastLaunchedPendingTransaction(userId);
            }
            const matches = matchedTx ? [matchedTx] : await findMatchingTransactions(userId, filters, true);
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
          } else if (op.intent === 'UPDATE') {
            const filters = op.updateFilters || {};
            let matchedTx: any = null;
            if (quotedTx && quotedTx.description) {
              const qMatches = await findMatchingTransactions(userId, {
                description: quotedTx.description,
                amount: quotedTx.amount || undefined,
                date: quotedTx.date || undefined
              }, false);
              if (qMatches.length > 0) matchedTx = qMatches[0];
            }
            if (!matchedTx) {
              if (!filters.description && !filters.amount && !filters.date) {
                matchedTx = await getLastLaunchedTransaction(userId);
              } else {
                const matches = await findMatchingTransactions(userId, filters, false);
                if (matches.length === 1) {
                  matchedTx = matches[0];
                } else if (matches.length > 1) {
                  disambigOps.push({ op, matches });
                }
              }
            }

            if (matchedTx) {
              resolvedOps.push({
                intent: 'UPDATE',
                transactionId: matchedTx.id,
                description: matchedTx.description,
                amount: matchedTx.amount,
                date: matchedTx.date,
                isCard: matchedTx.isCard || false,
                patch: op.updatePatch
              });
            } else {
              await sendWhatsApp(phone, `⚠️ *Não encontrei correspondência para alterar:* "${filters.description || ''}"`);
            }
          }
        }

        // Halt if disambiguation is required
        if (disambigOps.length > 0) {
          const firstDisambig = disambigOps[0];
          const matches = firstDisambig.matches;
          const isPay = firstDisambig.op.intent === 'PAY';
          const isUpdate = firstDisambig.op.intent === 'UPDATE';

          let typeVal = 'delete_disambiguation';
          if (isPay) typeVal = 'pay_disambiguation';
          if (isUpdate) typeVal = 'update_disambiguation';

          await supabase
            .from('whatsapp_drafts')
            .update({
              data: {
                type: typeVal,
                candidates: matches.map(m => ({ id: m.id, description: m.description, amount: m.amount, date: m.date })),
                patch: firstDisambig.op.updatePatch || null,
                messageId: message.key.id
              },
              status: 'pending'
            })
            .eq('user_id', userId)
            .eq('data->>messageId', message.key.id);

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
          const hasOnlyTransactions = resolvedOps.every(op => op.intent === 'TRANSACTION');
          if (hasOnlyTransactions) {
            const launchResults = [];
            for (const op of resolvedOps) {
              const result = await executeDirectLaunch(userId, op.transaction);
              launchResults.push({ tx: op.transaction, result });
            }
            await supabase.from('whatsapp_drafts').delete().eq('user_id', userId).eq('data->>messageId', message.key.id);
            
            let summaryMsg = `✅ *Múltiplos Lançamentos Cadastrados com Sucesso!* 🤖\n\nLancei as seguintes ações no seu FinVision:\n\n`;
            launchResults.forEach((lr: any, idx: number) => {
              const dateFmt = lr.tx.date ? lr.tx.date.split('-').reverse().join('/') : '';
              summaryMsg += `*${idx + 1}. Cadastrado:* "${lr.tx.description}" - R$ ${Number(lr.tx.amount).toFixed(2)} (${dateFmt}) na conta ${lr.result.accountName}\n`;
            });
            summaryMsg += `\n💡 *Dica:* Para corrigir ou excluir qualquer um deles, basta me responder marcando a respectiva linha ou dizendo o que corrigir!`;
            await sendWhatsApp(phone, summaryMsg);
            return res.status(200).json({ status: 'multi_transaction_direct_launched' });
          }

          await supabase
            .from('whatsapp_drafts')
            .update({
              data: {
                type: 'multi',
                operations: resolvedOps,
                messageId: message.key.id
              },
              status: 'pending'
            })
            .eq('user_id', userId)
            .eq('data->>messageId', message.key.id);

          let summaryMsg = `📝 *Lote de Operações Criado via IA!* 🤖\n\nEntendi que deseja executar as seguintes ações:\n\n`;
          resolvedOps.forEach((op, idx) => {
            if (op.intent === 'TRANSACTION') {
              summaryMsg += `*${idx + 1}. Cadastrar:* "${op.transaction.description}" - R$ ${Number(op.transaction.amount).toFixed(2)}\n`;
            } else if (op.intent === 'DELETE') {
              summaryMsg += `*${idx + 1}. Excluir:* "${op.description}" - R$ ${Number(op.amount).toFixed(2)}\n`;
            } else if (op.intent === 'PAY') {
              summaryMsg += `*${idx + 1}. Marcar Paga:* "${op.description}" - R$ ${Number(op.amount).toFixed(2)}\n`;
            } else if (op.intent === 'UPDATE') {
              summaryMsg += `*${idx + 1}. Alterar:* "${op.description}" - R$ ${Number(op.amount).toFixed(2)}\n`;
            }
          });
          summaryMsg += `\nConfirma a execução de todas as operações acima? Digite *SIM* ou *NÃO*.`;

          await sendWhatsApp(phone, summaryMsg);
          return res.status(200).json({ status: 'multi_draft_created' });
        }
      }
    }

    // Clean up current lock row if it was just a lock at the end
    await supabase
      .from('whatsapp_drafts')
      .delete()
      .eq('user_id', userId)
      .eq('data->>messageId', message.key.id)
      .eq('data->>type', 'lock');

    return res.status(200).json({ status: 'no_action' });
  } catch (err: any) {
    console.error('Error handling whatsapp webhook:', err);
    
    // Tratamento amigável de erro de cota ou indisponibilidade da IA
    try {
      const errStr = String(err.message || err.status || '').toLowerCase();
      const isQuota = errStr.includes('quota') || errStr.includes('limit') || errStr.includes('429') || errStr.includes('exhausted');
      
      if (isQuota) {
        await sendWhatsApp(phone, `⚠️ *FinVision AI - Limite Temporário Atingido* 🤖\n\nNotamos que sua assistente inteligente excedeu o limite temporário de consultas da inteligência artificial (Cota da API do Google).\n\n⚡ *Como resolver:* de forma a garantir a velocidade e disponibilidade total, pedimos que aguarde cerca de *1 minuto* e tente novamente. Caso persistir, isso indica que a cota diária gratuita da API foi atingida. Nosso time já está monitorando para ampliar os recursos!`);
      } else {
        await sendWhatsApp(phone, `❌ *Ops! Tivemos um probleminha técnico.* 🤖\n\nNão consegui processar o seu comando neste momento devido a uma instabilidade temporária na comunicação com nossos servidores de inteligência artificial.\n\nPor favor, tente falar novamente em alguns instantes.`);
      }
    } catch (sendErr) {
      console.error('Erro ao enviar mensagem de fallback de erro:', sendErr);
    }

    return res.status(200).json({ error: err.message });
  } finally {
    if (userId) {
      await supabase
        .from('whatsapp_drafts')
        .delete()
        .eq('user_id', userId)
        .eq('data->>messageId', message?.key?.id)
        .eq('data->>type', 'lock');
    }
  }
}

async function getOrCreateStatementHelper(userId: string, cardId: string, dateStr: string): Promise<string | null> {
  const { data: card, error: cardErr } = await supabase
    .from('cards')
    .select('*')
    .eq('id', cardId)
    .single();
  if (cardErr || !card) return null;

  const txDate = new Date(dateStr);
  const day = txDate.getUTCDate();
  const month = txDate.getUTCMonth(); // 0-indexed
  const year = txDate.getUTCFullYear();

  let targetMonth = month;
  let targetYear = year;

  if (day > card.closing_day) {
    targetMonth++;
    if (targetMonth > 11) {
      targetMonth = 0;
      targetYear++;
    }
  }

  const stmtMonth = targetMonth + 1; // 1-indexed
  const stmtYear = targetYear;

  const { data: existing } = await supabase
    .from('card_statements')
    .select('id')
    .eq('card_id', cardId)
    .eq('month', stmtMonth)
    .eq('year', stmtYear)
    .maybeSingle();

  if (existing) return existing.id;

  const closingDate = new Date(Date.UTC(targetYear, targetMonth, card.closing_day));
  let dueMonth = targetMonth;
  let dueYear = targetYear;
  if (card.due_day < card.closing_day) {
    dueMonth++;
    if (dueMonth > 11) {
      dueMonth = 0;
      dueYear++;
    }
  }
  const dueDate = new Date(Date.UTC(dueYear, dueMonth, card.due_day));

  const { data: newStmt, error: createErr } = await supabase
    .from('card_statements')
    .insert({
      user_id: userId,
      card_id: cardId,
      month: stmtMonth,
      year: stmtYear,
      status: 'OPEN',
      total_amount: 0,
      paid_amount: 0,
      closing_date: closingDate.toISOString(),
      due_date: dueDate.toISOString()
    })
    .select('id')
    .single();

  if (createErr || !newStmt) return null;
  return newStmt.id;
}
