import { handleNotifyBillsDue } from './notify-bills-due.js';
import { handleNotifyInvestmentsDue } from './notify-investments-due.js';
import { handleNotifyReferralEngagement } from './notify-referral-engagement.js';
import { handleMaintenance } from './maintenance.js';
import { isCronAuthorized } from './cron-auth.js';
import { runInvestmentRadarCron } from './investment-radar.js';
import { runCurveProjectionCron } from './curve-projection.js';
import { runCouponForecastCron } from './coupon-forecast.js';

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

  // Juros previstos (cupons): dá baixa no que foi recebido e cria o próximo previsto.
  // Antes da curva, para o juro pago já sair do valor do título.
  const coupons = captureRes();
  try { await runCouponForecastCron(req, coupons.res as any); } catch (err: any) { console.error('[daily-cron] juros previstos falhou:', err?.message); }

  // Curva automática dos títulos de renda fixa (antes do Radar, que usa o valor atualizado).
  const curve = captureRes();
  try { await runCurveProjectionCron(req, curve.res as any); } catch (err: any) { console.error('[daily-cron] curva falhou:', err?.message); }

  // Radar de Investimentos por último (é o que mais demora, por causa da busca
  // de notícias): checa o que venceu a data (OK a cada 7 dias, Atenção/Urgente
  // todo dia) e avisa quando algo vira URGENTE.
  const radar = captureRes();
  try { await runInvestmentRadarCron(req, radar.res as any); } catch (err: any) { console.error('[daily-cron] radar falhou:', err?.message); }

  return res.status(200).json({
    success: true,
    billsDue: bills.get(),
    investmentsDue: investments.get(),
    couponForecast: coupons.get(),
    curveProjection: curve.get(),
    investmentRadar: radar.get(),
    referralEngagement: referral.get(),
    maintenance: maintenance.get(),
  });
}
