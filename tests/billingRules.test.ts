import { describe, it, expect } from 'vitest';
import {
  addMonthsToIsoDate,
  addDaysToIsoDate,
  todayInSaoPaulo,
  computePaidPeriod,
  monthlyUsageWindow,
  isGraceExpired,
  computePlanChangeCreditDays,
  isValidCpfCnpj,
  resolveAsaasConfig,
  ASAAS_PRODUCTION_URL,
  ASAAS_SANDBOX_URL,
  OVERDUE_GRACE_DAYS,
} from '../api/_lib/payment/billing-rules';
import { isValidCpfCnpj as isValidCpfCnpjFront, formatCpfCnpj } from '../lib/cpfCnpj';

/**
 * Regras de cobrança: o que cada pagamento cobre, quando o plano é suspenso,
 * quanto vale o crédito numa troca de plano, a janela de uso de IA e a escolha
 * entre ambiente de testes e de produção do Asaas.
 */

describe('datas de cobrança', () => {
  it('soma meses sem pular mês', () => {
    expect(addMonthsToIsoDate('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsToIsoDate('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsToIsoDate('2026-11-15', 2)).toBe('2027-01-15');
    expect(addMonthsToIsoDate('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonthsToIsoDate('2026-05-10', 12)).toBe('2027-05-10');
  });

  it('soma dias atravessando o mês', () => {
    expect(addDaysToIsoDate('2026-11-28', 5)).toBe('2026-12-03');
    expect(addDaysToIsoDate('2026-11-28', 0)).toBe('2026-11-28');
  });

  it('"hoje" é o dia de Brasília, não o de Londres', () => {
    // 23h de Brasília do dia 10 = 02h UTC do dia 11
    expect(todayInSaoPaulo(new Date('2026-11-11T02:00:00Z'))).toBe('2026-11-10');
    expect(todayInSaoPaulo(new Date('2026-11-11T15:00:00Z'))).toBe('2026-11-11');
  });
});

describe('período coberto por um pagamento confirmado', () => {
  const now = new Date('2026-12-10T15:00:00Z');

  it('renovação mensal avança o período (o defeito antigo: ficava parado no 1º mês)', () => {
    const p = computePaidPeriod({
      dueDate: '2026-12-10', billingPeriod: 'monthly',
      currentPeriodStart: '2026-11-10T12:00:00Z', currentPeriodEnd: '2026-12-10T12:00:00Z', now,
    });
    expect(p).not.toBeNull();
    expect(p!.start).toBe('2026-12-10T03:00:00.000Z'); // 00:00 de Brasília
    expect(p!.end).toBe('2027-01-11T02:59:59.000Z');   // 23:59:59 de Brasília de 10/01
  });

  it('plano anual cobre 12 meses e semestral 6', () => {
    const anual = computePaidPeriod({ dueDate: '2026-12-10', billingPeriod: 'annual', currentPeriodStart: null, currentPeriodEnd: null, now });
    expect(anual!.end.slice(0, 10)).toBe('2027-12-11');
    const sem = computePaidPeriod({ dueDate: '2026-12-10', billingPeriod: 'semiannual', currentPeriodStart: null, currentPeriodEnd: null, now });
    expect(sem!.end.slice(0, 10)).toBe('2027-06-11');
  });

  it('aviso repetido do mesmo pagamento não muda nada', () => {
    const first = computePaidPeriod({ dueDate: '2026-12-10', billingPeriod: 'monthly', currentPeriodStart: null, currentPeriodEnd: '2026-12-10T12:00:00Z', now })!;
    const again = computePaidPeriod({ dueDate: '2026-12-10', billingPeriod: 'monthly', currentPeriodStart: first.start, currentPeriodEnd: first.end, now });
    expect(again).toBeNull();
  });

  it('o período nunca anda para trás', () => {
    const p = computePaidPeriod({
      dueDate: '2026-10-10', billingPeriod: 'monthly',
      currentPeriodStart: '2026-11-10T12:00:00Z', currentPeriodEnd: '2026-12-10T12:00:00Z', now,
    });
    expect(p).toBeNull();
  });

  it('primeira cobrança depois do teste grátis: o ciclo começa no fim do teste', () => {
    const p = computePaidPeriod({
      dueDate: '2026-12-09', billingPeriod: 'monthly',
      // gravado na criação como "hoje + 1 mês", com o teste ainda rodando
      currentPeriodStart: '2026-11-25T12:00:00Z', currentPeriodEnd: '2026-12-25T12:00:00Z', now,
    });
    expect(p!.start.slice(0, 10)).toBe('2026-12-09');
    expect(p!.end.slice(0, 10)).toBe('2027-01-10');
  });

  it('Pix pago antes do vencimento estende o fim sem jogar o início para o futuro', () => {
    const p = computePaidPeriod({
      dueDate: '2026-12-20', billingPeriod: 'monthly',
      currentPeriodStart: '2026-11-20T03:00:00.000Z', currentPeriodEnd: '2026-12-21T02:59:59.000Z', now,
    });
    expect(p!.start).toBe('2026-11-20T03:00:00.000Z');
    expect(p!.end.slice(0, 10)).toBe('2027-01-21');
  });

  it('sem vencimento no aviso, ancora em hoje; período desconhecido vale 1 mês', () => {
    const p = computePaidPeriod({ dueDate: null, billingPeriod: 'qualquer', currentPeriodStart: null, currentPeriodEnd: null, now });
    expect(p!.start.slice(0, 10)).toBe('2026-12-10');
    expect(p!.end.slice(0, 10)).toBe('2027-01-11');
  });
});

describe('janela mensal de uso de IA', () => {
  it('é o mês que contém "agora", ancorado no dia de início', () => {
    const w = monthlyUsageWindow('2026-01-15T10:00:00.000Z', new Date('2026-11-20T12:00:00Z'));
    expect(w).toEqual({ start: '2026-11-15T10:00:00.000Z', end: '2026-12-15T10:00:00.000Z' });
  });

  it('antes do dia-âncora ainda é o mês anterior', () => {
    const w = monthlyUsageWindow('2026-01-15T10:00:00.000Z', new Date('2026-11-10T12:00:00Z'));
    expect(w).toEqual({ start: '2026-10-15T10:00:00.000Z', end: '2026-11-15T10:00:00.000Z' });
  });

  it('plano anual não vira uma cota única para o ano (cada mês tem a sua)', () => {
    const jan = monthlyUsageWindow('2026-01-05T00:00:00.000Z', new Date('2026-01-20T00:00:00Z'));
    const jul = monthlyUsageWindow('2026-01-05T00:00:00.000Z', new Date('2026-07-20T00:00:00Z'));
    expect(jan.start).not.toBe(jul.start);
    expect(jul).toEqual({ start: '2026-07-05T00:00:00.000Z', end: '2026-08-05T00:00:00.000Z' });
  });

  it('âncora no dia 31 funciona em mês curto', () => {
    const w = monthlyUsageWindow('2026-01-31T00:00:00.000Z', new Date('2026-02-15T00:00:00Z'));
    expect(w).toEqual({ start: '2026-01-31T00:00:00.000Z', end: '2026-02-28T00:00:00.000Z' });
    const w2 = monthlyUsageWindow('2026-01-31T00:00:00.000Z', new Date('2026-03-01T00:00:00Z'));
    expect(w2.start).toBe('2026-02-28T00:00:00.000Z');
  });

  it('sempre contém o instante atual, mesmo sem âncora ou com âncora no futuro', () => {
    const now = new Date('2026-11-20T12:00:00Z');
    for (const anchor of [null, undefined, 'lixo', '2027-03-01T00:00:00.000Z', '2026-11-20T12:00:00.000Z']) {
      const w = monthlyUsageWindow(anchor as any, now);
      expect(Date.parse(w.start)).toBeLessThanOrEqual(now.getTime());
      expect(Date.parse(w.end)).toBeGreaterThan(now.getTime() - 1);
    }
  });
});

describe('tolerância no atraso', () => {
  const now = new Date('2026-11-20T12:00:00Z');
  it('não suspende antes do prazo', () => {
    expect(isGraceExpired('2026-11-17T12:00:00Z', now)).toBe(false);
    expect(isGraceExpired(null, now)).toBe(false);
    expect(isGraceExpired('lixo', now)).toBe(false);
  });
  it('suspende quando a tolerância acaba', () => {
    expect(OVERDUE_GRACE_DAYS).toBe(5);
    expect(isGraceExpired('2026-11-15T12:00:00Z', now)).toBe(true);
    expect(isGraceExpired('2026-11-01T12:00:00Z', now)).toBe(true);
  });
});

describe('troca de plano no meio do ciclo', () => {
  const start = '2026-11-01T03:00:00.000Z';
  const end = '2026-12-01T03:00:00.000Z';
  const mid = new Date('2026-11-16T03:00:00.000Z'); // metade do ciclo

  it('metade do mês pago vira dias do plano novo', () => {
    // pagou R$ 19,90, usou metade → R$ 9,95 de crédito; Pro mensal R$ 59,90 ≈ R$ 1,97/dia → 5 dias
    expect(computePlanChangeCreditDays({ paidCents: 1990, currentPeriodStart: start, currentPeriodEnd: end, newPriceCents: 5990, newBillingPeriod: 'monthly', now: mid })).toBe(5);
  });

  it('mesmo plano e preço: o crédito cobre o que faltava do ciclo', () => {
    expect(computePlanChangeCreditDays({ paidCents: 5990, currentPeriodStart: start, currentPeriodEnd: end, newPriceCents: 5990, newBillingPeriod: 'monthly', now: mid })).toBe(15);
  });

  it('do caro para o barato: crédito limitado a um ciclo do plano novo', () => {
    const days = computePlanChangeCreditDays({ paidCents: 57504, currentPeriodStart: '2026-11-01T03:00:00.000Z', currentPeriodEnd: '2027-11-01T03:00:00.000Z', newPriceCents: 1990, newBillingPeriod: 'monthly', now: mid });
    expect(days).toBe(30);
  });

  it('sem ciclo válido, ciclo já vencido ou valor zerado: nenhum crédito', () => {
    const base = { paidCents: 1990, newPriceCents: 5990, newBillingPeriod: 'monthly' as const, now: mid };
    expect(computePlanChangeCreditDays({ ...base, currentPeriodStart: null, currentPeriodEnd: null })).toBe(0);
    expect(computePlanChangeCreditDays({ ...base, currentPeriodStart: '2026-09-01T00:00:00Z', currentPeriodEnd: '2026-10-01T00:00:00Z' })).toBe(0);
    expect(computePlanChangeCreditDays({ ...base, paidCents: 0, currentPeriodStart: start, currentPeriodEnd: end })).toBe(0);
    expect(computePlanChangeCreditDays({ ...base, newPriceCents: 0, currentPeriodStart: start, currentPeriodEnd: end })).toBe(0);
  });
});

describe('CPF e CNPJ', () => {
  const validos = ['529.982.247-25', '52998224725', '11.222.333/0001-81', '11222333000181'];
  const invalidos = ['', null, undefined, '111.111.111-11', '529.982.247-26', '123', '11.222.333/0001-82', '00000000000000', 'abc'];

  it('aceita documentos válidos com ou sem pontuação', () => {
    for (const v of validos) expect(isValidCpfCnpj(v)).toBe(true);
  });
  it('recusa documentos inválidos', () => {
    for (const v of invalidos) expect(isValidCpfCnpj(v as any)).toBe(false);
  });
  it('a tela e o servidor respondem igual', () => {
    for (const v of [...validos, ...invalidos]) expect(isValidCpfCnpjFront(v as any)).toBe(isValidCpfCnpj(v as any));
  });
  it('formata enquanto digita', () => {
    expect(formatCpfCnpj('52998224725')).toBe('529.982.247-25');
    expect(formatCpfCnpj('5299822')).toBe('529.982.2');
    expect(formatCpfCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatCpfCnpj('112223330001819999')).toBe('11.222.333/0001-81');
  });
});

describe('ambiente do Asaas', () => {
  it('chave de produção fala com a produção mesmo sem endereço configurado', () => {
    const c = resolveAsaasConfig({ ASAAS_API_KEY: '$aact_prod_abc' });
    expect(c).toEqual({ apiKey: '$aact_prod_abc', baseUrl: ASAAS_PRODUCTION_URL, isProduction: true });
  });
  it('chave de testes continua no ambiente de testes (configuração atual não muda)', () => {
    const c = resolveAsaasConfig({ ASAAS_SANDBOX_KEY: '$aact_hmlg_abc' });
    expect(c).toEqual({ apiKey: '$aact_hmlg_abc', baseUrl: ASAAS_SANDBOX_URL, isProduction: false });
  });
  it('ASAAS_API_KEY tem prioridade sobre o nome antigo', () => {
    expect(resolveAsaasConfig({ ASAAS_API_KEY: '$aact_prod_nova', ASAAS_SANDBOX_KEY: '$aact_hmlg_velha' }).apiKey).toBe('$aact_prod_nova');
  });
  it('endereço explícito sempre vence', () => {
    const c = resolveAsaasConfig({ ASAAS_API_KEY: '$aact_prod_abc', ASAAS_BASE_URL: 'https://sandbox.asaas.com/api/v3/' });
    expect(c.baseUrl).toBe('https://sandbox.asaas.com/api/v3');
    expect(c.isProduction).toBe(false);
  });
  it('sem chave nenhuma não quebra', () => {
    expect(resolveAsaasConfig({})).toEqual({ apiKey: '', baseUrl: ASAAS_SANDBOX_URL, isProduction: false });
  });
});
