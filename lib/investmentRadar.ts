// Radar de Investimentos — motor das regras (sem rede, sem banco).
//
// O radar olha cada investimento e diz se está tudo bem, se merece atenção ou
// se é urgente pensar em sair. A regra de ouro é NÃO dar alarme falso:
//
//   · URGENTE só com DOIS ou mais sinais independentes, sendo pelo menos um
//     grave (ex.: notícia de recuperação judicial do emissor + preço de
//     mercado despencando). Um sinal sozinho, por pior que pareça, fica em
//     ATENÇÃO até outro confirmar.
//   · ATENÇÃO com qualquer sinal moderado ou grave.
//   · OK sem sinais (os informativos, como vencimento chegando, não mudam o nível).
//
// Toda sugestão de saída vem com a conta de sair hoje × segurar até o
// vencimento (exitMath), porque vender um título em crise pelo preço de
// mercado pode custar muito mais do que esperar.
//
// Quem usa: o servidor (api/_lib/investment-radar.ts, na varredura e no botão
// "Analisar agora") e a tela (components/assets/InvestmentRadarPanel.tsx).

export type RadarLevel = 'OK' | 'ATENCAO' | 'URGENTE';
export type SignalSeverity = 'info' | 'moderate' | 'severe';

export interface RadarSignal {
  /** Chave do tipo de sinal: dois sinais da mesma chave não contam como "independentes". */
  key: 'performance' | 'negative_months' | 'market_gap' | 'news' | 'concentration' | 'maturity';
  severity: SignalSeverity;
  label: string;
  detail: string;
}

export interface LedgerMovement {
  movement_type: string;
  amount: number;
  movement_date: string; // AAAA-MM-DD
  notes?: string | null;
}

export interface RadarAsset {
  id: string;
  name: string;
  estimated_value: number;
  acquisition_date?: string | null;
  metadata?: Record<string, any> | null;
}

export interface NewsAssessment {
  /** none = nada relevante; watch = notícia que pede acompanhamento; severe = evento de crédito grave. */
  risk: 'none' | 'watch' | 'severe';
  headline?: string;
  events?: string[];
}

/** Próxima checagem: OK uma vez por semana; ATENÇÃO e URGENTE todo dia. */
export const RECHECK_DAYS: Record<RadarLevel, number> = { OK: 7, ATENCAO: 1, URGENTE: 1 };

/** Um alerta urgente só é repetido no WhatsApp/push depois de 7 dias (ou se o nível mudar). */
export const RENOTIFY_DAYS = 7;

const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (n: number) => `${(n * 100).toFixed(1).replace('.', ',')}%`;
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const TAX_NOTE = /\bIR\b|come-?cotas|imposto|iof/i;

const monthKey = (date: string) => date.slice(0, 7);

const previousMonths = (today: string, count: number): string[] => {
  const [y, m] = today.split('-').map(Number);
  const out: string[] = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out; // do mais recente para o mais antigo
};

/** Quanto o movimento mexe no valor do ativo (a mesma regra do extrato no Patrimônio). */
const valueDelta = (m: LedgerMovement): number => {
  const amt = Number(m.amount) || 0;
  switch (m.movement_type) {
    case 'APORTE':
    case 'RENDIMENTO_ACUMULADO':
    case 'AJUSTE_MANUAL':
      return amt;
    case 'AMORTIZACAO':
    case 'RESGATE_PARCIAL':
    case 'RESGATE_TOTAL':
      return -Math.abs(amt);
    default:
      return 0; // RENDIMENTO_MENSAL sai do ativo para a conta
  }
};

/** Retorno do mês: rendimentos (acumulados e pagos) + marcações; impostos ficam de fora. */
const returnDelta = (m: LedgerMovement): number => {
  const amt = Number(m.amount) || 0;
  if (m.movement_type === 'RENDIMENTO_ACUMULADO' || m.movement_type === 'RENDIMENTO_MENSAL') return amt;
  if (m.movement_type === 'AJUSTE_MANUAL' && !TAX_NOTE.test(m.notes || '')) return amt;
  return 0;
};

export interface MonthlyReturn {
  month: string;
  startValue: number;
  income: number;
  rate: number;
}

/** Rentabilidade mês a mês a partir do extrato do ativo (só meses com saldo no começo). */
export function monthlyReturns(movements: LedgerMovement[], today: string, months = 6): MonthlyReturn[] {
  const sorted = [...movements].sort((a, b) => a.movement_date.localeCompare(b.movement_date));
  return previousMonths(today, months).map(month => {
    const startValue = sorted
      .filter(m => monthKey(m.movement_date) < month)
      .reduce((s, m) => s + valueDelta(m), 0);
    const income = sorted
      .filter(m => monthKey(m.movement_date) === month)
      .reduce((s, m) => s + returnDelta(m), 0);
    return { month, startValue: round2(startValue), income: round2(income), rate: startValue > 0 ? income / startValue : 0 };
  }).filter(r => r.startValue > 0);
}

