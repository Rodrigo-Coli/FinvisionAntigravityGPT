// Static Imports
// @ts-ignore
import applyCoupon from './_lib/apply-coupon';
// @ts-ignore
import asaasCreateSubscription from './_lib/asaas-create-subscription';
// @ts-ignore
import asaasWebhook from './_lib/asaas-webhook';
// @ts-ignore
import categorizeTransactions from './_lib/categorize-transactions';
// @ts-ignore
import finvisionChat from './_lib/finvision-chat';
// @ts-ignore
import handleBankReconcile from './_lib/handle-bank-reconcile';
// @ts-ignore
import handleCardReconcile from './_lib/handle-card-reconcile';
// @ts-ignore
import handleImportWorker from './_lib/handle-import-worker';
// @ts-ignore
import handleReceiptItems from './_lib/handle-receipt-items';
// @ts-ignore
import handleWealthAnalysis from './_lib/handle-wealth-analysis';
// @ts-ignore
import health from './_lib/health';
// @ts-ignore
import notifyBillsDue from './_lib/notify-bills-due';
// @ts-ignore
import parseCardStatement from './_lib/parse-card-statement';
// @ts-ignore
import parseStatement from './_lib/parse-statement';
// @ts-ignore
import processImport from './_lib/process-import';
// @ts-ignore
import publicPlans from './_lib/public-plans';
// @ts-ignore
import vapidPublicKey from './_lib/vapid-public-key';
// @ts-ignore
import whatsappWebhook from './_lib/whatsapp-webhook';

const handlers: Record<string, any> = {
    'apply-coupon': applyCoupon,
    'asaas-create-subscription': asaasCreateSubscription,
    'asaas-webhook': asaasWebhook,
    'categorize-transactions': categorizeTransactions,
    'finvision-chat': finvisionChat,
    'handle-bank-reconcile': handleBankReconcile,
    'handle-card-reconcile': handleCardReconcile,
    'handle-import-worker': handleImportWorker,
    'handle-receipt-items': handleReceiptItems,
    'handle-wealth-analysis': handleWealthAnalysis,
    'health': health,
    'notify-bills-due': notifyBillsDue,
    'parse-card-statement': parseCardStatement,
    'parse-statement': parseStatement,
    'process-import': processImport,
    'public-plans': publicPlans,
    'vapid-public-key': vapidPublicKey,
    'whatsapp-webhook': whatsappWebhook
};

export default async function handler(req: any, res: any) {
    // CORS Configuration
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const path = req.url.split('?')[0].replace('/api/', '');

    try {
        const handlerModule = handlers[path];
        if (!handlerModule) {
            return res.status(404).json({ 
                error: `Route /api/${path} not found.`,
                available: Object.keys(handlers)
            });
        }

        const handlerFunc = handlerModule.default || handlerModule;

        if (typeof handlerFunc === 'function') {
            return await handlerFunc(req, res);
        } else {
            return res.status(500).json({ error: `Handler for ${path} is not a function.` });
        }
    } catch (err: any) {
        console.error(`[Router Error] Path: ${path}`, err);
        return res.status(500).json({ error: err.message });
    }
}
