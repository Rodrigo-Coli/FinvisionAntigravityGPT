import { describe, it, expect, vi } from 'vitest';

/**
 * Painel (Início): parcelas a receber de um bem vendido (arquivado) somam no
 * patrimônio; de bem ainda ativo não (o valor do bem já está lá).
 */
const tables: Record<string, any[]> = {
  accounts: [{ current_balance: 1000, type: 'CHECKING', include_in_dashboard: true }],
  cards: [],
  physical_assets: [
    { id: 'A1', estimated_value: 50000, category: 'VEHICLE', metadata: {}, is_archived: false },
    { id: 'A2', estimated_value: 40000, category: 'VEHICLE', metadata: { isSold: true }, is_archived: true },
    // Vendido mas desarquivado (para editar): o valor do bem sai, as parcelas entram.
    { id: 'A3', estimated_value: 113000, category: 'VEHICLE', metadata: { isSold: true }, is_archived: false }
  ],
  entities: [],
  transactions: [
    { date: '2099-01-10', amount: 2000, type: 'INCOME', is_paid: false, paid_amount: 0, metadata: { type: 'vehicle_sale_installment', linked_asset_id: 'A2' } },
    { date: '2099-02-10', amount: 2000, type: 'INCOME', is_paid: false, paid_amount: 0, metadata: { type: 'vehicle_sale_installment', linked_asset_id: 'A2' } },
    { date: '2099-03-10', amount: 8000, type: 'INCOME', is_paid: false, paid_amount: 0, metadata: { type: 'vehicle_sale_installment', linked_asset_id: 'A3' } },
    { date: '2099-02-10', amount: 700, type: 'INCOME', is_paid: false, paid_amount: 0, metadata: { type: 'vehicle_sale_installment', linked_asset_id: 'A1' } }
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

describe('Painel soma vendas a receber', () => {
  it('parcelas pendentes do bem vendido entram no patrimônio', async () => {
    const d = await DashboardService.getSummary();
    // 1000 conta + 50000 bem ativo + 4000 (A2) + 8000 (A3) a receber dos vendidos
    expect(d.totalAssets).toBe(63000);
    expect(d.netWorth).toBe(63000);
  });
});
