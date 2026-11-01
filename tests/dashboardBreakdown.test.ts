import { describe, it, expect, vi } from 'vitest';

/**
 * Início: investimento vinculado a uma corretora já está no saldo dela — não
 * soma de novo como bem. E os ativos saem separados (contas, investimentos,
 * bens, a receber).
 */
const tables: Record<string, any[]> = {
  accounts: [
    { id: 'C1', current_balance: 1000, type: 'CHECKING', include_in_dashboard: true },
    { id: 'B1', current_balance: 50000, type: 'INVESTMENT', include_in_dashboard: true }
  ],
  cards: [],
  physical_assets: [
    { id: 'I1', estimated_value: 45000, category: 'INVESTMENT', metadata: { brokerAccountId: 'B1' }, is_archived: false },
    { id: 'I2', estimated_value: 3000, category: 'INVESTMENT', metadata: {}, is_archived: false },
    { id: 'V1', estimated_value: 80000, category: 'VEHICLE', metadata: {}, is_archived: false },
    { id: 'L1', estimated_value: 10000, category: 'OTHER', metadata: { isLoan: true }, is_archived: false }
  ],
  entities: [],
  transactions: [],
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

describe('Início: ativos separados e sem contar investimento duas vezes', () => {
  it('investimento da corretora não soma de novo; os grupos batem com o total', async () => {
    const d: any = await DashboardService.getSummary();
    // 1000 + 50000 (corretora, já com os 45000) + 3000 (sem corretora) + 80000 + 10000
    expect(d.totalAssets).toBe(144000);
    expect(d.assetsBreakdown).toEqual({ accounts: 1000, investments: 53000, physical: 80000, receivables: 10000 });
  });
});
