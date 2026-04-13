import asaasCreateSubscription from '../server/asaas-create-subscription';
import applyCoupon from '../server/apply-coupon';
import asaasWebhook from '../server/asaas-webhook';
import categorizeTransactions from '../server/categorize-transactions';
import finvisionChat from '../server/finvision-chat';
import handleBankReconcile from '../server/handle-bank-reconcile';
import handleCardReconcile from '../server/handle-card-reconcile';
import handleImportWorker from '../server/handle-import-worker';
import handleReceiptItems from '../server/handle-receipt-items';
import handleWealthAnalysis from '../server/handle-wealth-analysis';
import parseCardStatement from '../server/parse-card-statement';
import parseStatement from '../server/parse-statement';
import processImport from '../server/process-import';
import publicPlans from '../server/public-plans';
import notifyBillsDue from '../server/notify-bills-due';
import whatsappWebhook from '../server/whatsapp-webhook';
import vapidPublicKey from '../server/vapid-public-key';

export default async function handler(req: any, res: any) {
  const urlParts = req.url?.split('?')[0].split('/').filter(Boolean);
  const funcName = urlParts && urlParts.length > 0 ? urlParts[urlParts.length - 1] : '';

  try {
    switch (funcName) {
      case 'vapid-public-key': return vapidPublicKey(req, res);
      case 'apply-coupon': return applyCoupon(req, res);
      case 'asaas-create-subscription': return asaasCreateSubscription(req, res);
      case 'asaas-webhook': return asaasWebhook(req, res);
      case 'categorize-transactions': return categorizeTransactions(req, res);
      case 'finvision-chat': return finvisionChat(req, res);
      case 'handle-bank-reconcile': return handleBankReconcile(req, res);
      case 'handle-card-reconcile': return handleCardReconcile(req, res);
      case 'handle-import-worker': return handleImportWorker(req, res);
      case 'handle-receipt-items': return handleReceiptItems(req, res);
      case 'handle-wealth-analysis': return handleWealthAnalysis(req, res);
      case 'notify-bills-due': return notifyBillsDue(req, res);
      case 'parse-card-statement': return parseCardStatement(req, res);
      case 'parse-statement': return parseStatement(req, res);
      case 'process-import': return processImport(req, res);
      case 'public-plans': return publicPlans(req, res);
      case 'whatsapp-webhook': return whatsappWebhook(req, res);
      default:
        return res.status(404).json({ error: 'Endpoint router not found: ' + funcName });
    }
  } catch (error: any) {
    console.error(`Error executing API endpoint ${funcName}:`, error);
    return res.status(500).json({ error: `Internal Server Error in ${funcName}: ${error.message}` });
  }
}