/** CDI anual (ex.: 14,4) → taxa do mês. */
export const monthlyFromAnnual = (annualPct: number): number => Math.pow(1 + annualPct / 100, 1 / 12) - 1;

const isCdiLinked = (meta: Record<string, any>): boolean => {
  const interest = String(meta.interestType || '').toUpperCase();
  const type = String(meta.investmentType || '').toUpperCase();
  if (interest.includes('IPCA') || interest.includes('PRE')) return false;
  return interest.includes('CDI') || interest.includes('SELIC') || ['FUNDOS', 'CDB', 'LCI_LCA', 'POUPANCA'].includes(type);
};

/**
 * Desempenho contra o CDI nos últimos 3 meses com saldo (só para o que segue o CDI).
 * Abaixo de 70% do CDI nos 3 → moderado. Mês com perda → moderado; 2 meses
 * seguidos com perda → grave.
 */
export function performanceSignals(
  asset: RadarAsset,
  movements: LedgerMovement[],
  today: string,
  cdiMonthly: (month: string) => number
): RadarSignal[] {
  const meta = asset.metadata || {};
  const signals: RadarSignal[] = [];
  const recent = monthlyReturns(movements, today, 3);
  if (recent.length === 0) return signals;

  const negatives = recent.filter(r => r.income < 0);
  const lastTwoNegative = recent.length >= 2 && recent[0].income < 0 && recent[1].income < 0;
  if (negatives.length > 0) {
    signals.push({
      key: 'negative_months',
      severity: lastTwoNegative ? 'severe' : 'moderate',
      label: lastTwoNegative ? 'Perda em 2 meses seguidos' : 'Mês com perda',
      detail: negatives.map(r => `${r.month.split('-').reverse().join('/')}: ${brl(r.income)} (${pct(r.rate)})`).join(' · ')
    });
  }

  if (recent.length === 3 && isCdiLinked(meta)) {
    const ratios = recent.map(r => {
      const cdi = cdiMonthly(r.month);
      return cdi > 0 ? r.rate / cdi : 1;
    });
    if (ratios.every(x => x < 0.7)) {
      const avg = ratios.reduce((s, x) => s + x, 0) / ratios.length;
      signals.push({
        key: 'performance',
        severity: 'moderate',
        label: 'Rendendo bem abaixo do CDI',
        detail: `Média de ${Math.round(avg * 100)}% do CDI nos últimos 3 meses (abaixo de 70% em todos).`
      });
    }
  }
  return signals;
}

/**
 * Preço de mercado × curva (relatórios do banco trazem os dois; fica em
 * metadata.marketValue). Diferença de 10% ou mais → moderado; 25% ou mais → grave.
 */
export function marketGapSignal(asset: RadarAsset): RadarSignal | null {
  const meta = asset.metadata || {};
  const market = Number(meta.marketValue);
  const curve = Number(asset.estimated_value);
  if (!market || !curve || market >= curve) return null;
  const gap = 1 - market / curve;
  if (gap < 0.1) return null;
  const when = meta.marketValueDate ? ` em ${String(meta.marketValueDate).split('-').reverse().join('/')}` : '';
  return {
    key: 'market_gap',
    severity: gap >= 0.25 ? 'severe' : 'moderate',
    label: gap >= 0.25 ? 'Preço de mercado despencou' : 'Preço de mercado abaixo da curva',
    detail: `Mercado ${brl(market)} × curva ${brl(curve)}${when}: ${pct(gap)} abaixo. Vender hoje realiza essa perda; segurar até o vencimento depende do emissor pagar.`
  };
}

/** Vencimento nos próximos 30 dias: só informativo. */
export function maturitySignal(asset: RadarAsset, today: string): RadarSignal | null {
  const due = asset.metadata?.vencimentoDate;
  if (!due) return null;
  const days = Math.round((Date.parse(due) - Date.parse(today)) / 86400000);
  if (days < 0 || days > 30) return null;
  return {
    key: 'maturity',
    severity: 'info',
    label: 'Vence em breve',
    detail: `Vence em ${String(due).split('-').reverse().join('/')} (${days} dia${days === 1 ? '' : 's'}). Decida se vai resgatar ou reinvestir.`
  };
}

/** Um emissor com mais de 25% do total investido → moderado. */
export function concentrationSignal(asset: RadarAsset, issuerShare: number, issuer: string): RadarSignal | null {
  if (issuerShare <= 0.25) return null;
  return {
    key: 'concentration',
    severity: 'moderate',
    label: 'Muito concentrado num emissor',
    detail: `${issuer} representa ${pct(issuerShare)} de tudo que você tem investido. Se ele tiver problema, o impacto é grande.`
  };
}

export function newsSignal(news: NewsAssessment | null | undefined): RadarSignal | null {
  if (!news || news.risk === 'none') return null;
  return {
    key: 'news',
    severity: news.risk === 'severe' ? 'severe' : 'moderate',
    label: news.risk === 'severe' ? 'Notícia grave sobre o emissor' : 'Notícia para acompanhar',
    detail: [news.headline, ...(news.events || [])].filter(Boolean).join(' · ')
  };
}

