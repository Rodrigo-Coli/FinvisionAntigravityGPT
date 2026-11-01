import { describe, it, expect } from 'vitest';
import { missedReleases } from '../lib/missedReleases';

const h = [
  { version: '2026.11.01.1400' },
  { version: '2026.11.01.1351' },
  { version: '2026.11.01.1338' },
  { version: '2026.10.30.0900' }
];

describe('versões puladas no aviso de atualização', () => {
  it('lista tudo entre a versão rodando (exclusive) e a do servidor (inclusive)', () => {
    expect(missedReleases(h, '2026.11.01.1338', '2026.11.01.1400').map(r => r.version))
      .toEqual(['2026.11.01.1400', '2026.11.01.1351']);
  });
  it('sem pular nada: só a versão nova', () => {
    expect(missedReleases(h, '2026.11.01.1351', '2026.11.01.1400').map(r => r.version)).toEqual(['2026.11.01.1400']);
  });
  it('histórico vazio ou inválido não quebra', () => {
    expect(missedReleases([] as any, 'x', 'y')).toEqual([]);
    expect(missedReleases(null as any, 'x', 'y')).toEqual([]);
  });
});
