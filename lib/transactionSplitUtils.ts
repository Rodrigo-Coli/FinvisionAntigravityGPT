import { Transaction, TransactionSplit } from '../types';

/**
 * "Explode" uma lista de lançamentos em linhas por categoria, usando os pedaços
 * (splits) de quem foi dividido. Lançamentos sem divisão continuam como estavam.
 *
 * Usar SEMPRE que for somar/agrupar valores por categoria (relatórios, gráficos,
 * orçamento) - nunca somar `amount` de `transactions`/`card_transactions` direto
 * quando categoria estiver envolvida, ou lançamentos divididos vão contar só na
 * primeira categoria (ou a soma vai bater errado).
 *
 * NÃO usar para saldo de conta ou total de fatura - esses continuam somando o
 * `amount` real da linha (que nunca muda), calculado no banco via trigger.
 */
export function explodeTransactionsForCategoryAgg(
    transactions: Transaction[],
    splitsBySourceId: Record<string, TransactionSplit[]>
): Transaction[] {
    const result: Transaction[] = [];

    for (const t of transactions) {
        const splits = t.hasSplits ? splitsBySourceId[t.id] : undefined;

        if (!splits || splits.length === 0) {
            result.push(t);
            continue;
        }

        splits.forEach((s, idx) => {
            result.push({
                ...t,
                id: `${t.id}::split::${idx}`,
                amount: s.amount,
                category: s.category,
                subcategory: s.subcategory,
                category_id: s.categoryId,
                hasSplits: false,
                metadata: { ...(t.metadata || {}), splitParentId: t.id }
            });
        });
    }

    return result;
}
