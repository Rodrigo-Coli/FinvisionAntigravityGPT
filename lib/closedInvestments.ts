// Investimentos encerrados e arquivados (Patrimônio › Investimentos).
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

const day = (s: any) => String(s || '').slice(0, 10);

export const isInvestment = (a: ClosedInvestmentInput) => a?.category === 'INVESTMENT';
export const isClosedInvestment = (a: ClosedInvestmentInput) => isInvestment(a) && a.metadata?.status === 'RESGATADO';

/** Pode arquivar: encerrado e sem valor (não altera o saldo da corretora). */
export const canArchiveInvestment = (a: ClosedInvestmentInput) =>
  isClosedInvestment(a) && !a.is_archived && Math.abs(Number(a.estimatedValue || 0)) < 0.005;

/** Data em que terminou: resgate registrado, senão o vencimento já passado. */
export function closedOn(a: ClosedInvestmentInput, today: string): string | null {
  const m = a.metadata || {};
  if (m.resgateDate) return day(m.resgateDate);
  if (m.vencimentoDate && day(m.vencimentoDate) <= today) return day(m.vencimentoDate);
  return null;
}

/** Separa os encerrados (ainda na lista de encerrados) dos arquivados; mais recentes primeiro. */
export function splitClosedInvestments<T extends ClosedInvestmentInput>(assets: T[], today: string) {
  const byDate = (x: T, y: T) => (closedOn(y, today) || '').localeCompare(closedOn(x, today) || '') || String(x.name).localeCompare(String(y.name));
  const closed = assets.filter(a => isClosedInvestment(a) && !a.is_archived).sort(byDate);
  const archived = assets.filter(a => isInvestment(a) && !!a.is_archived).sort(byDate);
  return { closed, archived };
}
