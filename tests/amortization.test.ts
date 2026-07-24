import { describe, it, expect } from 'vitest';
import { computeInstallmentAmount, buildInstallmentDate } from '../lib/amortization';

// Caso real reportado pelo usuário (passivo "Piazza do Bosque"):
// saldo devedor 91.845,54 | 165 parcelas | 0,79% a.m. | SAC | 1ª parcela informada 1.277,56
const SALDO = 91845.54;
const N = 165;
const RATE = 0.79;
const PRIMEIRA = 1277.56;

describe('computeInstallmentAmount — âncora na 1ª parcela informada', () => {
  it('a parcela 1 é exatamente o valor informado no passivo', () => {
    expect(computeInstallmentAmount(1, SALDO, N, RATE, 0, true, PRIMEIRA)).toBe(PRIMEIRA);
  });

  it('SAC: as parcelas decrescem a partir da 1ª, sem saltos', () => {
    const serie = Array.from({ length: N }, (_, k) =>
      computeInstallmentAmount(k + 1, SALDO, N, RATE, 0, true, PRIMEIRA)
    );
    for (let i = 1; i < serie.length; i++) {
      expect(serie[i]).toBeLessThan(serie[i - 1]);
    }
    // Decréscimo constante = amortização × juros (SAC), ~R$ 4,36/mês neste contrato.
    const passo = serie[0] - serie[1];
    expect(passo).toBeCloseTo(4.36, 2);
    expect(serie[1] - serie[2]).toBeCloseTo(passo, 2);
    // Nenhuma parcela pode ficar negativa nem explodir acima da 1ª.
    expect(Math.min(...serie)).toBeGreaterThan(0);
    expect(Math.max(...serie)).toBe(PRIMEIRA);
  });

  it('a soma das amortizações cobre o saldo devedor informado (tolerância de arredondamento)', () => {
    const amortizacao = PRIMEIRA - SALDO * (RATE / 100);
    expect(amortizacao * N).toBeGreaterThan(SALDO * 0.98);
  });

  it('Price ancorado: todas as parcelas iguais ao valor informado', () => {
    for (const k of [1, 2, 50, N]) {
      expect(computeInstallmentAmount(k, SALDO, N, RATE, 0, false, PRIMEIRA)).toBe(PRIMEIRA);
    }
  });

  it('sem juros: todas iguais ao valor informado', () => {
    expect(computeInstallmentAmount(1, SALDO, N, 0, 0, true, PRIMEIRA)).toBe(PRIMEIRA);
    expect(computeInstallmentAmount(40, SALDO, N, 0, 0, true, PRIMEIRA)).toBe(PRIMEIRA);
  });

  it('reajuste só incide a partir da 2ª parcela (a 1ª é a âncora)', () => {
    expect(computeInstallmentAmount(1, SALDO, N, 0, 1, true, PRIMEIRA)).toBe(PRIMEIRA);
    expect(computeInstallmentAmount(2, SALDO, N, 0, 1, true, PRIMEIRA)).toBeCloseTo(PRIMEIRA * 1.01, 2);
  });

  it('parcela informada menor que os juros do 1º mês é ignorada (cai no cálculo teórico)', () => {
    const jurosMes1 = SALDO * (RATE / 100); // ~725,58
    const teorico = computeInstallmentAmount(1, SALDO, N, RATE, 0, true, 0);
    expect(computeInstallmentAmount(1, SALDO, N, RATE, 0, true, jurosMes1 - 100)).toBe(teorico);
  });
});

describe('computeInstallmentAmount — sem âncora mantém o comportamento antigo', () => {
  it('SAC teórico = saldo/n + juros sobre o saldo restante', () => {
    const amort = SALDO / N;
    expect(computeInstallmentAmount(1, SALDO, N, RATE, 0, true)).toBeCloseTo(amort + SALDO * 0.0079, 2);
    expect(computeInstallmentAmount(2, SALDO, N, RATE, 0, true)).toBeCloseTo(amort + (SALDO - amort) * 0.0079, 2);
  });

  it('Price teórico é constante', () => {
    const p1 = computeInstallmentAmount(1, SALDO, N, RATE, 0, false);
    expect(computeInstallmentAmount(80, SALDO, N, RATE, 0, false)).toBe(p1);
  });

  it('entradas inválidas devolvem 0', () => {
    expect(computeInstallmentAmount(1, 0, N, RATE, 0, true, PRIMEIRA)).toBe(0);
    expect(computeInstallmentAmount(1, SALDO, 0, RATE, 0, true, PRIMEIRA)).toBe(0);
  });
});

describe('buildInstallmentDate — vencimento não transborda de mês', () => {
  it('dia 29 em fevereiro de ano não bissexto vira 28/02 (antes virava 01/03)', () => {
    const d = buildInstallmentDate(2027, 1, 0, 29); // fev/2027
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(28);
  });

  it('dia 29 em fevereiro de ano bissexto continua 29/02', () => {
    const d = buildInstallmentDate(2028, 1, 0, 29);
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(29);
  });

  it('dia 31 em abril vira 30/04', () => {
    const d = buildInstallmentDate(2026, 3, 0, 31);
    expect(d.getMonth()).toBe(3);
    expect(d.getDate()).toBe(30);
  });

  it('offset de meses atravessa o ano corretamente', () => {
    const d = buildInstallmentDate(2026, 6, 7, 29); // jul/2026 + 7 = fev/2027
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(28);
  });

  it('mês com o dia existente não é alterado', () => {
    const d = buildInstallmentDate(2026, 6, 0, 29); // jul/2026
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(29);
  });
});
