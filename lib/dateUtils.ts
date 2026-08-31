
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
    /**
     * Formata data + hora. Devolve '—' quando a data é inválida em vez de estourar.
     * O Intl.DateTimeFormat lança "Invalid time value" ao receber um Date inválido, e
     * como isso acontecia dentro do render, a tela inteira caía no "Ops! Algo deu
     * errado" — foi o que ocorria ao importar um comprovante sem data legível.
     */
    formatDateTime: (date: Date | string | null | undefined): string => {
        const d = date instanceof Date ? date : (date ? new Date(date) : null);
        if (!d || isNaN(d.getTime())) return '—';
        return new Intl.DateTimeFormat('pt-BR', {
            dateStyle: 'short',
            timeStyle: 'short',
            timeZone: DateUtils.getTimeZone()
        }).format(d);
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
     * Mês/ano em que uma fatura de cartão é COBRADA (mês do vencimento).
     *
     * As colunas month/year da fatura guardam o ciclo de FECHAMENTO. Em cartão que
     * fecha num mês e vence no seguinte (ex.: BTG, fecha dia 25 e vence dia 1), o
     * ciclo e o vencimento caem em meses diferentes — a fatura que fecha em 25/08
     * vence em 01/09, e está gravada como month=8. Como a regra do app é que a
     * compra conta no mês em que a fatura vence, tudo que é exibido para o usuário
     * (rótulo na tela de Cartões, descrição do lançamento no Histórico e o aviso de
     * conta a pagar no WhatsApp/push) tem que seguir o vencimento — senão a mesma
     * fatura aparece como "09/2026" em Cartões e "(8/2026)" no Histórico, e parece
     * que são duas contas diferentes.
     *
     * Não mexe no dado gravado: só na forma de exibir.
     */
    getStatementCompetence: (
        stmt: { due_date?: string | null; month?: number; year?: number } | null | undefined
    ): { month: number; year: number } | null => {
        if (!stmt) return null;
        const due = stmt.due_date ? new Date(stmt.due_date) : null;
        if (due && !isNaN(due.getTime())) {
            // due_date é gravado em UTC (meia-noite); lemos em UTC para não voltar um dia.
            return { month: due.getUTCMonth() + 1, year: due.getUTCFullYear() };
        }
        if (stmt.year && stmt.month) return { month: stmt.month, year: stmt.year };
        return null;
    },

    /**
     * Rótulo por extenso de uma fatura de cartão, sempre pelo MÊS DE VENCIMENTO.
     * Ver `getStatementCompetence` para o porquê.
     */
    formatStatementLabel: (
        stmt: { due_date?: string | null; month?: number; year?: number } | null | undefined,
        withSlash: boolean = true
    ): string => {
        const competence = DateUtils.getStatementCompetence(stmt);
        if (!competence) return '';
        return withSlash
            ? DateUtils.formatFullMonthYear(competence.year, competence.month)
            : DateUtils.formatFullMonthYearNoSlash(competence.year, competence.month);
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
