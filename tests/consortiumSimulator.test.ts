import { describe, it, expect } from 'vitest';
import {
  simulatePlan, simulateFinancing, irr, npv, lotteryOdds, bidChance, evaluateBid,
  evaluateContemplatedQuota, evaluatePayoff, evaluateSale, targetSalePrice,
  baseInstallmentValue, installmentsToPct, annualToMonthly, existingQuotaPlan, aggregatePlans,
  capitalCoverage, evaluatePayoffPortfolio, manualContemplatedPlan
} from '../lib/consortiumSimulator';

/**
 * Motor do simulador de consórcio: plano em % da carta, como as
 * administradoras calculam. Os números da Ademicon 570-807 (contemplação de
 * out/2026) servem de prova.
 */

describe('plano do consórcio', () => {
  it('parcela integral, custo e prazo sem lance', () => {
    const r = simulatePlan({ credit: 100000, termMonths: 100, adminFeePct: 20, contemplationMonth: 10 });
    expect(r.planPct).toBe(120);
    expect(r.fullInstallment).toBeCloseTo(1200, 6);
    expect(r.postInstallment).toBeCloseTo(1200, 6);
    expect(r.monthsTotal).toBe(100);
    expect(r.totalInstallments).toBeCloseTo(120000, 4);
    expect(r.nominalCost).toBeCloseTo(20000, 4);
    expect(r.netCredit).toBe(100000);
  });

  it('parcela reduzida até contemplar: o restante é dividido pelos meses que faltam', () => {
    const r = simulatePlan({ credit: 100000, termMonths: 100, adminFeePct: 20, reducedPct: 50, contemplationMonth: 20 });
    expect(r.preInstallment).toBeCloseTo(600, 6);
    // 120% − 20 × 0,6% = 108% ÷ 80 meses = 1,35% → R$ 1.350
    expect(r.postInstallment).toBeCloseTo(1350, 6);
    expect(r.totalInstallments).toBeCloseTo(120000, 4);
    expect(r.monthsTotal).toBe(100);
  });

  it('reajuste anual corrige parcela e carta juntos', () => {
    const r = simulatePlan({ credit: 100000, termMonths: 24, adminFeePct: 0, annualIndexPct: 12, contemplationMonth: 1 });
    expect(r.rows[11].installment).toBeCloseTo(100000 / 24, 6);
    expect(r.rows[12].installment).toBeCloseTo((100000 / 24) * 1.12, 6);
    expect(r.totalInstallments).toBeCloseTo((100000 / 24) * 12 * 2.12, 4);
  });

  it('lance reduzindo prazo volta à parcela integral e encurta o plano', () => {
    const r = simulatePlan({ credit: 100000, termMonths: 100, adminFeePct: 0, contemplationMonth: 10, freeBidPct: 30, bidMode: 'REDUCE_TERM' });
    expect(r.bidCash).toBeCloseTo(30000, 6);
    expect(r.postInstallment).toBeCloseTo(1000, 6);
    expect(r.monthsTotal).toBe(70);
  });

  it('lance reduzindo parcela mantém o prazo', () => {
    const r = simulatePlan({ credit: 100000, termMonths: 100, adminFeePct: 0, contemplationMonth: 10, freeBidPct: 30, bidMode: 'REDUCE_INSTALLMENT' });
    expect(r.postInstallment).toBeCloseTo((60 / 90) * 1000, 6);
    expect(r.monthsTotal).toBe(100);
  });

  it('lance maior que o saldo é limitado e avisa', () => {
    const r = simulatePlan({ credit: 100000, termMonths: 10, adminFeePct: 0, contemplationMonth: 5, freeBidPct: 80 });
    expect(r.bidCash).toBeCloseTo(50000, 6);
    expect(r.monthsTotal).toBe(5);
    expect(r.warnings.join(' ')).toMatch(/maior que o saldo/);
  });

  it('seguro prestamista incide sobre o saldo, só depois de contemplar', () => {
    const r = simulatePlan({ credit: 100000, termMonths: 10, adminFeePct: 0, contemplationMonth: 2, insuranceMonthlyPct: 0.1 });
    expect(r.rows[0].insurance).toBe(0);
    expect(r.rows[1].insurance).toBe(0);
    expect(r.rows[2].insurance).toBeCloseTo(0.001 * 80000, 6); // saldo de 80% antes da 3ª
  });
});

