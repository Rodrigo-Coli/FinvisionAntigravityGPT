// ============================================================
// FINVISION UNIFIED API ROUTER
// Todas as rotas consolidadas em um único Serverless Function
// para respeitar o limite de 12 functions do plano Hobby da Vercel.
// Os handlers reais ficam em api/_lib/ (ignorados pela Vercel).
// ============================================================

import { handleCategorizeTransactions } from './_lib/categorize-transactions.js';
import { handleFinvisionChat } from './_lib/finvision-chat.js';
import { handleBankReconcile } from './_lib/handle-bank-reconcile.js';
import { handleCardReconcile } from './_lib/handle-card-reconcile.js';
import { handleWealthAnalysis } from './_lib/handle-wealth-analysis.js';
import { handleParseCardStatement } from './_lib/parse-card-statement.js';
import { handleParseStatement } from './_lib/parse-statement.js';
import { handleProcessImport } from './_lib/process-import.js';
import { handleAsaasWebhook } from './_lib/asaas-webhook.js';
import { handleWhatsAppWebhook } from './_lib/whatsapp-webhook.js';
import { handleNotifyBillsDue } from './_lib/notify-bills-due.js';
import { handleVapidPublicKey } from './_lib/vapid-public-key.js';
import { handleHealth } from './_lib/health.js';
import { handleReceiptItems } from './_lib/handle-receipt-items.js';
import { handleAsaasBillingHistory } from './_lib/asaas-billing-history.js';
import handleAsaasCreateSubscription from './_lib/asaas-create-subscription.js';
import { handlePromoteDemo } from './_lib/promote-demo.js';
import { handleAttachReferral } from './_lib/attach-referral.js';
import { handleAffiliateMe, handleAffiliateUpdatePix, handleAffiliateRequestPayout, handleAffiliateRedeemCredit } from './_lib/affiliate.js';
import { handleAffiliateAcceptTerms } from './_lib/affiliate-accept-terms.js';
import { handleAdminProcessPayout } from './_lib/admin-process-payout.js';
import { handleNotifyReferralEngagement } from './_lib/notify-referral-engagement.js';
import { handleDailyCron } from './_lib/daily-cron.js';

function setCorsHeaders(res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
}

export default async function handler(req: any, res: any) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.url || '';

  try {
    // --- AI / Chat ---
    if (url.includes('/finvision-chat'))         return handleFinvisionChat(req, res);
    if (url.includes('/categorize-transactions')) return handleCategorizeTransactions(req, res);
    if (url.includes('/handle-wealth-analysis'))  return handleWealthAnalysis(req, res);

    // --- Reconciliação / Import ---
    if (url.includes('/handle-bank-reconcile'))   return handleBankReconcile(req, res);
    if (url.includes('/handle-card-reconcile'))   return handleCardReconcile(req, res);
    if (url.includes('/handle-receipt-items'))     return handleReceiptItems(req, res);
    if (url.includes('/parse-card-statement'))     return handleParseCardStatement(req, res);
    if (url.includes('/parse-statement') && !url.includes('/parse-card-statement')) return handleParseStatement(req, res);
    if (url.includes('/process-import'))           return handleProcessImport(req, res);

    // --- Webhooks ---
    if (url.includes('/asaas-webhook'))            return handleAsaasWebhook(req, res);
    if (url.includes('/asaas-create-subscription')) return handleAsaasCreateSubscription(req, res);
    if (url.includes('/asaas-billing-history'))    return handleAsaasBillingHistory(req, res);
    if (url.includes('/whatsapp-webhook'))         return handleWhatsAppWebhook(req, res);

    // --- Cron ---
    if (url.includes('/daily-cron'))               return handleDailyCron(req, res);
    if (url.includes('/notify-bills-due'))         return handleNotifyBillsDue(req, res);
    if (url.includes('/notify-referral-engagement')) return handleNotifyReferralEngagement(req, res);

    // --- Programa de Indicação ---
    if (url.includes('/attach-referral'))          return handleAttachReferral(req, res);
    if (url.includes('/affiliate-accept-terms'))   return handleAffiliateAcceptTerms(req, res);
    if (url.includes('/affiliate-me'))             return handleAffiliateMe(req, res);
    if (url.includes('/affiliate-update-pix'))     return handleAffiliateUpdatePix(req, res);
    if (url.includes('/affiliate-request-payout')) return handleAffiliateRequestPayout(req, res);
    if (url.includes('/affiliate-redeem-credit'))  return handleAffiliateRedeemCredit(req, res);
    if (url.includes('/admin-process-payout'))     return handleAdminProcessPayout(req, res);

    // --- Demo ---
    if (url.includes('/promote-demo'))             return handlePromoteDemo(req, res);

    // --- Utilitários ---
    if (url.includes('/vapid-public-key'))         return handleVapidPublicKey(req, res);
    if (url.includes('/health'))                   return handleHealth(req, res);

    // --- Fallback (Health Check) ---
    return res.status(200).json({ status: 'ok', service: 'FinVision Unified API', timestamp: new Date().toISOString() });

  } catch (err: any) {
    console.error('[UnifiedAPI] Unhandled error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
