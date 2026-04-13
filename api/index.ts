export default async function handler(req: any, res: any) {
  const urlParts = req.url?.split('?')[0].split('/').filter(Boolean);
  const funcName = urlParts && urlParts.length > 0 ? urlParts[urlParts.length - 1] : '';

  try {
    switch (funcName) {
      case 'vapid-public-key': return (await import('../server/vapid-public-key')).default(req, res);
      case 'apply-coupon': return (await import('../server/apply-coupon')).default(req, res);
      case 'asaas-create-subscription': return (await import('../server/asaas-create-subscription')).default(req, res);
      case 'asaas-webhook': return (await import('../server/asaas-webhook')).default(req, res);
      case 'categorize-transactions': return (await import('../server/categorize-transactions')).default(req, res);
      case 'finvision-chat': return (await import('../server/finvision-chat')).default(req, res);
      case 'handle-bank-reconcile': return (await import('../server/handle-bank-reconcile')).default(req, res);
      case 'handle-card-reconcile': return (await import('../server/handle-card-reconcile')).default(req, res);
      case 'handle-import-worker': return (await import('../server/handle-import-worker')).default(req, res);
      case 'handle-receipt-items': return (await import('../server/handle-receipt-items')).default(req, res);
      case 'handle-wealth-analysis': return (await import('../server/handle-wealth-analysis')).default(req, res);
      case 'notify-bills-due': return (await import('../server/notify-bills-due')).default(req, res);
      case 'parse-card-statement': return (await import('../server/parse-card-statement')).default(req, res);
      case 'parse-statement': return (await import('../server/parse-statement')).default(req, res);
      case 'process-import': return (await import('../server/process-import')).default(req, res);
      case 'public-plans': return (await import('../server/public-plans')).default(req, res);
      case 'whatsapp-webhook': return (await import('../server/whatsapp-webhook')).default(req, res);
      default:
        return res.status(404).json({ error: 'Endpoint router not found: ' + funcName });
    }
  } catch (error: any) {
    console.error(`Error loading API endpoint ${funcName}:`, error);
    return res.status(500).json({ error: `Internal Server Error: Failed to load endpoint ${funcName}. Details: ${error.message}` });
  }
}

