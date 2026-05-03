const ASAAS_BASE_URL = 'https://sandbox.asaas.com/api/v3';
const ASAAS_KEY = process.env.ASAAS_SANDBOX_KEY || '';

async function asaasRequest(path: string, method = 'GET', body?: any) {
  const res = await fetch(`${ASAAS_BASE_URL}${path}`, {
    method,
    headers: { 'access_token': ASAAS_KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export async function handleAsaasBillingHistory(req: any, res: any) {
  const { asaasSubscriptionId } = req.query;
  if (!asaasSubscriptionId) return res.status(400).json({ error: 'asaasSubscriptionId required' });

  try {
    // 1. Get payments for this subscription
    const payments = await asaasRequest(`/payments?subscription=${asaasSubscriptionId}`);
    
    // 2. Return the data
    return res.status(200).json(payments);
  } catch (err: any) {
    console.error('Asaas Billing History Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
