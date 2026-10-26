import { describe, it, expect } from 'vitest';
import { isOrphanPendingFinancing } from '../lib/pendingFinancing';

describe('saldo a financiar de bem arquivado', () => {
  const archived = new Set(['A2']);
  it('só o saldo a definir de bem arquivado sai', () => {
    expect(isOrphanPendingFinancing({ linked_asset_id: 'A2', metadata: { isPendingFinancing: true } }, archived)).toBe(true);
    expect(isOrphanPendingFinancing({ linkedAssetId: 'A2', metadata: { isPendingFinancing: true } }, archived)).toBe(true);
    // Financiamento de verdade continua, mesmo com o bem arquivado.
    expect(isOrphanPendingFinancing({ linked_asset_id: 'A2', metadata: {} }, archived)).toBe(false);
    expect(isOrphanPendingFinancing({ linked_asset_id: 'A1', metadata: { isPendingFinancing: true } }, archived)).toBe(false);
    expect(isOrphanPendingFinancing({ metadata: { isPendingFinancing: true } }, archived)).toBe(false);
  });
});
