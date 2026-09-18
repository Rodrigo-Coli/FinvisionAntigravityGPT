import { handleNotifyBillsDue } from './notify-bills-due.js';
import { handleNotifyInvestmentsDue } from './notify-investments-due.js';
import { handleNotifyReferralEngagement } from './notify-referral-engagement.js';
import { handleMaintenance } from './maintenance.js';
import { isCronAuthorized } from './cron-auth.js';

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

// Único cron diário (evita depender de quantos agendamentos o plano da
// Vercel permite): dispara o lembrete de contas a vencer e as notificações
// de engajamento do programa de indicação, nessa ordem.
export async function handleDailyCron(req: any, res: any) {
  // Checagem única aqui: a manutenção (maintenance.ts) não valida o segredo
  // sozinha, então sem isto qualquer pessoa disparava o cron inteiro.
  if (!isCronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

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
    billsDue: bills.get(),
    investmentsDue: investments.get(),
    referralEngagement: referral.get(),
    maintenance: maintenance.get(),
  });
}
