import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Trava das notas de atualização
// ------------------------------
// O aviso de "Atualizar agora" mostra public/changelog.json e decide que há
// versão nova comparando public/version.json com a versão embutida no bundle.
// Já foi publicado código novo com as notas da versão ANTERIOR (o usuário via
// de novo "Venda parcelada..." numa entrega que era sobre o cupom). Como o
// `npm run build` da Vercel roda estes testes antes do vite, versão e notas
// descasadas agora derrubam o deploy em vez de chegar ao usuário.

const read = (p: string) => JSON.parse(readFileSync(p, 'utf-8'));
const version = read('public/version.json').version as string;
const changelog = read('public/changelog.json');
const history = read('public/changelog-history.json') as { version: string }[];

describe('notas de atualização', () => {
  it('version.json segue o formato AAAA.MM.DD.HHMM', () => {
    expect(version).toMatch(/^\d{4}\.\d{2}\.\d{2}\.\d{4}$/);
  });

  it('changelog.json é da mesma versão do version.json', () => {
    expect(changelog.version).toBe(version);
  });

  it('changelog.json tem título, data e ao menos um benefício', () => {
    expect(String(changelog.title || '').trim()).not.toBe('');
    expect(changelog.date).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(Array.isArray(changelog.benefits) && changelog.benefits.length).toBeTruthy();
    for (const b of changelog.benefits) {
      expect(String(b.title || '').trim()).not.toBe('');
      expect(String(b.desc || '').trim()).not.toBe('');
    }
  });

  it('a data das notas bate com a data da versão', () => {
    const [y, m, d] = version.split('.');
    expect(changelog.date).toBe(`${d}/${m}/${y}`);
  });

  it('o histórico começa pela versão atual, com as mesmas notas', () => {
    expect(history[0]).toEqual(changelog);
  });

  it('o histórico não repete versão e está do mais novo para o mais antigo', () => {
    const versions = history.map(h => h.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions).toEqual([...versions].sort().reverse());
  });
});
