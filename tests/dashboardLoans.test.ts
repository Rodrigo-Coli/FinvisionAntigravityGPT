import { describe, it, expect, vi } from 'vitest';

/**
 * Início: empréstimo concedido entra no "A receber" pelo valor em aberto HOJE
 * (o que falta receber), e não pelo valor original emprestado.
 */
const tables: Record<string, any[]> = {
  accounts: [{ id: 'C1', current_balance: 1000, type: 'CHECKING', include_in_dashboard: true }],
  cards: [],
  physical_assets: [
    { id: 'L1', name: 'Empréstimo', estimated_value: 10000, category: 'OTHER', is_archived: false, acquisition_date: '2025-01-01',
      metadata: { isLoan: true, loanType: 'INSTALLMENTS', loanPrincipal: 10000 } }
  ],
  entities: [],
  transactions: [
    { type: 'INCOME', amount: 3000, date: '2025-02-01', is_paid: true, metadata: { linked_asset_id: 'L1' } },
    { type: 'INCOME', amount: 1000, date: '2025-03-01', is_paid: true, metadata: { linked_asset_id: 'L1' } },
    // Ainda não recebido: não abate.
    { type: 'INCOME', amount: 2000, date: '2099-01-01', is_paid: false, metadata: { linked_asset_id: 'L1' } }
  ],
  liabilities: []
};

class Q {
  constructor(private t: string) {}
  select() { return this; }
  eq() { return this; }
  gte() { return this; }
  or() { return this; }
  in() { return this; }
  then(resolve: (v: any) => void) { resolve({ data: tables[this.t] || [], error: null }); }
}

vi.mock('../lib/supabase/client', () => ({ supabase: { from: (t: string) => new Q(t) } }));
vi.mock('../lib/session', () => ({ getSessionUser: async () => ({ id: 'u1' }) }));
vi.mock('../services/consortiumBalance.service', () => ({ syncAllConsortiumBalances: async () => {} }));

import { DashboardService } from '../services/dashboard.service';

describe('Início: empréstimo concedido pelo valor em aberto', () => {
  it('desconta o que já foi devolvido', async () => {
    const d: any = await DashboardService.getSummary();
    // 10000 emprestados − 4000 já recebidos = 6000 a receber
    expect(d.assetsBreakdown.receivables).toBe(6000);
    expect(d.receivablesDetail).toEqual({ sales: 0, loans: 6000 });
    expect(d.totalAssets).toBe(7000);
  });
});
