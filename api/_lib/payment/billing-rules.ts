// Regras puras de cobrança (sem banco, sem rede) — tudo aqui é coberto por
// tests/billingRules.test.ts. Quem usa: asaas-webhook.ts, asaas-create-subscription.ts,
// maintenance.ts e ai-usage-limits.ts.

import type { BillingPeriod } from './types.js';

export const PERIOD_MONTHS: Record<BillingPeriod, number> = {
  monthly: 1,
  semiannual: 6,
  annual: 12,
};

// Dias de tolerância depois do vencimento antes de rebaixar quem já era pagante.
export const OVERDUE_GRACE_DAYS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Soma meses a uma data YYYY-MM-DD sem "pular" mês (31/01 + 1 mês = 28 ou 29/02). */
export function addMonthsToIsoDate(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const targetMonthIndex = (m - 1) + months;
  const year = y + Math.floor(targetMonthIndex / 12);
  const month = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Data de hoje (YYYY-MM-DD) no fuso de Brasília — é o fuso das cobranças. */
export function todayInSaoPaulo(now: Date = new Date()): string {
  return new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function addDaysToIsoDate(isoDate: string, days: number): string {
  const t = Date.parse(`${isoDate}T12:00:00Z`) + days * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

export interface PaidPeriodInput {
  /** Vencimento da cobrança que acabou de ser paga (payment.dueDate do Asaas). */
  dueDate: string | null | undefined;
  billingPeriod: BillingPeriod | string | null | undefined;
  currentPeriodStart: string | null | undefined;
  currentPeriodEnd: string | null | undefined;
  now?: Date;
}

/**
 * Período que um pagamento confirmado cobre. Devolve null quando não há o que
 * mudar (aviso repetido do mesmo pagamento, ou pagamento que não estende nada)
 * — o período nunca anda para trás.
 *
 * Antes desta regra, a renovação só marcava "ativo" e a data de fim ficava
 * parada no primeiro mês: quem cancelava a partir do 2º mês perdia o acesso
 * no dia seguinte, e os limites de IA paravam de contar.
 */
export function computePaidPeriod(input: PaidPeriodInput): { start: string; end: string } | null {
  const now = input.now ?? new Date();
  const months = PERIOD_MONTHS[(input.billingPeriod as BillingPeriod)] ?? 1;
  const today = todayInSaoPaulo(now);
  const anchor = isIsoDate(input.dueDate) ? input.dueDate : today;

  const endDate = addMonthsToIsoDate(anchor, months);
  const end = `${endDate}T23:59:59-03:00`;

  const currentEndMs = input.currentPeriodEnd ? Date.parse(input.currentPeriodEnd) : NaN;
  if (!Number.isNaN(currentEndMs) && Date.parse(end) <= currentEndMs) return null;

  // Pagou adiantado (Pix antes do vencimento): o fim já avança, mas o início
  // do ciclo atual não pode ir para o futuro.
  const anchorStart = `${anchor}T00:00:00-03:00`;
  const start = Date.parse(anchorStart) <= now.getTime()
    ? anchorStart
    : (input.currentPeriodStart || now.toISOString());

  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

/**
 * Janela MENSAL de uso de IA que contém "agora", ancorada no dia em que a
 * assinatura começou. Os limites dos planos são por mês; antes a janela era o
 * período de cobrança inteiro (um plano anual tinha a cota de 1 mês para 12) e,
 * depois da primeira renovação, a janela ficava no passado e nada era contado.
 */
export function monthlyUsageWindow(anchorIso: string | null | undefined, now: Date = new Date()): { start: string; end: string } {
  const anchorMs = anchorIso ? Date.parse(anchorIso) : NaN;
  const anchor = Number.isNaN(anchorMs) ? now : new Date(anchorMs);
  const anchorDate = anchor.toISOString().slice(0, 10);
  const timeOfDay = anchor.toISOString().slice(10); // "THH:MM:SS.sssZ"

  // (Vale também para âncora no futuro: a conta de meses fica negativa e a
  // janela devolvida continua sendo a que contém "agora".)
  let months = (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + (now.getUTCMonth() - anchor.getUTCMonth());
  let start = `${addMonthsToIsoDate(anchorDate, months)}${timeOfDay}`;
  if (Date.parse(start) > now.getTime()) {
    months -= 1;
    start = `${addMonthsToIsoDate(anchorDate, months)}${timeOfDay}`;
  }
  const end = `${addMonthsToIsoDate(anchorDate, months + 1)}${timeOfDay}`;
  return { start, end };
}

/** true quando o atraso já passou da tolerância e o plano pago deve ser suspenso. */
export function isGraceExpired(overdueSinceIso: string | null | undefined, now: Date = new Date(), graceDays = OVERDUE_GRACE_DAYS): boolean {
  if (!overdueSinceIso) return false;
  const since = Date.parse(overdueSinceIso);
  if (Number.isNaN(since)) return false;
  return now.getTime() - since >= graceDays * DAY_MS;
}

export interface ProrationInput {
  /** Quanto o cliente pagou pelo ciclo atual (em centavos). */
  paidCents: number;
  currentPeriodStart: string | null | undefined;
  currentPeriodEnd: string | null | undefined;
  /** Preço do novo plano para o novo período (em centavos). */
  newPriceCents: number;
  newBillingPeriod: BillingPeriod;
  now?: Date;
}

/**
 * Troca de plano no meio do ciclo: o que o cliente já pagou e ainda não usou
 * vira dias do plano novo antes da primeira cobrança. Nunca gera cobrança em
 * dobro nem perda do que foi pago.
 */
export function computePlanChangeCreditDays(input: ProrationInput): number {
  const now = (input.now ?? new Date()).getTime();
  const start = input.currentPeriodStart ? Date.parse(input.currentPeriodStart) : NaN;
  const end = input.currentPeriodEnd ? Date.parse(input.currentPeriodEnd) : NaN;
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start || end <= now) return 0;
  if (!(input.paidCents > 0) || !(input.newPriceCents > 0)) return 0;

  const unusedFraction = Math.min(1, Math.max(0, (end - now) / (end - start)));
  const creditCents = input.paidCents * unusedFraction;
  const newCycleDays = PERIOD_MONTHS[input.newBillingPeriod] * 30.4375;
  const newDailyCents = input.newPriceCents / newCycleDays;
  const days = Math.floor(creditCents / newDailyCents);
  // Teto: um ciclo inteiro do plano novo (ex.: anual caro trocado por mensal barato).
  return Math.max(0, Math.min(days, Math.floor(newCycleDays)));
}

function allSameDigit(digits: string): boolean {
  return /^(\d)\1+$/.test(digits);
}

export function isValidCpf(value: string): boolean {
  const d = String(value || '').replace(/\D/g, '');
  if (d.length !== 11 || allSameDigit(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function isValidCnpj(value: string): boolean {
  const d = String(value || '').replace(/\D/g, '');
  if (d.length !== 14 || allSameDigit(d)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

/** Aceita CPF (11 dígitos) ou CNPJ (14), com ou sem pontuação. */
export function isValidCpfCnpj(value: string | null | undefined): boolean {
  const d = String(value || '').replace(/\D/g, '');
  if (d.length === 11) return isValidCpf(d);
  if (d.length === 14) return isValidCnpj(d);
  return false;
}

export interface AsaasEnv {
  ASAAS_API_KEY?: string;
  ASAAS_SANDBOX_KEY?: string;
  ASAAS_BASE_URL?: string;
}

export const ASAAS_PRODUCTION_URL = 'https://api.asaas.com/v3';
export const ASAAS_SANDBOX_URL = 'https://sandbox.asaas.com/api/v3';

/**
 * Chave e endereço do Asaas. ASAAS_API_KEY é o nome certo; ASAAS_SANDBOX_KEY
 * continua aceito para não quebrar o que já está configurado. Sem
 * ASAAS_BASE_URL, o endereço acompanha a chave: chave de produção
 * ($aact_prod_...) fala com a produção — antes caía sempre no ambiente de
 * testes, e uma venda real "passaria" sem o dinheiro entrar.
 */
export function resolveAsaasConfig(env: AsaasEnv = process.env as AsaasEnv): { apiKey: string; baseUrl: string; isProduction: boolean } {
  const apiKey = (env.ASAAS_API_KEY || env.ASAAS_SANDBOX_KEY || '').trim();
  const explicitUrl = (env.ASAAS_BASE_URL || '').trim().replace(/\/+$/, '');
  const keyIsProduction = apiKey.startsWith('$aact_prod_');
  const baseUrl = explicitUrl || (keyIsProduction ? ASAAS_PRODUCTION_URL : ASAAS_SANDBOX_URL);
  const isProduction = /(^|\/\/)api\.asaas\.com/.test(baseUrl);
  return { apiKey, baseUrl, isProduction };
}
