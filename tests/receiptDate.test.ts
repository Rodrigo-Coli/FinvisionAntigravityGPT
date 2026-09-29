import { describe, it, expect } from 'vitest';
import { sanitizeReceiptDate } from '../lib/receiptDate';

describe('sanitizeReceiptDate', () => {
  it('mantém uma data plausível', () => {
    expect(sanitizeReceiptDate('2026-09-27', '2026-09-29')).toEqual({ date: '2026-09-27', adjusted: false });
    expect(sanitizeReceiptDate('2026-01-10', '2026-09-29')).toEqual({ date: '2026-01-10', adjusted: false });
  });

  it('ano chutado (caso real Rissul: 2023 no lugar de 2026) volta para o ano corrente', () => {
    expect(sanitizeReceiptDate('2023-09-28', '2026-09-28')).toEqual({ date: '2026-09-28', adjusted: true });
  });

  it('ano chutado que cairia no futuro usa o ano anterior', () => {
    expect(sanitizeReceiptDate('2023-12-30', '2026-01-05')).toEqual({ date: '2025-12-30', adjusted: true });
  });

  it('dia e mês invertidos (caso real Carrefour: 11/08 virou 08/11) são desfeitos', () => {
    expect(sanitizeReceiptDate('2026-11-08', '2026-08-15')).toEqual({ date: '2026-08-11', adjusted: true });
  });

  it('mês maior que 12 é tratado como dia e mês trocados', () => {
    expect(sanitizeReceiptDate('2026-15-09', '2026-09-29')).toEqual({ date: '2026-09-15', adjusted: true });
  });

  it('futuro sem inversão possível cai em hoje', () => {
    expect(sanitizeReceiptDate('2026-12-25', '2026-09-29')).toEqual({ date: '2026-09-29', adjusted: true });
  });

  it('aceita formato brasileiro, com e sem ano', () => {
    expect(sanitizeReceiptDate('28/09/2026', '2026-09-29')).toEqual({ date: '2026-09-28', adjusted: false });
    // Sem ano: o ano foi presumido, então o usuário é avisado para conferir.
    expect(sanitizeReceiptDate('28/09', '2026-09-29')).toEqual({ date: '2026-09-28', adjusted: true });
  });

  it('vazia ou ilegível vira hoje, marcada como ajustada', () => {
    expect(sanitizeReceiptDate('', '2026-09-29')).toEqual({ date: '2026-09-29', adjusted: true });
    expect(sanitizeReceiptDate(undefined, '2026-09-29')).toEqual({ date: '2026-09-29', adjusted: true });
    expect(sanitizeReceiptDate('ontem', '2026-09-29')).toEqual({ date: '2026-09-29', adjusted: true });
  });

  it('um dia à frente (fuso) não é tratado como futuro', () => {
    expect(sanitizeReceiptDate('2026-09-30', '2026-09-29')).toEqual({ date: '2026-09-30', adjusted: false });
  });
});

import { suspiciousDateReason } from '../lib/receiptDate';

describe('suspiciousDateReason', () => {
  const today = '2026-09-29';
  it('data recente não é suspeita', () => {
    expect(suspiciousDateReason('2026-09-28', today)).toBeNull();
    expect(suspiciousDateReason('2026-01-15', today)).toBeNull();
    expect(suspiciousDateReason('2026-09-30', today)).toBeNull(); // folga de fuso
  });
  it('futuro, muito antiga e inválida são apontadas', () => {
    expect(suspiciousDateReason('2026-11-08', today)).toBe('future');
    expect(suspiciousDateReason('2023-09-28', today)).toBe('old');
    expect(suspiciousDateReason('', today)).toBe('invalid');
    expect(suspiciousDateReason('2026-02-31', today)).toBe('invalid');
  });
});
