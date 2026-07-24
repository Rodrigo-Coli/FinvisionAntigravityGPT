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

    describe('vencimento no fim do mês (dias 29, 30 e 31 — a interface permite até 31)', () => {
        it('cartão que vence dia 31 não gera "31 de fevereiro"', () => {
            // Regressão: a versão anterior montava a string à mão e devolvia
            // "2026-02-31" — data inexistente que, na comparação textual do filtro
            // de período, some de fevereiro E de março (some de todos os meses).
            expect(getCardCompetenceDate('2026-01-15', 10, 31)).toBe('2026-03-03');
        });

        it('cartão que vence dia 30 em fevereiro rola para março', () => {
            expect(getCardCompetenceDate('2026-01-10', 5, 30)).toBe('2026-03-02');
        });

        it('cartão que vence dia 29 em fevereiro (ano não bissexto) rola para 1º de março', () => {
            expect(getCardCompetenceDate('2026-01-15', 10, 29)).toBe('2026-03-01');
        });

        it('cartão que vence dia 29 em fevereiro de ano BISSEXTO cai no próprio dia 29', () => {
            // 2028 é bissexto — aqui a data existe e não deve rolar.
            expect(getCardCompetenceDate('2028-01-15', 10, 29)).toBe('2028-02-29');
        });

        it('mês de 30 dias com vencimento 31 rola para o dia 1º seguinte', () => {
            expect(getCardCompetenceDate('2026-03-15', 10, 31)).toBe('2026-05-01');
        });

        it('vencimento 31 em mês de 31 dias fica no próprio dia 31', () => {
            expect(getCardCompetenceDate('2026-01-05', 10, 31)).toBe('2026-01-31');
        });
    });
});

/**
 * Réplica fiel da aritmética de getOrCreateStatement
 * (services/finance.service.ts:169-213), que é quem grava
 * card_statements.due_date no banco.
 *
 * Por que isto existe: getCardCompetenceDate é o FALLBACK usado quando a compra
 * ainda não tem fatura gerada. Assim que a fatura nasce, o due_date real passa a
 * ter prioridade. Se as duas contas divergirem, a mesma compra pula de mês no
 * momento em que a fatura é criada — bug silencioso e difícil de rastrear.
 * Este bloco trava o contrato entre as duas.
 */
function dueDateComoOServicoGrava(dateStr: string, closingDay: number, dueDay: number): string {
    const txDate = new Date(dateStr + 'T00:00:00Z');
    const day = txDate.getUTCDate();
    let targetMonth = txDate.getUTCMonth();
    let targetYear = txDate.getUTCFullYear();
    if (day > closingDay) {
        targetMonth++;
        if (targetMonth > 11) { targetMonth = 0; targetYear++; }
    }
    let dueMonth = targetMonth;
    let dueYear = targetYear;
    if (dueDay < closingDay) {
        dueMonth++;
        if (dueMonth > 11) { dueMonth = 0; dueYear++; }
    }
    return new Date(Date.UTC(dueYear, dueMonth, dueDay)).toISOString().split('T')[0];
}

describe('getCardCompetenceDate — paridade com o card_statements.due_date do serviço', () => {
    it('bate com o serviço em TODA combinação de fechamento × vencimento × mês', () => {
        // 31 fechamentos × 31 vencimentos × 12 meses × 4 dias de compra.
        // Este é o teste que teria pego o bug do "31 de fevereiro".
        const divergentes: string[] = [];
        for (let closing = 1; closing <= 31; closing++) {
            for (let due = 1; due <= 31; due++) {
                for (let m = 1; m <= 12; m++) {
                    for (const d of [1, 10, 20, 28]) {
                        const compra = `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                        const meu = getCardCompetenceDate(compra, closing, due);
                        const servico = dueDateComoOServicoGrava(compra, closing, due);
                        if (meu !== servico) {
                            divergentes.push(`fecha ${closing}/vence ${due} compra ${compra}: ${meu} ≠ ${servico}`);
                        }
                    }
                }
            }
        }
        expect(divergentes.slice(0, 5).join(' | ')).toBe('');
        expect(divergentes).toHaveLength(0);
    });

    it('nunca devolve uma data que não existe no calendário', () => {
        const invalidas: string[] = [];
        for (let closing = 1; closing <= 31; closing++) {
            for (let due = 1; due <= 31; due++) {
                for (let m = 1; m <= 12; m++) {
                    const compra = `2026-${String(m).padStart(2, '0')}-15`;
                    const comp = getCardCompetenceDate(compra, closing, due);
                    // Se a data existe, o round-trip por Date preserva a string.
                    const roundTrip = new Date(comp + 'T00:00:00Z').toISOString().split('T')[0];
                    if (roundTrip !== comp) {
                        invalidas.push(`fecha ${closing}/vence ${due} compra ${compra} → ${comp}`);
                    }
                }
            }
        }
        expect(invalidas.slice(0, 5).join(' | ')).toBe('');
        expect(invalidas).toHaveLength(0);
    });

    it('a competência nunca cai fora da janela de busca de 92 dias', () => {
        // Invariante de que depende a query limitada em History.tsx/Reports.tsx:
        // se isto quebrar, compras somem da tela por não terem sido buscadas.
        const fora: string[] = [];
        for (let closing = 1; closing <= 31; closing++) {
            for (let due = 1; due <= 31; due++) {
                for (let m = 1; m <= 12; m++) {
                    for (const d of [1, 15, 28]) {
                        const compra = `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                        const comp = getCardCompetenceDate(compra, closing, due);
                        if (comp < compra || comp > DateUtils.addDaysISO(compra, 92)) {
                            fora.push(`fecha ${closing}/vence ${due} compra ${compra} → ${comp}`);
                        }
                    }
                }
            }
        }
        expect(fora.slice(0, 5).join(' | ')).toBe('');
        expect(fora).toHaveLength(0);
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
