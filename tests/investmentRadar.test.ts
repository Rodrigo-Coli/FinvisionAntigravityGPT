import { describe, it, expect } from 'vitest';
import {
  classify, evaluateAsset, exitMath, marketGapSignal, monthlyReturns, newsSignal,
  performanceSignals, shouldNotify, monthlyFromAnnual, explainPerformance, vetNews, issuerTokens,
  type RadarSignal, type LedgerMovement
} from '../lib/investmentRadar';

const sig = (key: RadarSignal['key'], severity: RadarSignal['severity']): RadarSignal => ({ key, severity, label: '', detail: '' });

describe('radar: nível', () => {
  it('um sinal grave sozinho é só ATENÇÃO (sem alarme falso)', () => {
    expect(classify([sig('news', 'severe')])).toBe('ATENCAO');
  });
  it('URGENTE exige dois sinais independentes com um grave', () => {
    expect(classify([sig('news', 'severe'), sig('market_gap', 'moderate')])).toBe('URGENTE');
  });
  it('dois sinais da mesma chave não contam como independentes', () => {
    expect(classify([sig('news', 'severe'), sig('news', 'moderate')])).toBe('ATENCAO');
  });
  it('dois moderados sem grave ficam em ATENÇÃO', () => {
    expect(classify([sig('performance', 'moderate'), sig('concentration', 'moderate')])).toBe('ATENCAO');
  });
  it('informativo não muda o nível', () => {
    expect(classify([sig('maturity', 'info')])).toBe('OK');
  });
});

const fund = { id: 'a', name: 'Fundo DI', estimated_value: 1100, metadata: { investmentType: 'FUNDOS', interestType: 'CDI' } };
const ledger = (rates: Record<string, number>): LedgerMovement[] => [
  { movement_type: 'APORTE', amount: 1000, movement_date: '2026-01-10' },
  ...Object.entries(rates).map(([d, a]) => ({ movement_type: 'RENDIMENTO_ACUMULADO', amount: a, movement_date: d }))
];

describe('radar: desempenho', () => {
  const cdi = () => monthlyFromAnnual(14);

  it('rendimento mês a mês sai do extrato', () => {
    const r = monthlyReturns(ledger({ '2026-08-31': 11, '2026-09-30': 11, '2026-10-31': 11 }), '2026-11-07', 3);
    expect(r.map(x => x.month)).toEqual(['2026-10', '2026-09', '2026-08']);
    expect(r[2].startValue).toBe(1000);
  });

  it('abaixo de 70% do CDI nos 3 meses vira sinal moderado', () => {
    const s = performanceSignals(fund, ledger({ '2026-08-31': 3, '2026-09-30': 3, '2026-10-31': 3 }), '2026-11-07', cdi);
    expect(s.find(x => x.key === 'performance')?.severity).toBe('moderate');
  });

  it('rendendo perto do CDI não gera sinal', () => {
    const s = performanceSignals(fund, ledger({ '2026-08-31': 11, '2026-09-30': 11, '2026-10-31': 11 }), '2026-11-07', cdi);
    expect(s).toEqual([]);
  });

  it('dois meses seguidos de perda é grave; impostos não contam como perda', () => {
    const mv: LedgerMovement[] = [
      ...ledger({ '2026-08-31': 10 }),
      { movement_type: 'AJUSTE_MANUAL', amount: -5, movement_date: '2026-08-31', notes: 'IR come-cotas' },
      { movement_type: 'AJUSTE_MANUAL', amount: -20, movement_date: '2026-09-30', notes: 'marcação' },
      { movement_type: 'AJUSTE_MANUAL', amount: -20, movement_date: '2026-10-31', notes: 'marcação' }
    ];
    const s = performanceSignals(fund, mv, '2026-11-07', cdi);
    const neg = s.find(x => x.key === 'negative_months');
    expect(neg?.severity).toBe('severe');
    expect(neg?.detail).not.toContain('08/2026');
  });

  it('título prefixado/IPCA não é comparado com o CDI', () => {
    const cra = { ...fund, metadata: { investmentType: 'CRI_CRA', interestType: 'IPCA' } };
    const s = performanceSignals(cra, ledger({ '2026-08-31': 1, '2026-09-30': 1, '2026-10-31': 1 }), '2026-11-07', cdi);
    expect(s.find(x => x.key === 'performance')).toBeUndefined();
  });
});

describe('radar: mercado × curva e conta de saída', () => {
  const raizen = { id: 'r', name: 'CRA Raízen', estimated_value: 61418.18, acquisition_date: '2023-10-20', metadata: { investmentType: 'CRI_CRA', marketValue: 26133.78, marketValueDate: '2026-09-30' } };

  it('queda de mercado acima de 25% é grave', () => {
    expect(marketGapSignal(raizen)?.severity).toBe('severe');
  });

  it('conta de sair hoje mostra o custo de vender pelo mercado', () => {
    const e = exitMath(raizen, '2026-11-07');
    expect(e.costOfExit).toBeCloseTo(35284.4, 1);
    expect(e.irNote).toContain('Isento');
  });

  it('Raízen com notícia grave + mercado despencando = URGENTE', () => {
    const r = evaluateAsset({
      asset: raizen, movements: [], today: '2026-11-07', cdiMonthly: () => 0.01, issuerShare: 0.1,
      news: { risk: 'severe', headline: 'Recuperação extrajudicial' }
    });
    expect(r.level).toBe('URGENTE');
  });

  it('notícia "watch" é moderada', () => {
    expect(newsSignal({ risk: 'watch' })?.severity).toBe('moderate');
    expect(newsSignal({ risk: 'none' })).toBeNull();
  });
});

