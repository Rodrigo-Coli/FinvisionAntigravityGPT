import type { PaymentGateway } from './types.js';
import { AsaasGateway } from './asaas-gateway.js';

const gateways: Record<string, PaymentGateway> = {
  asaas: new AsaasGateway(),
};

// Central de troca de gateway: para migrar de banco no futuro, basta
// implementar um novo PaymentGateway e mudar DEFAULT_PAYMENT_GATEWAY (env)
// ou o campo subscriptions.payment_gateway por usuário — nenhuma lógica de
// assinatura/cupom/comissão precisa mudar.
export function getPaymentGateway(name?: string | null): PaymentGateway {
  const key = name || process.env.DEFAULT_PAYMENT_GATEWAY || 'asaas';
  const gateway = gateways[key];
  if (!gateway) throw new Error(`Gateway de pagamento desconhecido: ${key}`);
  return gateway;
}

export * from './types.js';
