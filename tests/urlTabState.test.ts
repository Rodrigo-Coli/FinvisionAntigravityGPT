import { describe, it, expect } from 'vitest';
import { resolveTabParam } from '../lib/urlTabState';

describe('resolveTabParam', () => {
  const VALID = ['overview', 'realestate', 'vehicles'] as const;

  it('retorna o valor do param quando ele está na lista de válidos', () => {
    expect(resolveTabParam('realestate', VALID, 'overview')).toBe('realestate');
  });

  it('retorna o default quando o param é null', () => {
    expect(resolveTabParam(null, VALID, 'overview')).toBe('overview');
  });

  it('retorna o default quando o param não está na lista de válidos', () => {
    expect(resolveTabParam('nao-existe', VALID, 'overview')).toBe('overview');
  });

  it('retorna o default quando o param é string vazia', () => {
    expect(resolveTabParam('', VALID, 'overview')).toBe('overview');
  });

  it('é case-sensitive (não normaliza maiúsculas/minúsculas)', () => {
    expect(resolveTabParam('RealEstate', VALID, 'overview')).toBe('overview');
  });
});