describe('radar: aviso', () => {
  const now = new Date('2026-11-07T12:00:00Z');
  it('avisa quando vira urgente e repete só depois de 7 dias', () => {
    expect(shouldNotify(null, 'URGENTE', now)).toBe(true);
    expect(shouldNotify({ level: 'ATENCAO' }, 'URGENTE', now)).toBe(true);
    expect(shouldNotify({ level: 'URGENTE', notified_at: '2026-11-04T12:00:00Z' }, 'URGENTE', now)).toBe(false);
    expect(shouldNotify({ level: 'URGENTE', notified_at: '2026-10-30T12:00:00Z' }, 'URGENTE', now)).toBe(true);
    expect(shouldNotify(null, 'ATENCAO', now)).toBe(false);
  });
});


describe('radar: por que subiu ou caiu', () => {
  const cdi = () => 0.01; // 1% ao mês
  const base = (meta: Record<string, any>, value = 10000) => ({ id: 'x', name: 'Título', estimated_value: value, metadata: meta });
  const moves = (incomes: number[]): LedgerMovement[] => [
    { movement_type: 'APORTE', amount: 10000, movement_date: '2026-06-05' },
    ...incomes.map((a, i) => ({ movement_type: 'RENDIMENTO_ACUMULADO', amount: a, movement_date: `2026-${String(8 + i).padStart(2, '0')}-28` }))
  ];

  it('acima do CDI: diz quanto e por quê (taxa prefixada travada)', () => {
    const e = explainPerformance(base({ investmentType: 'CDB', interestType: 'PRE', yieldRate: 15.5 }), moves([120, 121, 122]), '2026-11-10', cdi);
    expect(e.trend).toBe('up');
    expect(e.headline).toContain('acima do CDI');
    expect(e.points.join(' ')).toContain('Taxa prefixada de 15,5% ao ano');
    expect(e.points[0]).toContain('ago/2026');
  });

  it('mês com perda vira "caiu" e o mercado abaixo da curva é explicado sem chamar de perda', () => {
    const e = explainPerformance(
      base({ investmentType: 'CRI_CRA', interestType: 'PRE', yieldRate: 12.6, marketValue: 9000 }),
      moves([100, -50, 90]), '2026-11-10', cdi);
    expect(e.trend).toBe('down');
    expect(e.headline).toContain('set/2026');
    const text = e.points.join(' ');
    expect(text).toContain('abaixo da curva');
    expect(text).toContain('Não é perda se segurar até o vencimento');
  });

  it('fundo abaixo do CDI explica taxa de administração e come-cotas; IR do período aparece à parte', () => {
    const m = moves([60, 62, 61]);
    m.push({ movement_type: 'AJUSTE_MANUAL', amount: -30, movement_date: '2026-10-31', notes: 'come-cotas' });
    const e = explainPerformance(base({ investmentType: 'FUNDOS' }), m, '2026-11-10', cdi);
    expect(e.trend).toBe('down');
    expect(e.points.join(' ')).toContain('come-cotas');
    expect(e.points.join(' ')).toContain('IR/come-cotas descontado no período');
  });

  it('sem histórico: não inventa tendência', () => {
    const e = explainPerformance(base({ investmentType: 'FIIS' }), [], '2026-11-10', cdi);
    expect(e.trend).toBe('unknown');
    expect(e.points.join(' ')).toContain('aluguéis');
  });
});

describe('radar: trava contra notícia falsa ou de outra empresa', () => {
  it('nome do emissor sem palavras genéricas', () => {
    expect(issuerTokens('CRA Eucatex CDI 105,15%')).toEqual(['eucatex']);
    expect(issuerTokens('LCI Banco Inter Pré 13,20%')).toEqual(['inter']);
  });
  it('sem fonte: descarta', () => {
    expect(vetNews({ risk: 'severe', headline: 'Eucatex em RJ' }, 'Eucatex', 0)).toEqual({ risk: 'none' });
  });
  it('notícia de outra empresa: descarta', () => {
    expect(vetNews({ risk: 'watch', headline: 'Duratex tem prejuízo' }, 'CRA Eucatex', 3)).toEqual({ risk: 'none' });
  });
  it('cita o emissor e tem fonte: mantém só os fatos que citam o emissor', () => {
    const v = vetNews({ risk: 'watch', headline: 'Eucatex rebaixada', events: ['Fitch rebaixa Eucatex', 'Juros sobem no Brasil'] }, 'CRA Eucatex', 2);
    expect(v?.risk).toBe('watch');
    expect(v?.events).toEqual(['Fitch rebaixa Eucatex']);
  });
});
