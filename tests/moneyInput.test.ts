import { describe, it, expect } from 'vitest';
import { sanitizeMoneyTyping, parseMoneyInput, formatMoneyInput } from '../lib/moneyInput';

/**
 * Cupom (Labs), modo Parcial: digitar 190,96 ficava 190 — o campo guardava só
 * o número e, ao teclar a vírgula, redesenhava "190" sem ela.
 */
describe('valor digitado em R$', () => {
  it('a vírgula digitada fica no texto (era o que sumia)', () => {
    expect(sanitizeMoneyTyping('190,')).toBe('190,');
    expect(sanitizeMoneyTyping('190,9')).toBe('190,9');
    expect(parseMoneyInput('190,')).toBe(190);
  });

  it('190,96 vale 190,96', () => {
    expect(parseMoneyInput('190,96')).toBe(190.96);
  });

  it('aceita milhar com ponto e teclado que mostra ponto como decimal', () => {
    expect(parseMoneyInput('1.234,56')).toBe(1234.56);
    expect(parseMoneyInput('190.96')).toBe(190.96);
    expect(parseMoneyInput('1.234')).toBe(1234);
  });

  it('ignora letras e vírgulas a mais', () => {
    expect(sanitizeMoneyTyping('R$ 19,0,96')).toBe('19,096');
    expect(parseMoneyInput('abc')).toBe(0);
    expect(parseMoneyInput('')).toBe(0);
  });

  it('número volta para o campo com vírgula e 2 casas', () => {
    expect(formatMoneyInput(190.96)).toBe('190,96');
    expect(formatMoneyInput(190)).toBe('190,00');
    expect(formatMoneyInput(0)).toBe('');
  });
});
