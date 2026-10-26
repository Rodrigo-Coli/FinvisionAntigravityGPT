/**
 * "Saldo a financiar" (financiamento a definir de imóvel na planta) só existe
 * por causa do bem. Se o bem foi arquivado (vendido, devolvido), esse saldo não
 * é mais dívida — mesmo que o passivo ainda não tenha sido arquivado no banco.
 */
export function isOrphanPendingFinancing(liability: any, archivedAssetIds: Set<string>): boolean {
  if (!liability?.metadata?.isPendingFinancing) return false;
  const assetId = liability.linked_asset_id ?? liability.linkedAssetId;
  return !!assetId && archivedAssetIds.has(assetId);
}
