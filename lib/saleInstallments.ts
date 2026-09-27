/**
 * Plano de recebimento de uma venda parcelada (veículo, outros bens, imóvel).
 *
 * Antes a venda "Parcelado" gerava SEMPRE 10 parcelas mensais do valor cheio,
 * começando na data de hoje (não na data da venda). Não havia como informar
 * entrada, quantidade de parcelas nem periodicidade — uma venda de "entrada +
 * 12x" ficava com parcelas e valores errados.
 *
 * Regra do plano:
 *   saldo = valor da venda − entrada
 *   parcela = saldo / quantidade (centavos da divisão vão para a última parcela,
 *   para a soma bater exatamente com o valor da venda).
 *
 * Parcelas já RECEBIDAS são preservadas: ao reeditar o bem, só as pendentes são
 * recalculadas, e o saldo delas desconta o que já entrou. Assim a soma
 * entrada + recebidas + pendentes continua igual ao valor da venda, e a mesma
 * parcela não é gerada em dobro.
 */

export type SaleInstallmentFrequency =
  | 'SEMANAL'
  | 'QUINZENAL'
  | 'MENSAL'
  | 'BIMESTRAL'
  | 'TRIMESTRAL'
  | 'SEMESTRAL'
  | 'ANUAL';

export const SALE_FREQUENCY_OPTIONS: { value: SaleInstallmentFrequency; label: string }[] = [
  { value: 'SEMANAL', label: 'Semanal' },
  { value: 'QUINZENAL', label: 'Quinzenal' },
  { value: 'MENSAL', label: 'Mensal' },
  { value: 'BIMESTRAL', label: 'Bimestral' },
  { value: 'TRIMESTRAL', label: 'Trimestral' },
  { value: 'SEMESTRAL', label: 'Semestral' },
  { value: 'ANUAL', label: 'Anual' }
];

const FREQUENCY_STEP: Record<SaleInstallmentFrequency, { days?: number; months?: number }> = {
  SEMANAL: { days: 7 },
  QUINZENAL: { days: 15 },
  MENSAL: { months: 1 },
  BIMESTRAL: { months: 2 },
  TRIMESTRAL: { months: 3 },
  SEMESTRAL: { months: 6 },
  ANUAL: { months: 12 }
};

export const isSaleFrequency = (v: any): v is SaleInstallmentFrequency =>
  typeof v === 'string' && v in FREQUENCY_STEP;

const round2 = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Data da parcela de índice `index` (0 = primeira parcela) a partir de `firstDateISO`.
 * Trabalha só com a parte da data (YYYY-MM-DD), sem fuso. Nos passos mensais o dia é
 * preso ao último dia do mês quando não existe (dia 31 em fevereiro → 28/29), sempre
 * relativo ao dia ORIGINAL, para a sequência não "escorregar" (31/01 → 28/02 → 31/03).
 */
