import { createClient } from '@supabase/supabase-js';
import { getSafetyWhatsappCostPerMessageBRL } from '../../lib/whatsappCostUtils.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

export type WhatsappMessageCategory = 'utility' | 'marketing' | 'authentication';

// Rotação "fixa por usuário": cada usuário sempre recebe do MESMO número
// (melhor experiência, menos chance de cair em spam) — só troca de número
// se o admin marcar aquele número como bloqueado no Master Console.
// EVOLUTION_INSTANCES="numero1,numero2,numero3" (nomes das instâncias já
// registradas no mesmo servidor Evolution).
async function getHealthyInstancePool(): Promise<string[]> {
  const envPool = (process.env.EVOLUTION_INSTANCES || process.env.EVOLUTION_INSTANCE || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  if (envPool.length === 0) return [];

  const { data: existing } = await supabase.from('whatsapp_instances').select('name, status');
  const existingNames = new Set((existing || []).map((r: any) => r.name));
  const missing = envPool.filter(n => !existingNames.has(n));
  if (missing.length > 0) {
    await supabase.from('whatsapp_instances').insert(missing.map(name => ({ name })));
  }

  const { data: all } = await supabase.from('whatsapp_instances').select('name, status');
  return (all || []).filter((r: any) => r.status === 'active').map((r: any) => r.name);
}

async function getStickyInstanceForUser(userId: string, healthyPool: string[]): Promise<string | null> {
  if (healthyPool.length === 0) return null;

  const { data: settings } = await supabase.from('user_settings').select('whatsapp_instance_assigned').eq('user_id', userId).maybeSingle();
  const assigned = settings?.whatsapp_instance_assigned;
  if (assigned && healthyPool.includes(assigned)) return assigned;

  // Precisa atribuir (primeira vez, ou instância anterior foi bloqueada):
  // escolhe a instância saudável com menos usuários atribuídos no momento.
  const { data: counts } = await supabase.from('user_settings')
    .select('whatsapp_instance_assigned')
    .in('whatsapp_instance_assigned', healthyPool);

  const tally = new Map<string, number>(healthyPool.map(n => [n, 0]));
  for (const row of counts || []) {
    const inst = (row as any).whatsapp_instance_assigned;
    if (inst) tally.set(inst, (tally.get(inst) || 0) + 1);
  }
  let best = healthyPool[0];
  let bestCount = Infinity;
  for (const [name, count] of tally) {
    if (count < bestCount) { best = name; bestCount = count; }
  }

  await supabase.from('user_settings').upsert({ user_id: userId, whatsapp_instance_assigned: best }, { onConflict: 'user_id' });
  return best;
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

async function logUsage(userId: string, category: WhatsappMessageCategory, purpose: string, success: boolean) {
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

export async function sendWhatsAppRotated(params: {
  number: string;
  text: string;
  category: WhatsappMessageCategory;
  purpose: string;
  userId: string;
}): Promise<boolean> {
  if (!process.env.EVOLUTION_API_URL || !process.env.EVOLUTION_API_KEY) return false;

  const pool = await getHealthyInstancePool();
  const instance = await getStickyInstanceForUser(params.userId, pool);
  if (!instance) return false;

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
      console.error(`[WhatsApp sticky] Falha via instância "${instance}" (usuário ${params.userId}): ${res.status} ${errText}`);
    }
  } catch (err) {
    console.error(`[WhatsApp sticky] Erro via instância "${instance}" (usuário ${params.userId}):`, err);
  }

  await logUsage(params.userId, params.category, params.purpose, success);
  return success;
}
