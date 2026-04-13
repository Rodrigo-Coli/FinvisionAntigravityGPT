export default async function handler(req: any, res: any) {
  // CORS Headers
  if (req.method === 'OPTIONS') {
    return res.status(200).send('ok');
  }

  // Extract function name from URL (e.g. /api/finvision-chat -> finvision-chat)
  const urlParts = req.url?.split('?')[0].split('/').filter(Boolean);
  const funcName = urlParts && urlParts.length > 0 ? urlParts[urlParts.length - 1] : '';

  console.log(`[Router] Routing request for: ${funcName}`);

  // LAZY LOADING: We only import the module that is actually needed.
  // This prevents the Lambda from crashing due to too many heavy imports during boot.
  try {
    let module;
    switch (funcName) {
      case 'finvision-chat':
        module = await import('./_handlers/finvision-chat');
        break;
      case 'handle-wealth-analysis':
        module = await import('./_handlers/handle-wealth-analysis');
        break;
      case 'notify-bills-due':
        module = await import('./_handlers/notify-bills-due');
        break;
      case 'vapid-public-key':
        module = await import('./_handlers/vapid-public-key');
        break;
      case 'apply-coupon':
        module = await import('./_handlers/apply-coupon');
        break;
      case 'asaas-create-subscription':
        module = await import('./_handlers/asaas-create-subscription');
        break;
      case 'asaas-webhook':
        module = await import('./_handlers/asaas-webhook');
        break;
      case 'categorize-transactions':
        module = await import('./_handlers/categorize-transactions');
        break;
      case 'handle-bank-reconcile':
        module = await import('./_handlers/handle-bank-reconcile');
        break;
      case 'handle-card-reconcile':
        module = await import('./_handlers/handle-card-reconcile');
        break;
      case 'handle-import-worker':
        module = await import('./_handlers/handle-import-worker');
        break;
      case 'handle-receipt-items':
        module = await import('./_handlers/handle-receipt-items');
        break;
      case 'parse-card-statement':
        module = await import('./_handlers/parse-card-statement');
        break;
      case 'parse-statement':
        module = await import('./_handlers/parse-statement');
        break;
      case 'process-import':
        module = await import('./_handlers/process-import');
        break;
      case 'public-plans':
        module = await import('./_handlers/public-plans');
        break;
      case 'whatsapp-webhook':
        module = await import('./_handlers/whatsapp-webhook');
        break;
      case 'debug':
        return res.status(200).json({ status: 'Unified Router is Active', timestamp: new Date().toISOString() });
      case 'index':
        return res.status(200).json({ status: 'API Router is online', framework: 'Vite/Vercel' });
      default:
        return res.status(404).json({ error: `Router: Endpoint '${funcName}' não encontrado.` });
    }

    // Call the exported default handler
    if (module && typeof module.default === 'function') {
      return await module.default(req, res);
    } else {
      throw new Error(`O módulo '${funcName}' não exporta um handler padrão válido.`);
    }

  } catch (error: any) {
    console.error(`[Router Error] Falha ao processar ${funcName}:`, error);
    return res.status(500).json({ 
      error: `Erro no roteador da API: ${error.message}`,
      details: 'Certifique-se de que os handlers em api/_handlers/ estão exportando uma função default.'
    });
  }
}