describe('Ademicon 570-807 — lance em parcelas, como a administradora oferta', () => {
  const credit = 171789.09;
  it('1 parcela-base = carta × 124% ÷ 240; 60 embutidas + 72 pagas', () => {
    expect(baseInstallmentValue(credit, 124, 240)).toBeCloseTo(887.58, 2);
    const embPct = installmentsToPct(60, 124, 240);
    const freePct = installmentsToPct(72, 124, 240);
    const r = simulatePlan({ credit, termMonths: 132, adminFeePct: 24, contemplationMonth: 1, freeBidPct: freePct, embeddedBidPct: embPct, bidMode: 'REDUCE_INSTALLMENT' });
    expect(r.fullInstallment).toBeCloseTo(1613.78, 2);      // "Parcela Inicial" da proposta
    expect(r.bidEmbedded).toBeCloseTo(53254.7, 0);           // e-mail: 53.254,62
    expect(r.bidCash).toBeCloseTo(63905.6, 0);               // proposta: 63.905,54
    expect(r.netCredit).toBeCloseTo(118534.4, 0);            // e-mail: 118.534,47
    // Descontando a 1ª parcela paga, sobram 131 meses: (213.018 − 1.613,78 − 117.160) ÷ 131.
    expect(r.postInstallment).toBeCloseTo(719.43, 1);
  });
});

describe('cota existente: parte do saldo de hoje', () => {
  it('Ademicon 570-807 hoje: mesma conta do modal de lance do app (667,23)', () => {
    const base = existingQuotaPlan({ credit: 171789.09, balance: 206796.38, remainingMonths: 133, currentInstallment: 1554.86 });
    const r = simulatePlan({
      ...base, contemplationMonth: 1, freeBidPct: (63913.10 / 171789.09) * 100, embeddedBidPct: (53254.62 / 171789.09) * 100,
      bidMode: 'REDUCE_INSTALLMENT'
    });
    expect(r.preInstallment).toBeCloseTo(1554.86, 2);
    expect(r.balanceBeforeBid).toBeCloseTo(206796.38 - 1554.86, 2);
    expect(r.balanceAfterBid).toBeCloseTo(88073.80, 2);
    expect(r.postInstallment).toBeCloseTo(667.23, 2);
    expect(r.monthsTotal).toBe(133);
    expect(r.netCredit).toBeCloseTo(118534.47, 2);
  });

  it('parcela reduzida hoje: depois de contemplar o saldo é dividido nos meses que faltam', () => {
    const base = existingQuotaPlan({ credit: 116649.17, balance: 126349.11, remainingMonths: 48, currentInstallment: 398.36 });
    const r = simulatePlan({ ...base, contemplationMonth: 6 });
    expect(r.preInstallment).toBeCloseTo(398.36, 2);
    expect(r.postInstallment).toBeCloseTo((126349.11 - 6 * 398.36) / 42, 2);
    expect(r.totalInstallments).toBeCloseTo(126349.11, 2);
  });
});

describe('várias cotas — a proposta de 4 cotas do corretor', () => {
  it('reproduz cada cota e os totais (crédito, lance, crédito liberado, saque, parcela inicial)', () => {
    const quota = (credit: number, term: number, emb: number, paid: number) => simulatePlan({
      credit, termMonths: term, adminFeePct: 24, contemplationMonth: 1,
      embeddedBidPct: installmentsToPct(emb, 124, 240), freeBidPct: installmentsToPct(paid, 124, 240)
    });
    const results = [quota(171789.09, 132, 60, 72), quota(171789.09, 132, 60, 71), quota(174647.06, 128, 60, 65), quota(174647.06, 128, 60, 65)];
    const agg = aggregatePlans(results);
    // Linhas da proposta (Lance pago / Crédito / Saque líquido / Parcela inicial)
    expect(agg.quotas[0].bidCash).toBeCloseTo(63905.54, 0);
    expect(agg.quotas[1].bidCash).toBeCloseTo(63017.96, 0);
    expect(agg.quotas[2].bidCash).toBeCloseTo(58652.30, 0);
    expect(agg.quotas[0].netCredit).toBeCloseTo(118534.47, 0);
    expect(agg.quotas[2].netCredit).toBeCloseTo(120506.47, 0);
    expect(agg.quotas[0].netCash).toBeCloseTo(54628.93, 0);
    expect(agg.quotas[1].netCash).toBeCloseTo(55516.51, 0);
    expect(agg.quotas[2].netCash).toBeCloseTo(61854.17, 0);
    expect(agg.quotas[2].initialInstallment).toBeCloseTo(1691.89, 1);
    // Totais da proposta
    expect(agg.total.credit).toBeCloseTo(692872.30, 1);
    expect(agg.total.bidCash).toBeCloseTo(244228.11, 0);
    expect(agg.total.netCredit).toBeCloseTo(478081.89, 0);
    expect(agg.total.netCash).toBeCloseTo(233853.77, 0);
    expect(agg.total.initialInstallment).toBeCloseTo(6611.34, 1);
    // Saída mês a mês = soma das cotas
    expect(agg.monthly[0]).toBeCloseTo(6611.34, 1);
    expect(agg.monthly[5]).toBeCloseTo(results.reduce((s, r) => s + r.rows[5].installment, 0), 6);
    expect(agg.monthly.length).toBe(132);
  });
});

