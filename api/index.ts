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
                // @ts-ignore
                handler = (await import('./_lib/health')).default;
                break;
            case 'finvision-chat':
                // @ts-ignore
                handler = (await import('./_lib/finvision-chat')).default;
                break;
            case 'public-plans':
                // @ts-ignore
                handler = (await import('./_lib/public-plans')).default;
                break;
            case 'apply-coupon':
                // @ts-ignore
                handler = (await import('./_lib/apply-coupon')).default;
                break;
            case 'asaas-create-subscription':
                // @ts-ignore
                handler = (await import('./_lib/asaas-create-subscription')).default;
                break;
            case 'asaas-webhook':
                // @ts-ignore
                handler = (await import('./_lib/asaas-webhook')).default;
                break;
            case 'categorize-transactions':
                // @ts-ignore
                handler = (await import('./_lib/categorize-transactions')).default;
                break;
            case 'handle-bank-reconcile':
                // @ts-ignore
                handler = (await import('./_lib/handle-bank-reconcile')).default;
                break;
            case 'handle-card-reconcile':
                // @ts-ignore
                handler = (await import('./_lib/handle-card-reconcile')).default;
                break;
            case 'handle-import-worker':
                // @ts-ignore
                handler = (await import('./_lib/handle-import-worker')).default;
                break;
            case 'handle-receipt-items':
                // @ts-ignore
                handler = (await import('./_lib/handle-receipt-items')).default;
                break;
            case 'handle-wealth-analysis':
                // @ts-ignore
                handler = (await import('./_lib/handle-wealth-analysis')).default;
                break;
            case 'notify-bills-due':
                // @ts-ignore
                handler = (await import('./_lib/notify-bills-due')).default;
                break;
            case 'parse-card-statement':
                // @ts-ignore
                handler = (await import('./_lib/parse-card-statement')).default;
                break;
            case 'parse-statement':
                // @ts-ignore
                handler = (await import('./_lib/parse-statement')).default;
                break;
            case 'process-import':
                // @ts-ignore
                handler = (await import('./_lib/process-import')).default;
                break;
            case 'vapid-public-key':
                // @ts-ignore
                handler = (await import('./_lib/vapid-public-key')).default;
                break;
            case 'whatsapp-webhook':
                // @ts-ignore
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
