import { describe, it, expect } from 'vitest';
import { getCardCompetenceDate } from '../lib/historyUtils';
import { DateUtils } from '../lib/dateUtils';

/**
 * getCardCompetenceDate(purchaseDate, closingDay, dueDay) decide em qual MÊS uma
 * compra de cartão é contabilizada: o mês de VENCIMENTO da fatura a que ela
 * pertence. Espelha a aritmética de getOrCreateStatement em
 * services/finance.service.ts — se uma mudar, a outra tem que mudar junto
 * (este teste existe para pegar exatamente esse tipo de divergência).
 *
 * Regras:
 *  - dia da compra >  closing_day → fatura do mês seguinte
 *  - dia da compra <= closing_day → fatura do mês corrente
 *  - due_day <  closing_day → vencimento rola para o mês seguinte ao da fatura
 *  - due_day >= closing_day → vencimento no próprio mês da fatura
 */
describe('getCardCompetenceDate', () => {
    describe('cartão fecha dia 10, vence dia 20 (padrão Itaú/Nubank-like)', () => {
        it('compra antes do fechamento entra na fatura do mesmo mês', () => {
            expect(getCardCompetenceDate('2026-07-05', 10, 20)).toBe('2026-07-20');
        });

        it('compra exatamente no dia do fechamento ainda entra no mês corrente', () => {
            // Regra do serviço: só "day > closing_day" empurra pro mês seguinte.
            expect(getCardCompetenceDate('2026-07-10', 10, 20)).toBe('2026-07-20');
        });

        it('compra um dia após o fechamento cai na fatura do mês seguinte', () => {
            expect(getCardCompetenceDate('2026-07-11', 10, 20)).toBe('2026-08-20');
        });
    });

    describe('cartão fecha dia 25, vence dia 1 (padrão BTG — vencimento no mês seguinte)', () => {
        it('compra antes do fechamento: fatura de julho, vencimento 1º de agosto', () => {
            // Este é o caso real que motivou a correção: a fatura "BTG (7/2026)"
            // vence em 01/08 e não pode aparecer/contar em julho.
            expect(getCardCompetenceDate('2026-07-20', 25, 1)).toBe('2026-08-01');
        });

        it('compra após o fechamento: fatura de agosto, vencimento 1º de setembro', () => {
            expect(getCardCompetenceDate('2026-07-26', 25, 1)).toBe('2026-09-01');
        });
    });

    describe('cartão fecha dia 1, vence dia 10 (padrão Bradesco Infinite)', () => {
        it('compra no dia 1 (= fechamento) entra na fatura do mês corrente', () => {
            expect(getCardCompetenceDate('2026-07-01', 1, 10)).toBe('2026-07-10');
        });

        it('compra no dia 2 já cai na fatura do mês seguinte', () => {
            expect(getCardCompetenceDate('2026-07-02', 1, 10)).toBe('2026-08-10');
        });
    });

    describe('viradas de ano', () => {
        it('compra em dezembro após o fechamento vira fatura de janeiro do ano seguinte', () => {
            expect(getCardCompetenceDate('2026-12-15', 10, 20)).toBe('2027-01-20');
        });

        it('dezembro + fechamento tardio + due_day menor: dupla virada (fatura jan, vence fev)', () => {
            // Compra 28/12 com fechamento 25 → fatura de janeiro/2027;
            // due_day (1) < closing_day (25) → vencimento rola pra fevereiro/2027.
            expect(getCardCompetenceDate('2026-12-28', 25, 1)).toBe('2027-02-01');
        });

        it('compra em novembro com fechamento 25 e vencimento dia 1: fatura nov, vence dez', () => {
            expect(getCardCompetenceDate('2026-11-20', 25, 1)).toBe('2026-12-01');
        });
    });

    describe('robustez de entrada', () => {
        it('aceita ISO com hora (T00:00:00) sem deslocar o dia', () => {
            expect(getCardCompetenceDate('2026-07-11T00:00:00', 10, 20)).toBe('2026-08-20');
        });

        it('saída sempre com zero à esquerda (YYYY-MM-DD)', () => {
            expect(getCardCompetenceDate('2026-01-02', 1, 10)).toBe('2026-02-10');
        });

        it('vencimento nunca é anterior à data da compra (invariante da janela de 92 dias)', () => {
            // A busca limitada em History/Reports assume: competência >= data da
            // compra e no máximo ~62 dias depois. Varre um ano de compras contra
            // as configurações reais dos cartões do sistema.
            const configs = [
                { closing: 10, due: 20 },
                { closing: 25, due: 1 },
                { closing: 1, due: 10 },
                { closing: 14, due: 20 },
                { closing: 10, due: 17 }
            ];
            for (let m = 1; m <= 12; m++) {
                for (const day of [1, 2, 9, 10, 11, 14, 15, 24, 25, 26, 28]) {
                    const date = `2026-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    for (const cfg of configs) {
                        const comp = getCardCompetenceDate(date, cfg.closing, cfg.due);
                        expect(comp >= date, `${date} cfg ${cfg.closing}/${cfg.due} → ${comp}`).toBe(true);
                        // limite superior: 92 dias de folga da query cobre
                        expect(comp <= DateUtils.addDaysISO(date, 92), `${date} cfg ${cfg.closing}/${cfg.due} → ${comp}`).toBe(true);
                    }
                }
            }
        });
    });
});

describe('DateUtils.addDaysISO (helper da janela de busca)', () => {
    it('subtrai dias atravessando o mês', () => {
        expect(DateUtils.addDaysISO('2026-07-01', -92)).toBe('2026-03-31');
    });

    it('soma dias atravessando o ano', () => {
        expect(DateUtils.addDaysISO('2026-12-20', 15)).toBe('2027-01-04');
    });

    it('preserva sentinelas de "período inteiro" sem estourar', () => {
        expect(DateUtils.addDaysISO('0001-01-01', -92)).toBe('0001-01-01');
        expect(DateUtils.addDaysISO('9999-12-31', -92)).toBe('9999-12-31');
    });

    it('ignora string inválida devolvendo a original', () => {
        expect(DateUtils.addDaysISO('invalid', -92)).toBe('invalid');
    });

    it('aceita ISO com hora', () => {
        expect(DateUtils.addDaysISO('2026-07-15T12:00:00', -1)).toBe('2026-07-14');
    });
});
