import { describe, it, expect } from 'vitest';
import { maskDateDigits, displayToIso, isoToDisplay } from '../components/common/DateInput';

/**
 * Campo de data: no celular o <input type="date"> não deixava digitar. Agora
 * digita-se só os números e as barras entram sozinhas (DD/MM/AAAA).
 */
describe('campo de data digitável', () => {
  it('as barras entram sozinhas enquanto se digita', () => {
    expect(maskDateDigits('2')).toBe('2');
    expect(maskDateDigits('25')).toBe('25');
    expect(maskDateDigits('251')).toBe('25/1');
    expect(maskDateDigits('2510')).toBe('25/10');
    expect(maskDateDigits('25102')).toBe('25/10/2');
    expect(maskDateDigits('25102026')).toBe('25/10/2026');
  });

  it('ignora o que não é número e para em 8 dígitos', () => {
    expect(maskDateDigits('25/10/2026')).toBe('25/10/2026');
    expect(maskDateDigits('25a10b2026999')).toBe('25/10/2026');
  });

  it('data completa e válida vira AAAA-MM-DD', () => {
    expect(displayToIso('25/10/2026')).toBe('2026-10-25');
    expect(displayToIso('29/02/2028')).toBe('2028-02-29');
  });

  it('data pela metade ou inexistente não vale', () => {
    expect(displayToIso('25/10')).toBeNull();
    expect(displayToIso('31/02/2026')).toBeNull();
    expect(displayToIso('29/02/2026')).toBeNull();
    expect(displayToIso('10/13/2026')).toBeNull();
    expect(displayToIso('00/10/2026')).toBeNull();
  });

  it('mostra AAAA-MM-DD como DD/MM/AAAA', () => {
    expect(isoToDisplay('2026-10-25')).toBe('25/10/2026');
    expect(isoToDisplay('2026-10-25T03:00:00Z')).toBe('25/10/2026');
    expect(isoToDisplay('')).toBe('');
    expect(isoToDisplay(null)).toBe('');
  });

  it('as datas de "Tudo" (0001 e 9999) aparecem vazias', () => {
    expect(isoToDisplay('0001-01-01')).toBe('');
    expect(isoToDisplay('9999-12-31')).toBe('');
  });
});
