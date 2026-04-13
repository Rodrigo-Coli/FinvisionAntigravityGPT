import finvisionChat from '../src/api-handlers/finvision-chat';
import handleWealthAnalysis from '../src/api-handlers/handle-wealth-analysis';
import notifyBillsDue from '../src/api-handlers/notify-bills-due';
import vapidPublicKey from '../src/api-handlers/vapid-public-key';
import asaasWebhook from '../src/api-handlers/asaas-webhook';
import whatsappWebhook from '../src/api-handlers/whatsapp-webhook';
import processImport from '../src/api-handlers/process-import';
import categorizeTransactions from '../src/api-handlers/categorize-transactions';
import handleBankReconcile from '../src/api-handlers/handle-bank-reconcile';
import handleCardReconcile from '../src/api-handlers/handle-card-reconcile';
import asaasCreateSubscription from '../src/api-handlers/asaas-create-subscription';
import publicPlans from '../src/api-handlers/public-plans';
import applyCoupon from '../src/api-handlers/apply-coupon';
import handleImportWorker from '../src/api-handlers/handle-import-worker';
import handleReceiptItems from '../src/api-handlers/handle-receipt-items';
import parseCardStatement from '../src/api-handlers/parse-card-statement';
import parseStatement from '../src/api-handlers/parse-statement';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const url = req.url?.split('?')[0];

  try {
    if (url === '/api/finvision-chat' || url === '/finvision-chat') return await finvisionChat(req, res);
    if (url === '/api/handle-wealth-analysis' || url === '/handle-wealth-analysis') return await handleWealthAnalysis(req, res);
    if (url === '/api/notify-bills-due' || url === '/notify-bills-due') return await notifyBillsDue(req, res);
    if (url === '/api/vapid-public-key' || url === '/vapid-public-key') return await vapidPublicKey(req, res);
    if (url === '/api/asaas-webhook' || url === '/asaas-webhook') return await asaasWebhook(req, res);
    if (url === '/api/whatsapp-webhook' || url === '/whatsapp-webhook') return await whatsappWebhook(req, res);
    if (url === '/api/process-import' || url === '/process-import') return await processImport(req, res);
    if (url === '/api/categorize-transactions' || url === '/categorize-transactions') return await categorizeTransactions(req, res);
    if (url === '/api/handle-bank-reconcile' || url === '/handle-bank-reconcile') return await handleBankReconcile(req, res);
    if (url === '/api/handle-card-reconcile' || url === '/handle-card-reconcile') return await handleCardReconcile(req, res);
    if (url === '/api/asaas-create-subscription' || url === '/asaas-create-subscription') return await asaasCreateSubscription(req, res);
    if (url === '/api/public-plans' || url === '/public-plans') return await publicPlans(req, res);
    if (url === '/api/apply-coupon' || url === '/apply-coupon') return await applyCoupon(req, res);
    if (url === '/api/handle-import-worker' || url === '/handle-import-worker') return await handleImportWorker(req, res);
    if (url === '/api/handle-receipt-items' || url === '/handle-receipt-items') return await handleReceiptItems(req, res);
    if (url === '/api/parse-card-statement' || url === '/parse-card-statement') return await parseCardStatement(req, res);
    if (url === '/api/parse-statement' || url === '/parse-statement') return await parseStatement(req, res);
    
    // Add debugging fallback so we don't get 500
    return res.status(404).json({ error: 'END_POINT_NOT_MAPPED', url: req.url });
  } catch (error: any) {
    console.error(`Error handling ${url}:`, error);
    return res.status(500).json({ error: 'INTERNAL_ROUTER_ERROR', message: error.message });
  }
}
