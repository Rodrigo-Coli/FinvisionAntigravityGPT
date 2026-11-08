import { describe, it, expect } from 'vitest';
import { addMonthsIso, nextCycle, estimateCoupon, isLikelyCouponCredit, nameTokens, wantsForecast } from '../lib/couponForecast';

const idx = { cdiAnnual: 14, ipcaAnnual: 4.5 };

describe('cronograma dos juros', () => {
  it('soma meses sem estourar o fim do mês', () => {
    expect(addMonthsIso('2027-01-15', 6)).toBe('2027-07-15');
    expect(addMonthsIso('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonthsIso('2026-12-15', 1)).toBe('2027-01-15');
  });

  it('Eucatex semestral: próximo em 15/01/2027 (julho já recebido)', () => {
    const meta = { couponFrequency: 'SEMESTRAL', couponNextDate: '2027-01-15', vencimentoDate: '2030-01-15' };
    expect(nextCycle(meta, ['2026-01-15', '2026-07-15'], '2026-11-08')).toBe('2027-01-15');
  });

  it('depois de receber, anda para o próximo semestre', () => {
    const meta = { couponFrequency: 'SEMESTRAL', couponNextDate: '2027-01-15' };
    expect(nextCycle(meta, ['2027-01-16'], '2027-01-20')).toBe('2027-07-15');
  });

  it('data cadastrada antiga pula para o próximo pagamento futuro', () => {
    const meta = { couponFrequency: 'SEMESTRAL', couponNextDate: '2025-12-15' };
    expect(nextCycle(meta, [], '2026-11-08')).toBe('2026-12-15');
  });

  it('não prevê depois do vencimento', () => {
    const meta = { couponFrequency: 'SEMESTRAL', couponNextDate: '2030-01-15', vencimentoDate: '2029-12-31' };
    expect(nextCycle(meta, [], '2026-11-08')).toBeNull();
  });

  it('pagamento único já recebido não gera outro', () => {
    expect(nextCycle({ couponFrequency: 'NONE', couponNextDate: '2026-11-01' }, ['2026-11-01'], '2026-11-08')).toBeNull();
    expect(nextCycle({ couponFrequency: 'NONE', couponNextDate: '2026-12-01' }, [], '2026-11-08')).toBe('2026-12-01');
  });

  it('só prevê quando o título pede', () => {
    expect(wantsForecast({ couponNextDate: '2027-01-15' })).toBe(true);
    expect(wantsForecast({ couponNextDate: '2027-01-15', couponForecast: false })).toBe(false);
    expect(wantsForecast({ couponNextDate: '2027-01-15', status: 'RESGATADO' })).toBe(false);
    expect(wantsForecast({ couponNextDate: '' })).toBe(false);
    expect(wantsForecast(null)).toBe(false);
  });
});

describe('valor estimado', () => {
  it('usa o último juro recebido', () => {
    const movs = [
      { movement_type: 'APORTE', amount: 7000, movement_date: '2025-01-15' },
      { movement_type: 'RENDIMENTO_MENSAL', amount: 543.37, movement_date: '2026-01-15' },
      { movement_type: 'RENDIMENTO_MENSAL', amount: 507.28, movement_date: '2026-07-15' }
    ];
    expect(estimateCoupon(movs, { couponFrequency: 'SEMESTRAL' }, '2027-01-15', idx)).toBe(507.28);
  });

  it('sem histórico, projeta pela taxa sobre o aplicado', () => {
    const movs = [{ movement_type: 'APORTE', amount: 10000, movement_date: '2026-01-10' }];
    const est = estimateCoupon(movs, { couponFrequency: 'SEMESTRAL', interestType: 'PRE', yieldRate: '12' }, '2027-01-15', idx)!;
    expect(est).toBeGreaterThan(500);
    expect(est).toBeLessThan(650);
  });

  it('sem histórico e sem taxa: não inventa valor', () => {
    expect(estimateCoupon([{ movement_type: 'APORTE', amount: 1000, movement_date: '2026-01-01' }], { couponFrequency: 'SEMESTRAL' }, '2027-01-15', idx)).toBeNull();
  });
});

describe('reconhecer o crédito do extrato do banco', () => {
  const ctx = { cycle: '2027-01-15', estimate: 507.28, tokens: nameTokens('CRA Eucatex CDI 105,15%') };

  it('lança do banco com o nome do emissor e valor parecido', () => {
    expect(ctx.tokens).toContain('eucatex');
    expect(isLikelyCouponCredit({ date: '2027-01-15', amount: 521.9, description: 'Pgto Jur/amort Cra Cdi Eucatex Industria E Co', type: 'INCOME' }, ctx)).toBe(true);
  });

  it('não pega Pix, salário ou valor muito diferente', () => {
    expect(isLikelyCouponCredit({ date: '2027-01-15', amount: 500, description: 'PIX RECEBIDO MARIA', type: 'INCOME' }, ctx)).toBe(false);
    expect(isLikelyCouponCredit({ date: '2027-01-15', amount: 5000, description: 'Pgto Juros Eucatex', type: 'INCOME' }, ctx)).toBe(false);
    expect(isLikelyCouponCredit({ date: '2027-03-15', amount: 507.28, description: 'Pgto Juros Eucatex', type: 'INCOME' }, ctx)).toBe(false);
    expect(isLikelyCouponCredit({ date: '2027-01-15', amount: 507.28, description: 'Pgto Juros Eucatex', type: 'EXPENSE' }, ctx)).toBe(false);
  });

  it('crédito já ligado a outro investimento não serve', () => {
    expect(isLikelyCouponCredit({ date: '2027-01-15', amount: 507.28, description: 'Juros Eucatex', type: 'INCOME', metadata: { linked_asset_id: 'outro' } }, ctx)).toBe(false);
  });
});
