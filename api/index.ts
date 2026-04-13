export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const url = (req.url || '').split('?')[0];
  const urlParts = url.split('/').filter(Boolean);
  const funcName = urlParts.length > 0 ? urlParts[urlParts.length - 1] : '';

  try {
    console.log(`[Router] Loading endpoint: ${funcName} (URL: ${url})`);
    
    // Switch to dynamic indexing for resilience
    switch (funcName) {
      case 'finvision-chat': return (await import('../src/api-handlers/finvision-chat')).default(req, res);
      case 'handle-wealth-analysis': return (await import('../src/api-handlers/handle-wealth-analysis')).default(req, res);
      case 'notify-bills-due': return (await import('../src/api-handlers/notify-bills-due')).default(req, res);
      case 'vapid-public-key': return (await import('../src/api-handlers/vapid-public-key')).default(req, res);
      case 'asaas-webhook': return (await import('../src/api-handlers/asaas-webhook')).default(req, res);
      case 'whatsapp-webhook': return (await import('../src/api-handlers/whatsapp-webhook')).default(req, res);
      case 'process-import': return (await import('../src/api-handlers/process-import')).default(req, res);
      case 'categorize-transactions': return (await import('../src/api-handlers/categorize-transactions')).default(req, res);
      case 'handle-bank-reconcile': return (await import('../src/api-handlers/handle-bank-reconcile')).default(req, res);
      case 'handle-card-reconcile': return (await import('../src/api-handlers/handle-card-reconcile')).default(req, res);
      case 'asaas-create-subscription': return (await import('../src/api-handlers/asaas-create-subscription')).default(req, res);
      case 'public-plans': return (await import('../src/api-handlers/public-plans')).default(req, res);
      case 'apply-coupon': return (await import('../src/api-handlers/apply-coupon')).default(req, res);
      case 'handle-import-worker': return (await import('../src/api-handlers/handle-import-worker')).default(req, res);
      case 'handle-receipt-items': return (await import('../src/api-handlers/handle-receipt-items')).default(req, res);
      case 'parse-card-statement': return (await import('../src/api-handlers/parse-card-statement')).default(req, res);
      case 'parse-statement': return (await import('../src/api-handlers/parse-statement')).default(req, res);
      
      default:
        // Try fallback check if url starts with /api but didn't match via funcName
        if (url.startsWith('/api/')) {
            const potentialFunc = url.replace('/api/', '');
            console.log(`[Router] Fallback attempt for: ${potentialFunc}`);
        }
        return res.status(404).json({ error: 'END_POINT_NOT_MAPPED', funcName, url });
    }
  } catch (error: any) {
    console.error(`[Router] Fatal error loading API endpoint ${funcName}:`, error);
    return res.status(500).json({ 
        error: 'INTERNAL_ROUTER_ERROR', 
        funcName,
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
