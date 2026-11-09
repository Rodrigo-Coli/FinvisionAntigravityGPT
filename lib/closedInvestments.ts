// Filtro de situação dos investimentos (Patrimônio › Investimentos):
// Ativos (carteira, padrão) · Encerrados · Arquivados.
//
// · Encerrado: resgatado ou vencido (metadata.status 'RESGATADO'). Já não entra na
//   carteira nem no saldo, mas continua com o extrato completo.
// · Arquivado: o usuário tirou da tela (is_archived). Também fora da carteira; dá
//   para ver e desarquivar a qualquer momento.
// Só um investimento encerrado (valor zero) pode ser arquivado por aqui, para o
// arquivamento nunca mexer no saldo da corretora.

export interface ClosedInvestmentInput {
  id: string;
  name: string;
  category: string;
  estimatedValue?: number;
  is_archived?: boolean;
  metadata?: any;
}

export const isInvestment = (a: ClosedInvestmentInput) => a?.category === 'INVESTMENT';
export const isClosedInvestment = (a: ClosedInvestmentInput) => isInvestment(a) && a.metadata?.status === 'RESGATADO';

/** Pode arquivar: encerrado e sem valor (não altera o saldo da corretora). */
export const canArchiveInvestment = (a: ClosedInvestmentInput) =>
  isClosedInvestment(a) && !a.is_archived && Math.abs(Number(a.estimatedValue || 0)) < 0.005;

export type InvestmentStatusFilter = 'ATIVOS' | 'ENCERRADOS' | 'ARQUIVADOS';

/** O investimento aparece com este filtro? Arquivado só aparece em "Arquivados". */
export function matchesInvestmentStatus(a: ClosedInvestmentInput, filter: InvestmentStatusFilter): boolean {
  if (!isInvestment(a)) return false;
  if (filter === 'ARQUIVADOS') return !!a.is_archived;
  if (a.is_archived) return false;
  return filter === 'ENCERRADOS' ? isClosedInvestment(a) : a.metadata?.status !== 'RESGATADO';
}

/** Quantos há em cada situação (para o rótulo do filtro). */
export function countByInvestmentStatus(assets: ClosedInvestmentInput[]): Record<InvestmentStatusFilter, number> {
  const out: Record<InvestmentStatusFilter, number> = { ATIVOS: 0, ENCERRADOS: 0, ARQUIVADOS: 0 };
  for (const a of assets) for (const f of ['ATIVOS', 'ENCERRADOS', 'ARQUIVADOS'] as InvestmentStatusFilter[]) if (matchesInvestmentStatus(a, f)) out[f]++;
  return out;
}
