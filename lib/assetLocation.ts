// Onde o investimento está (corretora/banco), para todo aviso mostrar sem a pessoa
// precisar procurar: Radar, juros previstos/não recebidos, faixas da tela inicial e
// WhatsApp. A corretora é a conta de metadata.brokerAccountId.

export interface AccountLite {
  id: string;
  institution?: string | null;
  name?: string | null;
}

export const accountLabel = (a?: AccountLite | null): string =>
  String(a?.institution || a?.name || '').trim();

/** Nome da corretora/banco do investimento, ou '' quando não há conta ligada. */
export function brokerOf(meta: Record<string, any> | null | undefined, accounts: AccountLite[] | Map<string, AccountLite>): string {
  const id = meta?.brokerAccountId;
  if (!id) return '';
  const acc = accounts instanceof Map ? accounts.get(String(id)) : (accounts || []).find(a => a.id === id);
  return accountLabel(acc);
}

/** "CRA Raízen (Safra Investimentos Matteo)" — ou só o nome, se não houver corretora. */
export const withBroker = (name: string, broker: string) => (broker ? `${name} (${broker})` : name);
