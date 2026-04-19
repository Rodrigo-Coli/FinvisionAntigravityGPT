// Static Imports for remaining grouped functions
// @ts-ignore
import applyCoupon from '../lib/api-handlers/apply-coupon';
// @ts-ignore
import asaasCreateSubscription from '../lib/api-handlers/asaas-create-subscription';
// @ts-ignore
import handleImportWorker from '../lib/api-handlers/handle-import-worker';
// @ts-ignore
import handleReceiptItems from '../lib/api-handlers/handle-receipt-items';
// @ts-ignore
import health from '../lib/api-handlers/health';
// @ts-ignore
import publicPlans from '../lib/api-handlers/public-plans';
// @ts-ignore
import vapidPublicKey from '../lib/api-handlers/vapid-public-key';
// @ts-ignore
import asaasWebhook from '../lib/api-handlers/asaas-webhook';
// @ts-ignore
import whatsappWebhook from '../lib/api-handlers/whatsapp-webhook';
// @ts-ignore
import notifyBillsDue from '../lib/api-handlers/notify-bills-due';

const handlers: Record<string, any> = {
    'apply-coupon': applyCoupon,
    'asaas-create-subscription': asaasCreateSubscription,
    'handle-import-worker': handleImportWorker,
    'handle-receipt-items': handleReceiptItems,
    'health': health,
    'public-plans': publicPlans,
    'vapid-public-key': vapidPublicKey,
    'asaas-webhook': asaasWebhook,
    'whatsapp-webhook': whatsappWebhook,
    'notify-bills-due': notifyBillsDue
};

export default async function handler(req: any, res: any) {
    // CORS Configuration
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // Normalize path: remove /api/ prefix, leading slashes, trailing slashes and query params
    let path = req.url.split('?')[0].replace(/^\/api\/?/, '').replace(/\/$/, '');

    // DIRECT HANDLE for VAPID KEY (Solves the 12 functions limit by consolidation)
    if (path === 'vapid-public-key') {
        const publicKey = process.env.VAPID_PUBLIC_KEY;
        if (!publicKey) {
            console.error('SERVER_ERROR: VAPID_PUBLIC_KEY missing in Env Vars.');
            return res.status(500).json({ error: 'Chave VAPID_PUBLIC_KEY não configurada no servidor Vercel.' });
        }
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
        return res.status(200).json({ publicKey });
    }

    try {
        const handlerModule = handlers[path];
        if (!handlerModule) {
            return res.status(404).json({ 
                error: `Route /api/${path} not found in router.`,
                received_path: path,
                available_in_router: Object.keys(handlers)
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

