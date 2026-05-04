
import { fetchMock } from './api';
import { ExtractedItem, PriceComparison } from '../types';

export const AIService = {
  processReceipt: async (file: File | Blob): Promise<ExtractedItem[]> => {
    // Simulação de processamento OCR pesado
    return fetchMock([
      { id: 'e1', originalName: 'Lte Lng Vda 1L Par', normalizedName: 'Leite Longa Vida 1L', price: 6.89, category: 'Alimentação', matchConfidence: 0.98 },
      { id: 'e2', originalName: 'Arroz T.Joao 5Kg', normalizedName: 'Arroz Polido 5kg', price: 28.50, category: 'Alimentação', matchConfidence: 0.95 }
    ], 2000);
  },

  comparePrices: async (itemId: string): Promise<PriceComparison[]> => {
    return fetchMock([
      { id: 'cp1', itemId, establishment: 'Carrefour Sul', price: 6.45, date: '2023-10-25', isBestPrice: true },
      { id: 'cp2', itemId, establishment: 'Pão de Açúcar', price: 7.10, date: '2023-10-24', isBestPrice: false }
    ]);
  }
};
