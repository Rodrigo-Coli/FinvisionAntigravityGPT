import { describe, it, expect } from 'vitest';
import { DateUtils } from '../lib/dateUtils';

describe('DateUtils', () => {
    // Regressão: um comprovante importado sem data legível fazia o Intl estourar
    // "Invalid time value" durante o render, e a tela caía no "Ops! Algo deu errado".
    describe('formatDateTime', () => {
        it('nao deve estourar com data invalida ou ausente', () => {
            expect(DateUtils.formatDateTime(new Date('nao-e-data'))).toBe('—');
            expect(DateUtils.formatDateTime('')).toBe('—');
            expect(DateUtils.formatDateTime(null)).toBe('—');
            expect(DateUtils.formatDateTime(undefined)).toBe('—');
            expect(DateUtils.formatDateTime('texto qualquer')).toBe('—');
        });

        it('deve formatar uma data valida', () => {
            const out = DateUtils.formatDateTime(new Date(Date.UTC(2026, 6, 26, 15, 30)));
            expect(out).toMatch(/\d{2}\/\d{2}\/\d{4}/);
        });
    });

    describe('formatToISODate', () => {
        it('deve retornar data no formato YYYY-MM-DD', () => {
            const date = new Date(2026, 2, 6); // 6 de março de 2026
            const result = DateUtils.formatToISODate(date);
            expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });

        it('deve retornar data de hoje se nenhum argumento', () => {
            const result = DateUtils.formatToISODate();
            expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });
    });

    describe('formatDisplayDate', () => {
        it('deve converter YYYY-MM-DD para DD/MM/YYYY', () => {
            expect(DateUtils.formatDisplayDate('2026-03-06')).toBe('06/03/2026');
        });

        it('deve lidar com datas ISO com tempo', () => {
            expect(DateUtils.formatDisplayDate('2026-03-06T14:30:00')).toBe('06/03/2026');
        });

        it('deve retornar vazio para string vazia', () => {
            expect(DateUtils.formatDisplayDate('')).toBe('');
        });

        it('deve retornar a string original se formato inválido', () => {
            expect(DateUtils.formatDisplayDate('invalid')).toBe('invalid');
        });
    });

    describe('formatMonthYear', () => {
        it('deve formatar mês e ano corretamente', () => {
            const result = DateUtils.formatMonthYear(2026, 3);
            // Verifica que contém algum texto de mês + ano
            expect(result).toContain('/ 26');
        });
    });

    describe('formatFullMonthYear', () => {
        it('deve formatar mês por extenso e ano', () => {
            const result = DateUtils.formatFullMonthYear(2026, 1);
            expect(result).toContain('/ 2026');
        });
    });

    describe('getTimeZone', () => {
        it('deve retornar uma timezone válida', () => {
            const tz = DateUtils.getTimeZone();
            expect(tz).toBeTruthy();
            expect(typeof tz).toBe('string');
        });
    });
});

import { TransactionSeriesUtils } from '../lib/transactionSeriesUtils';

describe('TransactionSeriesUtils.generateSeries', () => {
    it('deve gerar parcelas mensais mantendo o dia 30 e limitando fevereiro para 28', () => {
        const baseTx = { amount: 100, description: 'Parcela Wave' };
        const config = {
            type: 'INSTALLMENT' as const,
            count: 12,
            startDate: '2026-06-30' // Começa em 30 de Junho
        };

        const result = TransactionSeriesUtils.generateSeries(baseTx, config);

        // Verificações
        expect(result.length).toBe(12);
        
        // Junho: 2026-06-30
        expect(result[0].date).toBe('2026-06-30');
        // Julho: 2026-07-30 (não deve ser 29!)
        expect(result[1].date).toBe('2026-07-30');
        // Agosto: 2026-08-30
        expect(result[2].date).toBe('2026-08-30');
        // Setembro: 2026-09-30
        expect(result[3].date).toBe('2026-09-30');
        // Outubro: 2026-10-30
        expect(result[4].date).toBe('2026-10-30');
        // Novembro: 2026-11-30
        expect(result[5].date).toBe('2026-11-30');
        // Dezembro: 2026-12-30
        expect(result[6].date).toBe('2026-12-30');
        // Janeiro: 2027-01-30
        expect(result[7].date).toBe('2027-01-30');
        // Fevereiro: 2027-02-28 (deve ser 28 mesmo em ano não bissexto)
        expect(result[8].date).toBe('2027-02-28');
        // Março: 2027-03-30
        expect(result[9].date).toBe('2027-03-30');
    });

    it('deve limitar fevereiro para dia 28 mesmo em ano bissexto se vencimento for 29, 30 ou 31', () => {
        const baseTx = { amount: 100, description: 'Parcela Bissexta' };
        
        // Ano 2028 é bissexto (fevereiro tem 29 dias)
        // Se a data de início for 2027-12-31, o vencimento é dia 31.
        // O segundo mês da série (índice 2) será Fevereiro de 2028.
        const config = {
            type: 'INSTALLMENT' as const,
            count: 3,
            startDate: '2027-12-31'
        };

        const result = TransactionSeriesUtils.generateSeries(baseTx, config);

        // Dezembro 2027: 31
        expect(result[0].date).toBe('2027-12-31');
        // Janeiro 2028: 31
        expect(result[1].date).toBe('2028-01-31');
        // Fevereiro 2028: Deve ser 28, conforme nova regra de negócio de todos os anos ser 28
        expect(result[2].date).toBe('2028-02-28');
    });
});

