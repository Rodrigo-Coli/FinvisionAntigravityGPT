import { handleNotifyBillsDue } from './notify-bills-due.js';
import { handleNotifyInvestmentsDue } from './notify-investments-due.js';
import { handleNotifyReferralEngagement } from './notify-referral-engagement.js';
import { handleMaintenance } from './maintenance.js';
import { refreshMarketIndexesCache } from './market-indexes.js';
import { createClient } from '@supabase/supabase-js';

// Um "res" descartável só pra capturar o resultado de cada handler sem
// escrever de verdade na resposta HTTP (cada handler já termina com
// res.status(...).json(...) uma única vez).
function captureRes() {
  let statusCode = 200;
  let body: any = null;
  const res = {
    status(code: number) { statusCode = code; return this; },
    json(payload: any) { body = payload; return this; },
    end() { return this; },
  };
  return { res, get: () => ({ statusCode, body }) };
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';

// Único cron diário (evita depender de quantos agendamentos o plano da
// Vercel permite): atualiza os índices de mercado e dispara o lembrete de contas
// a vencer e as notificações de engajamento do programa de indicação, nessa ordem.
export async function handleDailyCron(req: any, res: any) {
  // Primeiro os índices: CDI/Selic/IPCA alimentam toda a análise de investimentos, e
  // se o BCB estiver fora do ar o resto do cron não pode parar por causa disso.
  const marketIndexes = await refreshMarketIndexesCache(
    createClient(supabaseUrl, supabaseServiceKey)
  );

  const bills = captureRes();
  await handleNotifyBillsDue(req, bills.res as any);

  const investments = captureRes();
  await handleNotifyInvestmentsDue(req, investments.res as any);

  const referral = captureRes();
  await handleNotifyReferralEngagement(req, referral.res as any);

  // Manutenção: renova recorrências de imóveis (janela 24 meses) e limpa demos abandonadas
  const maintenance = captureRes();
  await handleMaintenance(req, maintenance.res as any);

  return res.status(200).json({
    success: true,
    marketIndexes,
    billsDue: bills.get(),
    investmentsDue: investments.get(),
    referralEngagement: referral.get(),
    maintenance: maintenance.get(),
  });
}
