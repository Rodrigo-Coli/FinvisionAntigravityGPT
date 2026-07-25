import type {
  PaymentGateway,
  CreateSubscriptionParams,
  CreateSubscriptionResult,
  NormalizedWebhookEvent,
  BillingPeriod,
} from './types.js';

const ASAAS_BASE_URL = process.env.ASAAS_BASE_URL || 'https://sandbox.asaas.com/api/v3';
const ASAAS_KEY = process.env.ASAAS_SANDBOX_KEY || '';

const ASAAS_CYCLE: Record<BillingPeriod, string> = {
  monthly: 'MONTHLY',
  semiannual: 'SEMIANNUALLY',
  annual: 'YEARLY',
};

const ASAAS_STATUS_MAP: Record<string, NormalizedWebhookEvent['type']> = {
  PAYMENT_RECEIVED: 'payment_confirmed',
  PAYMENT_CONFIRMED: 'payment_confirmed',
  PAYMENT_OVERDUE: 'payment_overdue',
  PAYMENT_REFUNDED: 'payment_refunded',
  PAYMENT_CHARGEBACK_REQUESTED: 'payment_chargeback',
  PAYMENT_CHARGEBACK_DISPUTE: 'payment_chargeback',
  PAYMENT_DELETED: 'payment_deleted',
  SUBSCRIPTION_DELETED: 'subscription_deleted',
};

async function asaasRequest(path: string, method = 'GET', body?: any) {
  const res = await fetch(`${ASAAS_BASE_URL}${path}`, {
    method,
    headers: { 'access_token': ASAAS_KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export class AsaasGateway implements PaymentGateway {
  readonly name = 'asaas';

  private async findOrCreateCustomer(email: string, externalReference: string): Promise<string> {
    const existing = await asaasRequest(`/customers?email=${encodeURIComponent(email)}`);
    if (existing.data?.length > 0) return existing.data[0].id;

    const customer = await asaasRequest('/customers', 'POST', {
      name: email.split('@')[0],
      email,
      externalReference,
    });
    if (!customer.id) throw new Error('Falha ao criar cliente no Asaas: ' + JSON.stringify(customer));
    return customer.id;
  }

  async createSubscription(params: CreateSubscriptionParams): Promise<CreateSubscriptionResult> {
    const gatewayCustomerId = await this.findOrCreateCustomer(params.customerEmail, params.customerExternalReference);

    const subPayload: any = {
      customer: gatewayCustomerId,
      billingType: params.paymentMethod === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'PIX',
      value: params.valueReais,
      nextDueDate: params.nextDueDate,
      cycle: ASAAS_CYCLE[params.billingPeriod],
      description: params.description,
      externalReference: params.externalReference,
    };

    if (params.paymentMethod === 'CREDIT_CARD' && params.creditCard && params.creditCardHolderInfo) {
      subPayload.creditCard = { ...params.creditCard };
      subPayload.creditCardHolderInfo = {
        name: params.creditCardHolderInfo.name,
        email: params.creditCardHolderInfo.email,
        cpfCnpj: params.creditCardHolderInfo.cpfCnpj,
        postalCode: params.creditCardHolderInfo.postalCode,
        addressNumber: params.creditCardHolderInfo.addressNumber,
        phone: params.creditCardHolderInfo.phone,
        mobilePhone: params.creditCardHolderInfo.phone,
      };
      subPayload.remoteIp = params.remoteIp || '127.0.0.1';
    }

    const subscription = await asaasRequest('/subscriptions', 'POST', subPayload);
    if (!subscription.id) throw new Error('Falha ao criar assinatura no Asaas: ' + JSON.stringify(subscription));

    let pix: CreateSubscriptionResult['pix'] = null;
    if (params.paymentMethod === 'PIX') {
      // Pequena espera para o Asaas gerar a primeira fatura antes de buscar o QR Code.
      await new Promise(resolve => setTimeout(resolve, 1500));
      const paymentsResponse = await asaasRequest(`/payments?subscription=${subscription.id}`);
      const firstPayment = paymentsResponse.data?.[0];
      if (firstPayment) {
        const qrCodeResponse = await asaasRequest(`/payments/${firstPayment.id}/pixQrCode`);
        if (qrCodeResponse.success) {
          pix = {
            paymentId: firstPayment.id,
            qrCode: qrCodeResponse.encodedImage,
            copiaECola: qrCodeResponse.payload,
            expirationDate: qrCodeResponse.expirationDate,
          };
        }
      }
    }

    return {
      gatewaySubscriptionId: subscription.id,
      gatewayCustomerId,
      nextDueDate: subscription.nextDueDate,
      pix,
    };
  }

  async cancelSubscription(gatewaySubscriptionId: string): Promise<void> {
    // Deleta a assinatura no Asaas: para as próximas cobranças, mas não afeta
    // pagamentos já confirmados. O acesso do usuário ao plano continua sendo
    // controlado pelo nosso banco (cancel_at_period_end + current_period_end),
    // não por este DELETE.
    await asaasRequest(`/subscriptions/${gatewaySubscriptionId}`, 'DELETE');
  }

  normalizeWebhookEvent(payload: any): NormalizedWebhookEvent {
    const { event, payment, subscription } = payload || {};
    const type = ASAAS_STATUS_MAP[event] || 'ignored';
    return {
      type,
      gatewaySubscriptionId: subscription?.id || payment?.subscription || null,
      gatewayPaymentId: payment?.id || null,
      amountCents: typeof payment?.value === 'number' ? Math.round(payment.value * 100) : null,
      externalReference: payment?.externalReference || null,
    };
  }

  verifyWebhookAuth(req: any): boolean {
    // Fail-closed: sem o token configurado, qualquer um poderia forjar um aviso de
    // "pagamento confirmado" e ativar assinatura + comissão de indicação de graça.
    if (!process.env.ASAAS_WEBHOOK_TOKEN) {
      console.error('[asaas-webhook] ASAAS_WEBHOOK_TOKEN não configurado — recusando webhook por segurança.');
      return false;
    }
    const token = req.headers['asaas-access-token'];
    return token === process.env.ASAAS_WEBHOOK_TOKEN;
  }
}
