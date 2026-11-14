import { timingSafeEqual } from 'node:crypto';
import { resolveAsaasConfig } from './billing-rules.js';
import type {
  PaymentGateway,
  CreateSubscriptionParams,
  CreateSubscriptionResult,
  NormalizedWebhookEvent,
  BillingPeriod,
} from './types.js';

// Chave e endereço resolvidos a cada chamada (ver resolveAsaasConfig): aceita
// ASAAS_API_KEY (nome certo) ou ASAAS_SANDBOX_KEY (legado), e chave de produção
// fala com a produção mesmo sem ASAAS_BASE_URL.

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

export async function asaasRequest(path: string, method = 'GET', body?: any) {
  const { apiKey, baseUrl } = resolveAsaasConfig();
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'access_token': apiKey, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// O Asaas devolve { errors: [{ code, description }] }. A descrição já vem em
// português e é o que o cliente precisa ler ("CPF inválido", "cartão recusado").
function asaasErrorMessage(response: any, fallback: string): string {
  const descriptions = Array.isArray(response?.errors)
    ? response.errors.map((e: any) => e?.description).filter(Boolean)
    : [];
  return descriptions.length > 0 ? descriptions.join(' ') : fallback;
}

function onlyDigits(value: string | undefined | null): string {
  return String(value || '').replace(/\D/g, '');
}

export class AsaasGateway implements PaymentGateway {
  readonly name = 'asaas';

  // O cliente no Asaas precisa de CPF/CNPJ para qualquer cobrança ser emitida.
  // Antes ele era criado só com o e-mail (e o nome tirado do e-mail): o Pix não
  // tinha como informar o documento e a cobrança era recusada.
  private async findOrCreateCustomer(
    email: string,
    externalReference: string,
    info: { name?: string; cpfCnpj?: string; phone?: string } = {}
  ): Promise<string> {
    const cpfCnpj = onlyDigits(info.cpfCnpj);
    const phone = onlyDigits(info.phone);
    const name = (info.name || '').trim();

    const existing = await asaasRequest(`/customers?email=${encodeURIComponent(email)}`);
    const found = existing.data?.[0];
    if (found?.id) {
      // Completa o cadastro antigo que ficou sem documento/nome — nunca troca
      // um documento que já está lá.
      const patch: Record<string, string> = {};
      if (cpfCnpj && !found.cpfCnpj) patch.cpfCnpj = cpfCnpj;
      if (name && (!found.name || found.name === email.split('@')[0])) patch.name = name;
      if (phone && !found.mobilePhone) patch.mobilePhone = phone;
      if (Object.keys(patch).length > 0) {
        try {
          const updated = await asaasRequest(`/customers/${found.id}`, 'PUT', patch);
          if (!updated?.id) console.error('[asaas] Não foi possível completar o cadastro do cliente:', JSON.stringify(updated));
        } catch (err) {
          console.error('[asaas] Erro ao completar o cadastro do cliente:', err);
        }
      }
      return found.id;
    }

    const payload: Record<string, string> = {
      name: name || email.split('@')[0],
      email,
      externalReference,
    };
    if (cpfCnpj) payload.cpfCnpj = cpfCnpj;
    if (phone) payload.mobilePhone = phone;

    const customer = await asaasRequest('/customers', 'POST', payload);
    if (!customer.id) throw new Error(asaasErrorMessage(customer, 'Não foi possível cadastrar o cliente no Asaas.'));
    return customer.id;
  }

  async createSubscription(params: CreateSubscriptionParams): Promise<CreateSubscriptionResult> {
    const gatewayCustomerId = await this.findOrCreateCustomer(params.customerEmail, params.customerExternalReference, {
      name: params.customerName || params.creditCardHolderInfo?.name,
      cpfCnpj: params.customerCpfCnpj || params.creditCardHolderInfo?.cpfCnpj,
      phone: params.customerPhone || params.creditCardHolderInfo?.phone,
    });

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
    if (!subscription.id) {
      console.error('[asaas] Falha ao criar assinatura:', JSON.stringify(subscription));
      throw new Error(asaasErrorMessage(subscription, 'Não foi possível criar a assinatura no Asaas. Tente novamente.'));
    }

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

  async getSubscriptionValueCents(gatewaySubscriptionId: string): Promise<number | null> {
    try {
      const sub = await asaasRequest(`/subscriptions/${gatewaySubscriptionId}`);
      return typeof sub?.value === 'number' ? Math.round(sub.value * 100) : null;
    } catch {
      return null;
    }
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
      dueDate: typeof payment?.dueDate === 'string' ? payment.dueDate.slice(0, 10) : null,
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
    if (typeof token !== 'string') return false;
    // Comparação em tempo constante: não dá para descobrir o token medindo
    // quanto tempo a resposta demora.
    const received = Buffer.from(token);
    const expected = Buffer.from(process.env.ASAAS_WEBHOOK_TOKEN);
    return received.length === expected.length && timingSafeEqual(received, expected);
  }
}
