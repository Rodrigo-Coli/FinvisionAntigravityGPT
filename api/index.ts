import asaasCreateSubscription from './_handlers/asaas-create-subscription';
import applyCoupon from './_handlers/apply-coupon';
import asaasWebhook from './_handlers/asaas-webhook';
import categorizeTransactions from './_handlers/categorize-transactions';
import finvisionChat from './_handlers/finvision-chat';
import handleBankReconcile from './_handlers/handle-bank-reconcile';
import handleCardReconcile from './_handlers/handle-card-reconcile';
import handleImportWorker from './_handlers/handle-import-worker';
import handleReceiptItems from './_handlers/handle-receipt-items';
import handleWealthAnalysis from './_handlers/handle-wealth-analysis';
import parseCardStatement from './_handlers/parse-card-statement';
import parseStatement from './_handlers/parse-statement';
import processImport from './_handlers/process-import';
import publicPlans from './_handlers/public-plans';
import notifyBillsDue from './_handlers/notify-bills-due';
import whatsappWebhook from './_handlers/whatsapp-webhook';
import vapidPublicKey from './_handlers/vapid-public-key';

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
