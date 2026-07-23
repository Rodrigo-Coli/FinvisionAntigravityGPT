import { describe, it, expect } from 'vitest';
import { applyTrailingMinusCorrection } from '../api/_lib/statement-sign-check';

// Cenário real: fatura Bradesco 07/2026 — estornos vêm com o sinal de menos DEPOIS
// do valor ("33,28-") e a IA só detectou o da Shein, deixando os 3 do Mercado Livre
// passarem como compra. O mapa abaixo simula o que extractTrailingMinusAmounts
// devolve ao ler o texto do PDF.

const minusMap = (entries: [string, number][]) => new Map<string, number>(entries);

describe('applyTrailingMinusCorrection', () => {
    it('corrige estornos que a IA deixou como compra positiva', () => {
        const txs = [
            { description: 'MERCADOLIVRE*MERCADOLI', amount: 60.60 },
            { description: 'MERCADOLIVRE*MERCADOLI', amount: 50.20 },
            { description: 'MERCADOLIVRE*MERCADOLI', amount: 33.28 },
            { description: 'Shein *SHEINCOM', amount: -74.99 }, // IA acertou esse
            { description: 'GP RESTAURANTE FILIAL', amount: 45.30 }, // compra normal
        ];
        const fixed = applyTrailingMinusCorrection(txs, minusMap([
            ['60.60', 1], ['50.20', 1], ['33.28', 1], ['74.99', 1],
        ]));
        expect(fixed).toBe(3);
        expect(txs[0].amount).toBe(-60.60);
        expect(txs[1].amount).toBe(-50.20);
        expect(txs[2].amount).toBe(-33.28);
        expect(txs[3].amount).toBe(-74.99); // já estava certo, não mexe
        expect(txs[4].amount).toBe(45.30);  // compra normal intocada
    });

    it('não vira compra normal quando a IA já detectou o crédito de mesmo valor', () => {
        // Compra de 74,99 E estorno de 74,99 na mesma fatura: só existe UMA
        // ocorrência com menos no PDF, e a IA já a marcou — a compra fica positiva.
        const txs = [
            { description: 'LOJA A', amount: 74.99 },
            { description: 'ESTORNO LOJA A', amount: -74.99 },
        ];
        const fixed = applyTrailingMinusCorrection(txs, minusMap([['74.99', 1]]));
        expect(fixed).toBe(0);
        expect(txs[0].amount).toBe(74.99);
    });

    it('corrige apenas uma quando há duas compras iguais e um estorno não detectado', () => {
        const txs = [
            { description: 'LOJA B', amount: 25.00 },
            { description: 'LOJA B', amount: 25.00 },
        ];
        const fixed = applyTrailingMinusCorrection(txs, minusMap([['25.00', 1]]));
        expect(fixed).toBe(1);
        const negativos = txs.filter(t => t.amount < 0).length;
        expect(negativos).toBe(1);
    });

    it('aceita valores em string no formato brasileiro', () => {
        const txs = [{ description: 'PAGTO. POR DEB EM C/C', amount: '7.674,37' }];
        const fixed = applyTrailingMinusCorrection(txs, minusMap([['7674.37', 1]]));
        expect(fixed).toBe(1);
        expect(txs[0].amount).toBe(-7674.37);
    });

    it('não faz nada com mapa vazio (PDF ilegível ou sem créditos)', () => {
        const txs = [{ description: 'COMPRA', amount: 10 }];
        expect(applyTrailingMinusCorrection(txs, new Map())).toBe(0);
        expect(txs[0].amount).toBe(10);
    });
});
