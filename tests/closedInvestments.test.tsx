// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { splitClosedInvestments, canArchiveInvestment, closedOn } from '../lib/closedInvestments';
import ClosedInvestmentsPanel from '../components/assets/ClosedInvestmentsPanel';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/** Encerrados e arquivados em Patrimônio › Investimentos. */

const assets: any[] = [
  { id: 'ativo', name: 'CDB Ativo', category: 'INVESTMENT', estimatedValue: 1000, metadata: { status: 'ATIVO', brokerAccountId: 'safra' } },
  { id: 'lca', name: 'LCA BBM', category: 'INVESTMENT', estimatedValue: 0, metadata: { status: 'RESGATADO', brokerAccountId: 'safra', vencimentoDate: '2025-03-05' } },
  { id: 'fundo', name: 'Fundo Vertex', category: 'INVESTMENT', estimatedValue: 0, metadata: { status: 'RESGATADO', brokerAccountId: 'safra', resgateDate: '2025-06-26' } },
  { id: 'arq', name: 'CDB Antigo', category: 'INVESTMENT', estimatedValue: 0, is_archived: true, metadata: { status: 'RESGATADO', brokerAccountId: 'btg' } },
  { id: 'casa', name: 'Casa', category: 'REAL_ESTATE', estimatedValue: 0, is_archived: true, metadata: {} }
];
const brokers = [{ id: 'safra', name: 'Safra Investimentos Rodrigo' }, { id: 'btg', name: 'BTG Invest' }];

describe('regras', () => {
  it('separa encerrados e arquivados, mais recentes primeiro; ignora ativos e outros bens', () => {
    const { closed, archived } = splitClosedInvestments(assets, '2026-11-09');
    expect(closed.map(a => a.id)).toEqual(['fundo', 'lca']);
    expect(archived.map(a => a.id)).toEqual(['arq']);
  });

  it('só arquiva encerrado sem valor (o saldo da corretora não muda)', () => {
    expect(canArchiveInvestment(assets[1])).toBe(true);
    expect(canArchiveInvestment(assets[0])).toBe(false);
    expect(canArchiveInvestment({ ...assets[1], estimatedValue: 50 })).toBe(false);
    expect(canArchiveInvestment(assets[3])).toBe(false);
  });

  it('data de encerramento: resgate, senão vencimento já passado', () => {
    expect(closedOn(assets[2], '2026-11-09')).toBe('2025-06-26');
    expect(closedOn(assets[1], '2026-11-09')).toBe('2025-03-05');
    expect(closedOn({ ...assets[1], metadata: { vencimentoDate: '2030-01-01' } } as any, '2026-11-09')).toBeNull();
  });
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const btn = (label: string, scope: Element = container) => [...scope.querySelectorAll('button')].find(b => b.textContent?.includes(label))!;

describe('tela', () => {
  it('fechado por padrão; abre com corretora, data, extrato, arquivar e ver arquivados', async () => {
    const onOpenLedger = vi.fn(), onArchive = vi.fn(), onUnarchive = vi.fn();
    await act(async () => { root.render(<ClosedInvestmentsPanel assets={assets} brokers={brokers} onOpenLedger={onOpenLedger} onArchive={onArchive} onUnarchive={onUnarchive} />); });
    expect(container.textContent).toContain('Encerrados e arquivados');
    expect(container.textContent).toContain('2 encerrados · 1 arquivado');
    expect(container.textContent).not.toContain('LCA BBM');

    await act(async () => { btn('Encerrados e arquivados').click(); });
    const list = container.querySelector('[data-testid="closed-list"]')!;
    expect(list.textContent).toContain('LCA BBM');
    expect(list.textContent).toContain('Safra Investimentos Rodrigo');
    expect(list.textContent).toContain('Encerrado em 05/03/2025');
    expect(list.textContent).not.toContain('CDB Antigo');
    expect(container.textContent).not.toContain('CDB Ativo');

    await act(async () => { btn('Extrato', list).click(); });
    expect(onOpenLedger).toHaveBeenCalledWith(expect.objectContaining({ id: 'fundo' }));
    await act(async () => { btn('Arquivar', list).click(); });
    expect(onArchive).toHaveBeenCalledWith(expect.objectContaining({ id: 'fundo' }));

    expect(container.querySelector('[data-testid="archived-list"]')).toBeNull();
    await act(async () => { btn('Ver arquivados (1)').click(); });
    const arch = container.querySelector('[data-testid="archived-list"]')!;
    expect(arch.textContent).toContain('CDB Antigo');
    expect(arch.textContent).toContain('BTG Invest');
    await act(async () => { btn('Desarquivar', arch).click(); });
    expect(onUnarchive).toHaveBeenCalledWith(expect.objectContaining({ id: 'arq' }));
  });

  it('sem encerrados nem arquivados, não mostra nada', async () => {
    await act(async () => { root.render(<ClosedInvestmentsPanel assets={[assets[0]]} brokers={brokers} onOpenLedger={() => {}} onArchive={() => {}} onUnarchive={() => {}} />); });
    expect(container.textContent).toBe('');
  });
});
