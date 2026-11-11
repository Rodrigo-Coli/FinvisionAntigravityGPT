// Contrato comum a qualquer gateway de pagamento (Asaas hoje; Stripe, Pagar.me,
// Mercado Pago etc. amanhã) — o resto do sistema (assinaturas, comissão de
// indicação, cupons) nunca fala diretamente com a API de um banco específico.

export type PaymentMethod = 'PIX' | 'CREDIT_CARD';
export type BillingPeriod = 'monthly' | 'semiannual' | 'annual';

export interface CreditCardInput {
  holderName: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  ccv: string;
}

export interface CreditCardHolderInfoInput {
  name: string;
  email: string;
  cpfCnpj: string;
  postalCode: string;
  addressNumber: string;
  phone: string;
}

export interface CreateSubscriptionParams {
  customerEmail: string;
  customerExternalReference: string;
  valueReais: number;
  billingPeriod: BillingPeriod;
  nextDueDate: string; // YYYY-MM-DD
  paymentMethod: PaymentMethod;
  description: string;
  externalReference: string;
  creditCard?: CreditCardInput;
  creditCardHolderInfo?: CreditCardHolderInfoInput;
  remoteIp?: string;
  // Dados do pagador para o cadastro do cliente no gateway. O CPF/CNPJ é
  // exigido pelo Asaas para emitir cobrança (Pix inclusive).
  customerName?: string;
  customerCpfCnpj?: string;
  customerPhone?: string;
}

export interface PixData {
  paymentId: string;
  qrCode: string;
  copiaECola: string;
  expirationDate: string;
}

export interface CreateSubscriptionResult {
  gatewaySubscriptionId: string;
  gatewayCustomerId: string;
  nextDueDate: string;
  pix: PixData | null;
}

export type NormalizedWebhookEventType =
  | 'payment_confirmed'
  | 'payment_overdue'
  | 'payment_refunded'
  | 'payment_chargeback'
  | 'payment_deleted'
  | 'subscription_deleted'
  | 'ignored';

export interface NormalizedWebhookEvent {
  type: NormalizedWebhookEventType;
  gatewaySubscriptionId: string | null;
  gatewayPaymentId: string | null;
  amountCents: number | null;
  externalReference: string | null;
  /** Vencimento (YYYY-MM-DD) da cobrança do evento — ancora o período pago. */
  dueDate: string | null;
}

export interface PaymentGateway {
  readonly name: string;
  createSubscription(params: CreateSubscriptionParams): Promise<CreateSubscriptionResult>;
  cancelSubscription(gatewaySubscriptionId: string): Promise<void>;
  /** Valor (em centavos) cobrado a cada ciclo de uma assinatura existente; null se não der para saber. */
  getSubscriptionValueCents(gatewaySubscriptionId: string): Promise<number | null>;
  normalizeWebhookEvent(payload: any): NormalizedWebhookEvent;
  verifyWebhookAuth(req: any): boolean;
}
