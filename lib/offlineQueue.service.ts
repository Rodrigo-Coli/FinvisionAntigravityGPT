import { supabase } from './supabase/client';

export type OfflineActionType = 'CREATE_TRANSACTION' | 'UPDATE_TRANSACTION' | 'DELETE_TRANSACTION' | 'UPDATE_CARD_TRANSACTION' | 'DELETE_CARD_TRANSACTION';

export interface OfflineAction {
    id: string; // unique ID for the queue item
    type: OfflineActionType;
    payload: any;
    timestamp: string; // ISO string
}

const QUEUE_KEY = 'finvision_offline_queue';

class OfflineQueueService {
    /**
     * Reads the current queue from localStorage
     */
    getQueue(): OfflineAction[] {
        try {
            const stored = localStorage.getItem(QUEUE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.error('Failed to read offline queue:', e);
            return [];
        }
    }

    /**
     * Adds a new action to the offline queue
     */
    addAction(type: OfflineActionType, payload: any): void {
        const queue = this.getQueue();
        const action: OfflineAction = {
            id: Math.random().toString(36).substring(2, 9),
            type,
            payload,
            timestamp: new Date().toISOString()
        };

        queue.push(action);
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));

        // Dispatch a custom event so the UI can know there are items in the queue
        window.dispatchEvent(new CustomEvent('finvision_offline_queue_updated'));
    }

    /**
     * Removes an action from the queue by ID
     */
    removeAction(id: string): void {
        const queue = this.getQueue();
        const updated = queue.filter(item => item.id !== id);
        localStorage.setItem(QUEUE_KEY, JSON.stringify(updated));
        window.dispatchEvent(new CustomEvent('finvision_offline_queue_updated'));
    }

    /**
     * Attempts to process the entire queue
     * @returns number of successfully processed actions
     */
    async processQueue(): Promise<number> {
        if (!navigator.onLine || !supabase) return 0;

        const queue = this.getQueue();
        if (queue.length === 0) return 0;

        let successCount = 0;

        // Process sequentially to maintain order
        for (const action of queue) {
            try {
                let error = null;

                if (action.type === 'CREATE_TRANSACTION') {
                    const { error: e } = await supabase.from('transactions').insert([action.payload]);
                    error = e;
                } else if (action.type === 'UPDATE_TRANSACTION') {
                    const { error: e } = await supabase.from('transactions')
                        .update(action.payload.updates)
                        .eq('id', action.payload.id);
                    error = e;
                } else if (action.type === 'DELETE_TRANSACTION') {
                    const { error: e } = await supabase.from('transactions')
                        .update({ is_deleted: true })
                        .eq('id', action.payload.id);
                    error = e;
                } else if (action.type === 'UPDATE_CARD_TRANSACTION') {
                    const { error: e } = await supabase.from('card_transactions')
                        .update(action.payload.updates)
                        .eq('id', action.payload.id);
                    error = e;
                } else if (action.type === 'DELETE_CARD_TRANSACTION') {
                    const { error: e } = await supabase.from('card_transactions')
                        .delete()
                        .eq('id', action.payload.id);
                    error = e;
                }

                if (!error) {
                    successCount++;
                    this.removeAction(action.id);
                } else {
                    console.error(`Failed to process offline action ${action.id}:`, error);
                    // If it's a hard error (like strict RLS fail), we might want to remove it anyway to not block the queue forever.
                    // For now, we leave it in the queue for the next retry if it was a network drop mid-flight.
                }
            } catch (err) {
                console.error('Error executing offline sync:', err);
            }
        }

        return successCount;
    }
}

export const offlineQueue = new OfflineQueueService();