describe('capital livre e quitação com várias cotas', () => {
  it('capital sem rendimento paga as parcelas pelo número exato de meses', () => {
    const c = capitalCoverage(3000, 0, [1000, 1000, 1000, 1000]);
    expect(c.monthsCovered).toBe(3);
    expect(c.coversAll).toBe(false);
    expect(c.monthlyIncome).toBe(0);
  });

  it('rendimento e aluguel extra aumentam a cobertura; se paga tudo, mostra a sobra', () => {
    const c = capitalCoverage(100000, 12.682503013196976, [1000, 1000], 200);
    expect(c.monthlyIncome).toBeCloseTo(1000 + 200, 6); // 1% de 100 mil + 200
    expect(c.coveragePct).toBeCloseTo(120, 6);
    expect(c.coversAll).toBe(true);
    expect(c.leftover).toBeCloseTo(100402, 2);          // 100.000→100.200→(100.200×1,01+200−1.000)
  });

  it('quita no mês em que a última carta sai; usa os juros implícitos das parcelas reais', () => {
    // Financiamento real: 120 parcelas de 1.434,71 para 100 mil = 1% a.m.
    const fin = Array(120).fill(1434.709484);
    const q1 = simulatePlan({ credit: 80000, termMonths: 100, adminFeePct: 0, contemplationMonth: 1 });
    const q2 = simulatePlan({ credit: 80000, termMonths: 100, adminFeePct: 0, contemplationMonth: 3 });
    const r = evaluatePayoffPortfolio({ financingBalance: 100000, financingInstallments: fin, quotas: [q1, q2], opportunityPctYear: 12.682503013196976 });
    expect(r.impliedRatePctMonth).toBeCloseTo(1, 4);
    expect(r.payoffMonth).toBe(3);
    // Deve no mês 3 = saldo depois de 2 parcelas, mais 1 mês de juros (quita no lugar da 3ª).
    const owed3 = 100000 * Math.pow(1.01, 3) - 1434.709484 * (Math.pow(1.01, 2) + 1.01);
    expect(r.owedAtPayoff).toBeCloseTo(owed3, 0);
    expect(r.netCredit).toBe(160000);
    expect(r.freeCapital).toBeCloseTo(160000 - r.owedAtPayoff, 6);
    expect(r.bothBeforePayoff).toBeCloseTo(1434.709484 + 1600, 4);
    expect(r.consortiumAfter).toBeCloseTo(1600, 6);
  });

  it('consórcio digitado à mão: crédito e lance no mês 1, parcelas a partir do mês 2', () => {
    const m = manualContemplatedPlan({ netCredit: 240000, ownBid: 120000, installment: 1600, months: 131 });
    const r = evaluatePayoffPortfolio({
      financingBalance: 149249.88, financingInstallments: Array(161).fill(1268.62), quotas: [m], opportunityPctYear: 11.6
    });
    expect(r.payoffMonth).toBe(1);
    expect(r.owedAtPayoff).toBeCloseTo(149249.88 * (1 + r.impliedRatePctMonth / 100), 0);
    expect(r.consortiumAfter).toBe(1600);
    expect(r.newMoney).toBeCloseTo(240000 - r.owedAtPayoff - 120000, 6);
    expect(r.consortiumTotal).toBeCloseTo(1600 * 131, 4);
  });

  it('cota que você já tem: a parcela dela já é paga hoje e entra nos dois caminhos', () => {
    // 570-807 hoje: contemplada, crédito líquido 118.534,47, 132 × 667,23.
    const mine = simulatePlan({ ...existingQuotaPlan({ credit: 118534.47, balance: 88073.80, remainingMonths: 132, currentInstallment: 667.23 }), contemplationMonth: 1 });
    const fin = Array(161).fill(1268.62);
    const asMine = evaluatePayoffPortfolio({ financingBalance: 149249.88, financingInstallments: fin, quotas: [mine], committed: [true], opportunityPctYear: 11.6 });
    expect(asMine.alreadyPaying).toBeCloseTo(667.23, 2);
    expect(asMine.todayMonthly).toBeCloseTo(1935.85, 2);
    expect(asMine.consortiumAfter).toBeCloseTo(667.23, 2);
    expect(asMine.monthlyDifference).toBeCloseTo(1268.62, 2);     // deixa de pagar o financiamento inteiro
    expect(asMine.owedAtPayoff).toBeCloseTo(149862.44, 1);
    expect(asMine.freeCapital).toBeCloseTo(118534.47 - 149862.44, 1);
    // Com as parcelas da cota nos dois caminhos, a decisão é só "quitar um financiamento a ~0,41% a.m."
    // contra deixar o dinheiro rendendo a 11,6% a.a. (~0,92% a.m.) — quitar perde.
    const asNew = evaluatePayoffPortfolio({ financingBalance: 149249.88, financingInstallments: fin, quotas: [mine], opportunityPctYear: 11.6 });
    expect(asMine.advantage).not.toBeCloseTo(asNew.advantage, 0);
    expect(asMine.advantage).toBeLessThan(0);
  });

  it('cota que já tem fica fora dos custos (iguais nos dois caminhos): custos positivos, mesma diferença', () => {
    const mine = simulatePlan({ ...existingQuotaPlan({ credit: 118534.47, balance: 88073.80, remainingMonths: 132, currentInstallment: 667.23 }), contemplationMonth: 1 });
    const fin = Array(161).fill(1268.62);
    // Quitação à vista informada pelo banco: R$ 91.000 (juros implícitos ~1,185% a.m.).
    const r = evaluatePayoffPortfolio({ financingBalance: 91000, financingInstallments: fin, quotas: [mine, mine], committed: [true, true], opportunityPctYear: 11.6 });
    const o = Math.pow(1.116, 1 / 12) - 1;
    const pvFin = fin.reduce((s, v, i) => s + v / Math.pow(1 + o, i + 1), 0);
    expect(r.pvCostKeepFinancing).toBeCloseTo(pvFin, 2);                     // ≈ 106.407,57
    expect(r.pvCostSwitch).toBeCloseTo(r.owedAtPayoff / (1 + o), 2);         // só a quitação no mês 1
    expect(r.owedAtPayoff).toBeCloseTo(92078.18, 1);
    expect(r.advantage).toBeCloseTo(15167.69, 0);
    expect(r.newQuotaTotal).toBe(0);
  });

  it('reforma tira do capital investido; o resto rende e cobre as parcelas', () => {
    const q = simulatePlan({ credit: 200000, termMonths: 100, adminFeePct: 0, contemplationMonth: 1 });
    const r = evaluatePayoffPortfolio({
      financingBalance: 100000, financingRatePctMonth: 1, financingMonths: 120, quotas: [q],
      opportunityPctYear: 11.6, renovation: 30000, investRatePctYear: 12.682503013196976
    });
    expect(r.renovation).toBe(30000);
    expect(r.invested).toBeCloseTo(r.freeCapital - 30000, 6);
    expect(r.coverage.monthlyIncome).toBeCloseTo(r.invested * 0.01, 4);
  });
});