/** Nível final: URGENTE exige 2+ sinais independentes com pelo menos 1 grave. */
export function classify(signals: RadarSignal[]): RadarLevel {
  const relevant = signals.filter(s => s.severity !== 'info');
  const keys = new Set(relevant.map(s => s.key));
  const hasSevere = relevant.some(s => s.severity === 'severe');
  if (hasSevere && keys.size >= 2) return 'URGENTE';
  if (relevant.length > 0) return 'ATENCAO';
  return 'OK';
}

/** Pontuação 0–100 (100 = tranquilo) só para ordenar a lista. */
export function score(signals: RadarSignal[]): number {
  const penalty = signals.reduce((s, x) => s + (x.severity === 'severe' ? 40 : x.severity === 'moderate' ? 15 : 0), 0);
  return Math.max(0, 100 - penalty);
}

/** IR regressivo de renda fixa pelo tempo de aplicação. */
export function fixedIncomeIrRate(days: number): number {
  if (days <= 180) return 0.225;
  if (days <= 360) return 0.2;
  if (days <= 720) return 0.175;
  return 0.15;
}

export interface ExitMath {
  holdGross: number;
  sellGross: number;
  costOfExit: number;
  irNote: string;
  note: string;
}

/**
 * Sair hoje × segurar. Com preço de mercado, sair hoje recebe o valor de
 * mercado; segurar recebe a curva se o emissor honrar. Sem preço de mercado
 * (fundos, CDB), sair e segurar valem o mesmo hoje.
 */
export function exitMath(asset: RadarAsset, today: string): ExitMath {
  const meta = asset.metadata || {};
  const curve = round2(Number(asset.estimated_value) || 0);
  const market = Number(meta.marketValue) ? round2(Number(meta.marketValue)) : curve;
  const exempt = !!meta.isTaxExempt || ['LCI_LCA', 'CRI_CRA', 'POUPANCA'].includes(String(meta.investmentType || ''));
  const start = asset.acquisition_date || meta.acquisitionDate;
  const days = start ? Math.max(0, Math.round((Date.parse(today) - Date.parse(start)) / 86400000)) : 0;
  const irNote = exempt
    ? 'Isento de IR para pessoa física.'
    : `IR sobre o lucro na saída: ${pct(fixedIncomeIrRate(days)).replace(',0', '')} (aplicado há ${days} dias).`;
  const costOfExit = round2(curve - market);
  const note = costOfExit > 0
    ? `Vender hoje recebe ${brl(market)}; segurar até o vencimento recebe a curva (${brl(curve)} hoje) se o emissor pagar. Sair agora custa ${brl(costOfExit)}.`
    : 'Sair hoje ou segurar dá o mesmo valor bruto agora; a decisão é sobre o risco de continuar.';
  return { holdGross: curve, sellGross: market, costOfExit, irNote, note };
}

export function nextCheckAt(level: RadarLevel, now: Date): string {
  return new Date(now.getTime() + RECHECK_DAYS[level] * 86400000).toISOString();
}

export function shouldNotify(
  prev: { level?: RadarLevel | null; notified_at?: string | null } | null,
  level: RadarLevel,
  now: Date
): boolean {
  if (level !== 'URGENTE') return false;
  if (!prev || prev.level !== 'URGENTE' || !prev.notified_at) return true;
  return now.getTime() - Date.parse(prev.notified_at) >= RENOTIFY_DAYS * 86400000;
}

/** Emissor para agrupar notícias e concentração: o cadastrado ou o nome do ativo. */
export function issuerOf(asset: RadarAsset): string {
  const meta = asset.metadata || {};
  return String(meta.issuer || meta.emissor || asset.name || '').trim();
}

export interface RadarEvaluation {
  level: RadarLevel;
  score: number;
  signals: RadarSignal[];
  exit: ExitMath;
}

export function evaluateAsset(params: {
  asset: RadarAsset;
  movements: LedgerMovement[];
  today: string;
  cdiMonthly: (month: string) => number;
  issuerShare: number;
  news?: NewsAssessment | null;
}): RadarEvaluation {
  const { asset, movements, today, cdiMonthly, issuerShare, news } = params;
  const signals: RadarSignal[] = [
    ...performanceSignals(asset, movements, today, cdiMonthly),
    marketGapSignal(asset),
    newsSignal(news),
    concentrationSignal(asset, issuerShare, issuerOf(asset)),
    maturitySignal(asset, today)
  ].filter(Boolean) as RadarSignal[];
  return { level: classify(signals), score: score(signals), signals, exit: exitMath(asset, today) };
}

export const LEVEL_LABEL: Record<RadarLevel, string> = { OK: 'Tranquilo', ATENCAO: 'Atenção', URGENTE: 'Urgente' };
