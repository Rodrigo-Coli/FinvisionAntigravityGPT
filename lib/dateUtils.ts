
/**
 * Utilitário de gerenciamento de datas e fuso horário.
 * Regra: Sempre acompanhar o horário do equipamento do usuário.
 * Fallback: America/Sao_Paulo (Brasil) caso não seja possível localizar o fuso.
 */

export const DateUtils = {
    /**
     * Obtém o fuso horário atual do dispositivo.
     * Se não for possível determinar, retorna o fuso de São Paulo.
     */
    getTimeZone: (): string => {
        try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (tz) return tz;
        } catch (e) {
            console.warn("Não foi possível determinar o fuso horário do dispositivo, usando fallback SP/Brasil.");
        }
        return 'America/Sao_Paulo';
    },

    /**
     * Retorna a data e hora atual no fuso horário do dispositivo (ou fallback).
     */
    getNow: (): Date => {
        return new Date();
    },

    /**
     * Formata uma data para string ISO (YYYY-MM-DD) respeitando o fuso horário local.
     * Útil para inputs de data e salvamento no banco sem deslocamento de fuso.
     */
    formatToISODate: (date: Date = new Date()): string => {
        const tz = DateUtils.getTimeZone();
        // Usamos o formatador do Intl para garantir que pegamos os valores corretos no fuso desejado
        const formatter = new Intl.DateTimeFormat('en-CA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            timeZone: tz
        });

        // en-CA retorna YYYY-MM-DD
        return formatter.format(date);
    },

    /**
     * Formata data e hora para exibição amigável.
     */
    formatDateTime: (date: Date): string => {
        return new Intl.DateTimeFormat('pt-BR', {
            dateStyle: 'short',
            timeStyle: 'short',
            timeZone: DateUtils.getTimeZone()
        }).format(date);
    },

    /**
     * Formata uma string YYYY-MM-DD para DD/MM/YYYY sem deslocamento de fuso.
     */
    formatDisplayDate: (dateStr: string): string => {
        if (!dateStr) return '';
        // Caso receba ISO com tempo, pegamos apenas a data
        const pureDate = dateStr.split('T')[0];
        const parts = pureDate.split('-');
        if (parts.length !== 3) return dateStr;
        const [year, month, day] = parts;
        return `${day}/${month}/${year}`;
    },

    /**
     * Formata mês e ano para exibição (Ex: JAN / 24)
     */
    formatMonthYear: (year: number, month: number): string => {
        const date = new Date(year, month - 1);
        const monthStr = new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).toUpperCase();
        const yearStr = String(year).slice(-2);
        return `${monthStr.replace('.', '')} / ${yearStr}`;
    },

    /**
     * Formata mês por extenso e ano (Ex: JANEIRO / 2024)
     */
    formatFullMonthYear: (year: number, month: number): string => {
        const date = new Date(year, month - 1);
        const monthStr = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(date).toUpperCase();
        return `${monthStr} / ${year}`;
    },

    /**
     * Formata mês por extenso e ano sem barra (Ex: FEVEREIRO 2026)
     */
    formatFullMonthYearNoSlash: (year: number, month: number): string => {
        const date = new Date(year, month - 1);
        const monthStr = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(date).toUpperCase();
        return `${monthStr} ${year}`;
    },

    /**
     * Soma (ou subtrai, com delta negativo) dias a uma data YYYY-MM-DD sem
     * deslocamento de fuso horário (aritmética em UTC). Se a string não for
     * uma data válida (ex: sentinelas "0001-01-01"/"9999-12-31" dos presets
     * de período), devolve a própria string sem alterar.
     */
    addDaysISO: (dateStr: string, delta: number): string => {
        const pure = (dateStr || '').split('T')[0];
        const m = pure.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return dateStr;
        const year = parseInt(m[1], 10);
        // Sentinelas de "período inteiro" ficam como estão — somar/subtrair dias
        // nelas não tem significado e poderia estourar o range do Date.
        if (year < 1900 || year > 9000) return dateStr;
        const d = new Date(Date.UTC(year, parseInt(m[2], 10) - 1, parseInt(m[3], 10)));
        d.setUTCDate(d.getUTCDate() + delta);
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }
};