describe('taxas, TIR e valor presente', () => {
  it('TIR simples e fluxo ambíguo', () => {
    expect(irr([{ t: 0, v: -100 }, { t: 1, v: 110 }])!).toBeCloseTo(0.1, 6);
    expect(irr([{ t: 0, v: -100 }, { t: 1, v: 250 }, { t: 2, v: -150 }])).toBeNull();
    expect(npv(0, [{ t: 1, v: 5 }, { t: 2, v: 5 }])).toBe(10);
    expect(annualToMonthly(12.682503013196976)).toBeCloseTo(0.01, 9);
  });

  it('financiamento PRICE e SAC', () => {
    const price = simulateFinancing(100000, 12.682503013196976, 120, 'PRICE');
    expect(price.firstInstallment).toBeCloseTo(1434.71, 2);
    expect(price.lastInstallment).toBeCloseTo(1434.71, 2);
    expect(price.totalPaid).toBeCloseTo(1434.709484 * 120, 1);
    const sac = simulateFinancing(100000, 12.682503013196976, 100, 'SAC');
    expect(sac.firstInstallment).toBeCloseTo(1000 + 1000, 6);
    expect(sac.lastInstallment).toBeCloseTo(1000 * 1.01, 6);
  });
});

describe('chances de contemplação', () => {
  it('sorteio: por assembleia, em 12 meses e espera média', () => {
    const o = lotteryOdds(1000, 2);
    expect(o.perAssemblyPct).toBeCloseTo(0.2, 9);
    expect(o.withinMonthsPct).toBeCloseTo((1 - Math.pow(0.998, 12)) * 100, 9);
    expect(o.expectedMonths).toBeCloseTo(500, 9);
  });
  it('lance contra o histórico do grupo', () => {
    expect(bidChance(50, 35, 45)).toBe('ALTA');
    expect(bidChance(40, 35, 45)).toBe('MEDIA');
    expect(bidChance(30, 35, 45)).toBe('BAIXA');
    expect(bidChance(30)).toBe('SEM_DADOS');
  });
});

