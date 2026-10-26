import { describe, it, expect, vi } from 'vitest';

/**
 * Painel (Início): bem arquivado (vendido/devolvido) e dívida arquivada não
 * entram no patrimônio nem nas dívidas — mesma regra da tela de Patrimônio.
 */
const tables: Record<string, any[]> = {
  accounts: [{ current_balance: 1000, type: 'CHECKING', include_in_dashboard: true }],
  cards: [],
  physical_assets: [
    { id: 'A1', estimated_value: 500000, category: 'REAL_ESTATE', metadata: { propertyStage: 'PRONTO' }, is_archived: false },
    { id: 'A2', estimated_value: 294350, category: 'REAL_ESTATE', metadata: { propertyStage: 'PLANTA', deliveryBalance: 191327.7 }, is_archived: true }
  ],
  entities: [],
  transactions: [],
  liabilities: [
    { id: 'L1', type: 'MORTGAGE', remaining_balance: 100000, linked_asset_id: 'A1', is_archived: false, metadata: {} },
    { id: 'L2', type: 'MORTGAGE', remaining_balance: 50000, linked_asset_id: 'A1', is_archived: true, metadata: {} },
    // Saldo a financiar do imóvel devolvido, ainda não arquivado no banco: também fica fora.
    { id: 'L3', type: 'MORTGAGE', remaining_balance: 191327.7, linked_asset_id: 'A2', is_archived: false, metadata: { isPendingFinancing: true } }
  ]
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

describe('Painel ignora o que foi arquivado', () => {
  it('bem e dívida arquivados ficam fora do patrimônio e das dívidas', async () => {
    const d = await DashboardService.getSummary();
    expect(d.totalAssets).toBe(501000);
    expect(d.totalLiabilities).toBe(100000);
    expect(d.netWorth).toBe(401000);
  });
});
