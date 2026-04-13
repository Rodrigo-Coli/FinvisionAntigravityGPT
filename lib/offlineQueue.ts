/**
 * Offline Queue — stores pending Supabase operations in localStorage
 * and replays them when the connection is restored.
 */

interface QueuedOperation {
    id: string;
    table: string;
    method: 'INSERT' | 'UPDATE' | 'DELETE';
    payload: any;
    timestamp: number;
}

const QUEUE_KEY = 'finvision_offline_queue';

class OfflineQueueService {
    private getQueue(): QueuedOperation[] {
        try {
            return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
        } catch {
            return [];
        }
    }

    private saveQueue(queue: QueuedOperation[]) {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    }

    enqueue(table: string, method: 'INSERT' | 'UPDATE' | 'DELETE', payload: any) {
        const queue = this.getQueue();
        queue.push({
            id: crypto.randomUUID(),
            table,
            method,
            payload,
            timestamp: Date.now()
        });
        this.saveQueue(queue);
        // Dispatch event so UI can update pending count
        window.dispatchEvent(new CustomEvent('offline-queue-updated'));
    }

    getPendingCount(): number {
        return this.getQueue().length;
    }

    async processQueue(): Promise<void> {
        if (!navigator.onLine) return;
        const queue = this.getQueue();
        if (queue.length === 0) return;

        // Lazy import supabase to avoid circular deps
        const { supabase } = await import('./supabase/client');
        if (!supabase) return;

        const remaining: QueuedOperation[] = [];
        for (const op of queue) {
            try {
                if (op.method === 'INSERT') {
                    await supabase.from(op.table).insert(op.payload);
                } else if (op.method === 'UPDATE') {
                    await supabase.from(op.table).update(op.payload.data).eq('id', op.payload.id);
                } else if (op.method === 'DELETE') {
                    await supabase.from(op.table).update({ is_deleted: true }).eq('id', op.payload.id);
                }
            } catch {
                remaining.push(op); // keep failed ops for retry
            }
        }
        this.saveQueue(remaining);
        window.dispatchEvent(new CustomEvent('offline-queue-updated'));
    }

    /** Store transaction data in localStorage cache */
    cacheTransactions(userId: string, transactions: any[]) {
        try {
            localStorage.setItem(`finvision_txcache_${userId}`, JSON.stringify({
                data: transactions,
                cachedAt: Date.now()
            }));
        } catch { /* storage full — ignore */ }
    }

    /** Retrieve cached transactions */
    getCachedTransactions(userId: string): any[] | null {
        try {
            const raw = localStorage.getItem(`finvision_txcache_${userId}`);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            // Cache valid for 24h
            if (Date.now() - parsed.cachedAt > 86400000) return null;
            return parsed.data;
        } catch {
            return null;
        }
    }
}

export const offlineQueue = new OfflineQueueService();