export const addSalePeriod = (firstDateISO: string, frequency: SaleInstallmentFrequency, index: number): string => {
  const [y, m, d] = firstDateISO.split('T')[0].split('-').map(Number);
  const step = FREQUENCY_STEP[frequency] || FREQUENCY_STEP.MENSAL;

  if (step.days) {
    const dt = new Date(Date.UTC(y, m - 1, d + step.days * index));
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  }

  const totalMonths = (m - 1) + (step.months || 1) * index;
  const year = y + Math.floor(totalMonths / 12);
  const month = ((totalMonths % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${pad(month + 1)}-${pad(Math.min(d, lastDay))}`;
};

export interface SalePlanInput {
  /** Valor total da venda. */
  total: number;
  /** Entrada (0 quando não há). */
  downPayment: number;
  /** Quantidade de parcelas do saldo (sem contar a entrada). */
  installmentsCount: number;
  frequency: SaleInstallmentFrequency;
  /** Vencimento da 1ª parcela (YYYY-MM-DD). */
  firstInstallmentDate: string;
  /** Parcelas já recebidas: número da parcela → valor recebido. */
  receivedInstallments?: { number: number; amount: number }[];
}

export interface SalePlanInstallment {
  number: number;
  total: number;
  amount: number;
  date: string;
}

/**
 * Parcelas PENDENTES a gerar. As já recebidas não entram (continuam no banco como
 * estão) e o valor delas é descontado do saldo antes da divisão.
 */
export const buildSaleInstallmentPlan = (input: SalePlanInput): SalePlanInstallment[] => {
  const n = Math.max(0, Math.floor(Number(input.installmentsCount) || 0));
  if (n <= 0) return [];

  const received = (input.receivedInstallments || []).filter(r => r.number >= 1 && r.number <= n);
  const receivedNumbers = new Set(received.map(r => r.number));
  const receivedTotal = received.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const balance = round2(Math.max(0, (Number(input.total) || 0) - (Number(input.downPayment) || 0) - receivedTotal));
  const pendingNumbers = Array.from({ length: n }, (_, i) => i + 1).filter(k => !receivedNumbers.has(k));
  if (pendingNumbers.length === 0 || balance <= 0) return [];

  const base = Math.floor((balance / pendingNumbers.length) * 100) / 100;
  const last = round2(balance - base * (pendingNumbers.length - 1));

  return pendingNumbers.map((num, idx) => ({
    number: num,
    total: n,
    amount: idx === pendingNumbers.length - 1 ? last : base,
    date: addSalePeriod(input.firstInstallmentDate, input.frequency, num - 1)
  }));
};

/**
 * Valor de cada parcela para pré-visualização no formulário (antes de salvar).
 */
export const previewSaleInstallment = (total: number, downPayment: number, count: number): number => {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n <= 0) return 0;
  const balance = Math.max(0, (Number(total) || 0) - (Number(downPayment) || 0));
  return round2(balance / n);
};

/**
 * Lê as configurações de parcelamento do formulário/metadata com os padrões antigos
 * (10x mensal, sem entrada) para bens vendidos antes desta mudança.
 */
export const readSalePlanSettings = (values: Record<string, any>, fallbackDate: string) => {
  const count = parseInt(String(values.saleInstallmentsCount ?? ''), 10);
  const frequency = isSaleFrequency(values.saleInstallmentFrequency) ? values.saleInstallmentFrequency : 'MENSAL';
  return {
    downPayment: parseFloat(String(values.saleDownPayment ?? '')) || 0,
    downPaymentDate: (values.saleDownPaymentDate || values.saleDate || fallbackDate) as string,
    installmentsCount: Number.isFinite(count) && count > 0 ? count : 10,
    frequency: frequency as SaleInstallmentFrequency,
    firstInstallmentDate: (values.saleFirstInstallmentDate || values.saleDate || fallbackDate) as string
  };
};

/** Linha já recebida (total ou parcialmente): não pode ser apagada nem regerada. */
export const isSaleRowSettled = (row: { is_paid?: boolean | null; paid_amount?: any }) =>
  !!row.is_paid || (Number(row.paid_amount) || 0) > 0.005;

export interface SyncSalePlanParams {
  supabase: any;
  userId: string;
  assetId: string;
  /** metadata.type das parcelas (ex.: 'vehicle_sale_installment'). */
  installmentType: string;
  /** metadata.type da entrada (ex.: 'vehicle_sale_down_payment'). */
  downPaymentType: string;
  /** Formulário/metadata do bem com os campos sale*. */
  values: Record<string, any>;
  total: number;
  todayISO: string;
  describeInstallment: (n: number, total: number) => string;
  describeDownPayment: () => string;
  /** Campos comuns das linhas de receita (category, subcategory, category_id...). */
  baseRow: Record<string, any>;
}

/**
 * Regrava o plano de recebimento da venda parcelada:
 *  1. apaga entrada/parcelas ainda NÃO recebidas (serão recalculadas);
 *  2. mantém as já recebidas e desconta o valor delas do saldo;
 *  3. cria a entrada (se houver e ainda não existir) e as parcelas pendentes.
 */
export const syncSaleInstallmentPlan = async (p: SyncSalePlanParams) => {
  const settings = readSalePlanSettings(p.values, p.todayISO);

  const { data: existing, error: fetchError } = await p.supabase
    .from('transactions')
    .select('id, amount, is_paid, paid_amount, installment_number, metadata')
    .eq('user_id', p.userId)
    .eq('is_deleted', false)
    .eq('metadata->>linked_asset_id', p.assetId)
    .in('metadata->>type', [p.installmentType, p.downPaymentType]);
  if (fetchError) throw fetchError;

  const rows: any[] = existing || [];
  const toDelete = rows.filter(r => !isSaleRowSettled(r)).map(r => r.id);
  if (toDelete.length > 0) {
    const { error } = await p.supabase.from('transactions').delete().in('id', toDelete);
    if (error) throw error;
  }

  const settled = rows.filter(isSaleRowSettled);
  const hasDownPayment = settled.some(r => r.metadata?.type === p.downPaymentType);
  const receivedInstallments = settled
    .filter(r => r.metadata?.type === p.installmentType)
    .map(r => ({
      number: Number(r.metadata?.installment ?? r.installment_number) || 0,
      amount: Number(r.amount) || 0
    }))
    .filter(r => r.number > 0);

  const inserts: Record<string, any>[] = [];

  if (settings.downPayment > 0 && !hasDownPayment) {
    // Entrada com data já passada/hoje = dinheiro recebido no ato (como o "À Vista").
    const received = settings.downPaymentDate <= p.todayISO;
    inserts.push({
      ...p.baseRow,
      user_id: p.userId,
      description: p.describeDownPayment(),
      amount: round2(settings.downPayment),
      date: settings.downPaymentDate,
      type: 'INCOME',
      is_paid: received,
      paid_amount: received ? round2(settings.downPayment) : 0,
      paid_at: received ? settings.downPaymentDate : null,
      metadata: { linked_asset_id: p.assetId, type: p.downPaymentType }
    });
  }

  const plan = buildSaleInstallmentPlan({
    total: p.total,
    downPayment: settings.downPayment,
    installmentsCount: settings.installmentsCount,
    frequency: settings.frequency,
    firstInstallmentDate: settings.firstInstallmentDate,
    receivedInstallments
  });

  plan.forEach(inst => {
    inserts.push({
      ...p.baseRow,
      user_id: p.userId,
      description: p.describeInstallment(inst.number, inst.total),
      amount: inst.amount,
      date: inst.date,
      type: 'INCOME',
      is_paid: false,
      paid_amount: 0,
      is_installment: true,
      installment_number: inst.number,
      installment_total: inst.total,
      metadata: {
        linked_asset_id: p.assetId,
        type: p.installmentType,
        installment: inst.number,
        installment_total: inst.total,
        frequency: settings.frequency
      }
    });
  });

  if (inserts.length > 0) {
    const { error } = await p.supabase.from('transactions').insert(inserts);
    if (error) throw error;
  }
};
