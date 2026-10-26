import { describe, it, expect } from 'vitest';
import { applyAiSimulation, blankQuota, quotaFromKnown, matchesQuotaDescription, SimulationState, KnownConsortium } from '../lib/consortiumSimState';

/**
 * A IA só manda parâmetros; aqui eles são validados e aplicados. Cota minha
 * parte sempre do cadastro (a IA não inventa saldo).
 */
const known: KnownConsortium[] = [{
  id: 'C1', name: 'Ademicon 570-807', administrator: 'Ademicon', status: 'WAITING', credit: 171789.09, totalMonths: 137,
  adminFeePct: 24, reserveFundPct: 0, balance: 206796.38, remainingMonths: 133, currentInstallment: 1554.86
}];
const base: SimulationState = { premises: { index: '6,66', insurance: '0', opportunity: '11,6' }, quotas: [blankQuota(1)] };

describe('aplicar a resposta da IA', () => {
  it('sem cotas na resposta, mantém as cotas e aplica só as premissas', () => {
    const r = applyAiSimulation({ reply: 'ok', premises: { indexPct: 5, opportunityPct: 10 } }, base, known);
    expect(r.quotas).toBe(base.quotas);
    expect(r.premises).toEqual({ index: '5', insurance: '0', opportunity: '10' });
  });

  it('monta cota nova com os números pedidos, e cota minha a partir do cadastro', () => {
    const r = applyAiSimulation({
      quotas: [
        { name: 'Ademicon 560 A', credit: 174647.06, termMonths: 128, adminFeePct: 24, bidUnit: 'INST', baseTermMonths: 240, embeddedBid: 60, freeBid: 65, contemplationInMonths: 1 },
        { source: 'C1', bidUnit: 'BRL', freeBid: 63913.10, embeddedBid: 53254.62, contemplationInMonths: 1, bidMode: 'REDUCE_INSTALLMENT' }
      ]
    }, base, known);
    expect(r.quotas).toHaveLength(2);
    expect(r.quotas[0]).toMatchObject({ name: 'Ademicon 560 A', source: '', credit: '174647,06', term: '128', adm: '24', unit: 'INST', baseTerm: '240', emb: '60', free: '65', month: '1' });
    expect(r.quotas[1]).toMatchObject({ name: 'Ademicon 570-807', source: 'C1', balance: '206796,38', remaining: '133', installment: '1554,86', unit: 'BRL', free: '63913,1', emb: '53254,62' });
  });

  it('ignora origem desconhecida e limita valores absurdos', () => {
    const r = applyAiSimulation({ quotas: [{ source: 'NAO_EXISTE', credit: 1e12, termMonths: 9999, adminFeePct: 300, bidUnit: 'XYZ', contemplationInMonths: -3 }] }, base, known);
    expect(r.quotas[0]).toMatchObject({ source: '', credit: '100000000', term: '420', adm: '60', unit: 'PCT', month: '1' });
  });

  it('editar por IA preserva a cota (mesma chave) e o que a IA não mudou', () => {
    const first = applyAiSimulation({ quotas: [{ source: 'C1', freeBid: 30, contemplationInMonths: 3 }] }, base, known);
    const edited = { ...first, quotas: [{ ...first.quotas[0], balance: '200000' }] }; // usuário editou à mão
    const again = applyAiSimulation({ quotas: [{ source: 'C1', bidMode: 'REDUCE_TERM' }] }, edited, known);
    expect(again.quotas[0].key).toBe(first.quotas[0].key);
    expect(again.quotas[0]).toMatchObject({ balance: '200000', free: '30', month: '3', mode: 'REDUCE_TERM' });
  });

  it('no máximo 12 cotas', () => {
    const r = applyAiSimulation({ quotas: Array.from({ length: 20 }, (_, i) => ({ name: `Q${i}`, credit: 100000 })) }, base, known);
    expect(r.quotas).toHaveLength(12);
  });

  it('cota do cadastro sem passivo fica com campos vazios', () => {
    const q = quotaFromKnown({ ...known[0], balance: null, remainingMonths: null, currentInstallment: null });
    expect(q).toMatchObject({ balance: '', remaining: '', installment: '' });
  });
});

describe('pagamentos antigos da cota pela descrição', () => {
  it('reconhece os formatos usados e não confunde cotas', () => {
    expect(matchesQuotaDescription('Grupo 1119 cota 403', '1119', '403')).toBe(true);
    expect(matchesQuotaDescription('GRUPO: 1119 - COTA: 0403', 1119, 403)).toBe(true);
    expect(matchesQuotaDescription('Consórcio HS 1119-403 parcela 7', '1119', '403')).toBe(true);
    expect(matchesQuotaDescription('Boleto 1119/403', '1119', '403')).toBe(true);
    expect(matchesQuotaDescription('Grupo 1119 cota 440', '1119', '403')).toBe(false);
    expect(matchesQuotaDescription('Grupo 1119 cota 4030', '1119', '403')).toBe(false);
    expect(matchesQuotaDescription('Grupo 11190 cota 403', '1119', '403')).toBe(false);
    expect(matchesQuotaDescription('Pgto Boleto Hs Administradora de Consorcio', '1119', '403')).toBe(false);
    expect(matchesQuotaDescription('Grupo 1119 cota 403', '', '403')).toBe(false);
  });
});
