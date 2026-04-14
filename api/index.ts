export default async function handler(req: any, res: any) {
    // CORS Configuration
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const path = req.url.split('?')[0].replace('/api/', '');

    try {
        let handler;
        switch (path) {
            case 'health':
                handler = (await import('./_lib/health')).default;
                break;
            case 'finvision-chat':
                handler = (await import('./_lib/finvision-chat')).default;
                break;
            case 'public-plans':
                handler = (await import('./_lib/public-plans')).default;
                break;
            case 'apply-coupon':
                handler = (await import('./_lib/apply-coupon')).default;
                break;
            case 'asaas-create-subscription':
                handler = (await import('./_lib/asaas-create-subscription')).default;
                break;
            case 'asaas-webhook':
                handler = (await import('./_lib/asaas-webhook')).default;
                break;
            case 'categorize-transactions':
                handler = (await import('./_lib/categorize-transactions')).default;
                break;
            case 'handle-bank-reconcile':
                handler = (await import('./_lib/handle-bank-reconcile')).default;
                break;
            case 'handle-card-reconcile':
                handler = (await import('./_lib/handle-card-reconcile')).default;
                break;
            case 'handle-import-worker':
                handler = (await import('./_lib/handle-import-worker')).default;
                break;
            case 'handle-receipt-items':
                handler = (await import('./_lib/handle-receipt-items')).default;
                break;
            case 'handle-wealth-analysis':
                handler = (await import('./_lib/handle-wealth-analysis')).default;
                break;
            case 'notify-bills-due':
                handler = (await import('./_lib/notify-bills-due')).default;
                break;
            case 'parse-card-statement':
                handler = (await import('./_lib/parse-card-statement')).default;
                break;
            case 'parse-statement':
                handler = (await import('./_lib/parse-statement')).default;
                break;
            case 'process-import':
                handler = (await import('./_lib/process-import')).default;
                break;
            case 'vapid-public-key':
                handler = (await import('./_lib/vapid-public-key')).default;
                break;
            case 'whatsapp-webhook':
                handler = (await import('./_lib/whatsapp-webhook')).default;
                break;
            default:
                return res.status(404).json({ error: `Route /api/${path} not found.` });
        }

        if (typeof handler === 'function') {
            return await handler(req, res);
        } else {
            return res.status(500).json({ error: `Handler for ${path} is not a function.` });
        }
    } catch (err: any) {
        console.error(`[Router Error] Path: ${path}`, err);
        return res.status(500).json({ error: err.message });
    }
}
