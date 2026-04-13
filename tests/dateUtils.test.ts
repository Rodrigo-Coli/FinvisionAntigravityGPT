import { describe, it, expect } from 'vitest';
import { DateUtils } from '../lib/dateUtils';

describe('DateUtils', () => {
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
