import { createClient } from '@supabase/supabase-js';
import { getSafetyWhatsappCostPerMessageBRL } from '../../lib/whatsappCostUtils.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

export type WhatsappMessageCategory = 'utility' | 'marketing' | 'authentication';

// EVOLUTION_INSTANCES="numero1,numero2,numero3" (nomes das instâncias já
// registradas no mesmo servidor Evolution). Se não configurado, cai para a
// instância única EVOLUTION_INSTANCE (comportamento anterior, sem rotação).
function getInstancePool(): string[] {
  const raw = process.env.EVOLUTION_INSTANCES || process.env.EVOLUTION_INSTANCE || '';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

let rotationCursor = 0;
function nextInstance(pool: string[]): string {
  const instance = pool[rotationCursor % pool.length];
  rotationCursor++;
  return instance;
}

let cachedCostRows: { category: string; meta_cost_usd: number; usd_to_brl_rate: number }[] | null = null;
let cachedCostAt = 0;

async function getSafetyCostPerMessageBRL(): Promise<number> {
  const now = Date.now();
  if (!cachedCostRows || now - cachedCostAt > 10 * 60 * 1000) {
    const { data } = await supabase.from('whatsapp_cost_config').select('category, meta_cost_usd, usd_to_brl_rate');
    cachedCostRows = data || [];
    cachedCostAt = now;
  }
  return getSafetyWhatsappCostPerMessageBRL(cachedCostRows as any);
}

async function logUsage(userId: string | null, category: WhatsappMessageCategory, purpose: string, success: boolean) {
  try {
    const costBRL = await getSafetyCostPerMessageBRL();
    await supabase.from('whatsapp_usage_log').insert({
      user_id: userId,
      category,
      purpose,
      success,
      safety_cost_cents: costBRL * 100,
    });
  } catch (err) {
    console.error('[whatsapp usage log] Erro ao registrar:', err);
  }
}

// Envio com rotação entre instâncias Evolution — evita concentrar todo o
// volume (principalmente mensagens de engajamento, mais "marketing-like")
// em um único número e reduzir o risco de bloqueio pelo WhatsApp.
export async function sendWhatsAppRotated(params: {
  number: string;
  text: string;
  category: WhatsappMessageCategory;
  purpose: string;
  userId?: string | null;
}): Promise<boolean> {
  const pool = getInstancePool();
  if (!process.env.EVOLUTION_API_URL || !process.env.EVOLUTION_API_KEY || pool.length === 0) return false;

  const instance = nextInstance(pool);
  const cleanBaseUrl = process.env.EVOLUTION_API_URL.endsWith('/')
    ? process.env.EVOLUTION_API_URL.slice(0, -1)
    : process.env.EVOLUTION_API_URL;

  let success = false;
  try {
    const res = await fetch(`${cleanBaseUrl}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': process.env.EVOLUTION_API_KEY as string },
      body: JSON.stringify({
        number: params.number,
        text: params.text,
        options: { delay: 1200, presence: 'composing' },
        textMessage: { text: params.text },
      }),
    });
    success = res.ok;
    if (!success) {
      const errText = await res.text().catch(() => '');
      console.error(`[WhatsApp rotation] Falha via instância "${instance}": ${res.status} ${errText}`);
    }
  } catch (err) {
    console.error(`[WhatsApp rotation] Erro via instância "${instance}":`, err);
  }

  await logUsage(params.userId || null, params.category, params.purpose, success);
  return success;
}
