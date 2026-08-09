import { supabase } from '../lib/supabase/client';
import { TransactionSplit } from '../types';

export type SplitSourceType = 'transaction' | 'card_transaction';

export interface SplitDraft {
    category: string;
    subcategory?: string;
    categoryId?: string;
    amount: number;
    notes?: string;
}

function mapRow(row: any): TransactionSplit {
    return {
        id: row.id,
        user_id: row.user_id,
        sourceType: row.source_type,
        sourceId: row.source_id,
        category: row.category,
        subcategory: row.subcategory || undefined,
        categoryId: row.category_id || undefined,
        amount: Number(row.amount),
        notes: row.notes || undefined,
        createdAt: row.created_at
    };
}

export const SplitTransactionService = {
    /**
     * Busca os pedaços de um único lançamento.
     */
    async getSplits(sourceType: SplitSourceType, sourceId: string): Promise<TransactionSplit[]> {
        if (!supabase || !sourceId) return [];
        const { data, error } = await supabase
            .from('transaction_splits')
            .select('*')
            .eq('source_type', sourceType)
            .eq('source_id', sourceId)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('[SplitTransactionService] Erro ao buscar divisão:', error);
            return [];
        }
        return (data || []).map(mapRow);
    },

    /**
     * Busca os pedaços de vários lançamentos de uma vez (para listas), evitando N+1.
     * Retorna um mapa sourceId -> pedaços.
     */
    async getSplitsForSources(sourceType: SplitSourceType, sourceIds: string[]): Promise<Record<string, TransactionSplit[]>> {
        const map: Record<string, TransactionSplit[]> = {};
        if (!supabase || sourceIds.length === 0) return map;

        // Supabase/Postgres tem limite prático de itens por .in(); processa em lotes
        const chunkSize = 200;
        for (let i = 0; i < sourceIds.length; i += chunkSize) {
            const chunk = sourceIds.slice(i, i + chunkSize);
            const { data, error } = await supabase
                .from('transaction_splits')
                .select('*')
                .eq('source_type', sourceType)
                .in('source_id', chunk);

            if (error) {
                console.error('[SplitTransactionService] Erro ao buscar divisões em lote:', error);
                continue;
            }
            for (const row of data || []) {
                const split = mapRow(row);
                if (!map[split.sourceId]) map[split.sourceId] = [];
                map[split.sourceId].push(split);
            }
        }
        return map;
    },

    /**
     * Grava (substitui) o conjunto de pedaços de um lançamento de forma atômica.
     * A função no banco valida que a soma bate com o valor total do lançamento pai
     * antes de gravar - se não bater, a promise rejeita com o erro do Postgres.
     * Passar `drafts = []` remove a divisão (volta ao lançamento normal).
     */
    async saveSplits(sourceType: SplitSourceType, sourceId: string, drafts: SplitDraft[]): Promise<void> {
        if (!supabase) throw new Error('Sem conexão com o banco');

        const payload = drafts.map(d => ({
            category: d.category,
            subcategory: d.subcategory || '',
            category_id: d.categoryId || '',
            amount: d.amount,
            notes: d.notes || ''
        }));

        const { error } = await supabase.rpc('save_transaction_splits', {
            p_source_type: sourceType,
            p_source_id: sourceId,
            p_splits: payload
        });

        if (error) {
            throw new Error(error.message || 'Não foi possível salvar a divisão do lançamento');
        }
    },

    /**
     * Remove a divisão de um lançamento (volta a ter uma categoria só).
     */
    async clearSplits(sourceType: SplitSourceType, sourceId: string): Promise<void> {
        return this.saveSplits(sourceType, sourceId, []);
    }
};