describe('vale a pena dar o lance', () => {
  const plan = { credit: 200000, termMonths: 180, adminFeePct: 18, reserveFundPct: 2, annualIndexPct: 5 };
  it('sem ganho em antecipar, lance livre custa (dinheiro rende mais que o índice)', () => {
    const d = evaluateBid({ plan, bidMonth: 6, freeBidPct: 40, lotteryMonth: 90, opportunityPctYear: 11.6, monthlyBenefit: 0 });
    expect(d.monthsAnticipated).toBe(84);
    expect(d.advantage).toBeLessThan(0);
  });
  it('com aluguel economizado alto, compensa — e há um lance máximo', () => {
    const d = evaluateBid({ plan, bidMonth: 6, freeBidPct: 40, lotteryMonth: 90, opportunityPctYear: 11.6, monthlyBenefit: 2500 });
    expect(d.advantage).toBeGreaterThan(0);
    expect(d.maxWorthwhileFreeBidPct).not.toBeNull();
    expect(d.maxWorthwhileFreeBidPct!).toBeGreaterThanOrEqual(40);
    // No lance máximo a vantagem é ~zero.
    const atMax = evaluateBid({ plan, bidMonth: 6, freeBidPct: d.maxWorthwhileFreeBidPct!, lotteryMonth: 90, opportunityPctYear: 11.6, monthlyBenefit: 2500 });
    if (d.maxWorthwhileFreeBidPct! < d.withBid.planPct - 0.01) expect(Math.abs(atMax.advantage)).toBeLessThan(1);
  });
});

describe('cota contemplada, quitação e venda', () => {
  it('cota contemplada: CET pela TIR', () => {
    const q = evaluateContemplatedQuota({ entry: 0, credit: 100000, installment: 1434.709484, remainingMonths: 120 });
    expect(q.cetMonthlyPct!).toBeCloseTo(1, 4);
    const withEntry = evaluateContemplatedQuota({ entry: 20000, credit: 100000, installment: 1000, remainingMonths: 100 });
    expect(withEntry.nominalCost).toBeCloseTo(20000, 6);
    expect(withEntry.cetMonthlyPct!).toBeGreaterThan(0);
  });

  it('quitar financiamento: capital livre e comparação em valor presente', () => {
    const r = evaluatePayoff({
      financingBalance: 100000, financingRatePctYear: 12.682503013196976, financingMonths: 120,
      netCredit: 150000, ownBid: 0, consortiumInstallment: 1000, consortiumMonths: 120, opportunityPctYear: 12.682503013196976
    });
    expect(r.freeCapital).toBe(50000);
    expect(r.pvCostKeepFinancing).toBeCloseTo(100000, 0); // PV das parcelas à própria taxa = saldo
    expect(r.monthlyDifference).toBeCloseTo(434.71, 1);
  });

  it('quitar financiamento usando as parcelas reais cadastradas', () => {
    const r = evaluatePayoff({
      financingBalance: 149249.88, financingRatePctYear: 0, financingMonths: 161,
      financingInstallments: Array(161).fill(1268.62),
      netCredit: 240000, ownBid: 120000, consortiumInstallment: 1600, consortiumMonths: 131, opportunityPctYear: 11.6
    });
    expect(r.financing.totalPaid).toBeCloseTo(204247.82, 2);
    expect(r.financing.firstInstallment).toBe(1268.62);
    expect(r.freeCapital).toBeCloseTo(90750.12, 2);
    expect(r.monthlyDifference).toBeCloseTo(-331.38, 2);
  });

  it('venda: lucro, % total, TIR e preço para uma meta', () => {
    const payments = [{ date: '2026-01-01', amount: 1000 }, { date: '2026-07-01', amount: 1000 }];
    const s = evaluateSale(payments, 2400, '2027-01-01', 0);
    expect(s.invested).toBe(2000);
    expect(s.profit).toBe(400);
    expect(s.profitPct).toBe(20);
    expect(s.monthlyIrrPct!).toBeGreaterThan(0);
    expect(targetSalePrice(payments, '2027-01-01', 20, 'TOTAL')).toBe(2400);
    const priceAtIrr = targetSalePrice(payments, '2027-01-01', s.monthlyIrrPct!, 'MONTHLY');
    expect(priceAtIrr).toBeCloseTo(2400, 2);
  });
});
