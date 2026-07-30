import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, Check, Calendar } from 'lucide-react';
import { DateUtils } from '../../lib/dateUtils';

interface Statement {
    id: string;
    year: number;
    month: number;
    due_date?: string;
    status?: string;
}

interface StatementPickerProps {
    statements: Statement[];
    value: string;                 // 'CURRENT' | 'ALL' | statement.id
    realCurrentStatementId?: string | null;
    onChange: (val: string) => void;
}

const normalize = (val: string) => val.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Seletor de fatura pesquisável. Substitui o <select> nativo que listava as faturas
 * futuras antes das próximas/recentes. Agrupa em Atual, Anteriores (mais recente primeiro)
 * e Próximas (mais próxima primeiro), e permite digitar o mês/ano para filtrar.
 */
export const StatementPicker: React.FC<StatementPickerProps> = ({ statements, value, realCurrentStatementId, onChange }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Referência temporal: a fatura atual de verdade (ou hoje, se não houver)
    const currentStmt = useMemo(
        () => statements.find(s => s.id === realCurrentStatementId),
        [statements, realCurrentStatementId]
    );
    const refKey = currentStmt
        ? currentStmt.year * 12 + currentStmt.month
        : (() => { const n = new Date(); return n.getFullYear() * 12 + (n.getMonth() + 1); })();

    const { previous, upcoming } = useMemo(() => {
        const prev: Statement[] = [];
        const up: Statement[] = [];
        for (const s of statements) {
            if (s.id === realCurrentStatementId) continue;
            const key = s.year * 12 + s.month;
            if (key < refKey) prev.push(s);
            else up.push(s);
        }
        // Anteriores: mais recente primeiro. Próximas: mais próxima primeiro.
        prev.sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month));
        up.sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month));
        return { previous: prev, upcoming: up };
    }, [statements, realCurrentStatementId, refKey]);

    const matchesSearch = (s: Statement) => {
        if (!search.trim()) return true;
        return normalize(DateUtils.formatStatementLabel(s)).includes(normalize(search));
    };

    const filteredPrev = previous.filter(matchesSearch);
    const filteredUp = upcoming.filter(matchesSearch);

    const displayLabel = (() => {
        if (value === 'CURRENT') return 'Fatura Atual';
        if (value === 'ALL') return 'Todo o Histórico';
        const s = statements.find(st => st.id === value);
        return s ? DateUtils.formatStatementLabel(s) : 'Fatura Atual';
    })();

    const select = (val: string) => {
        onChange(val);
        setOpen(false);
        setSearch('');
    };

    const Row: React.FC<{ label: string; selected: boolean; onClick: () => void }> = ({ label, selected, onClick }) => (
        <button
            type="button"
            onClick={onClick}
            className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-xs font-bold hover:bg-slate-50 transition-colors ${selected ? 'text-brand-600' : 'text-slate-700'}`}
        >
            <span className="truncate uppercase tracking-wide">{label}</span>
            {selected && <Check size={14} className="text-brand-600 shrink-0" />}
        </button>
    );

    return (
        <div ref={ref} className="relative w-full sm:w-auto min-w-[200px]">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full bg-slate-50 dark:bg-brand-900 border border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 text-xs font-black uppercase tracking-widest outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all flex items-center justify-between gap-2"
            >
                <span className="truncate flex items-center gap-2"><Calendar size={13} className="text-slate-400" /> {displayLabel}</span>
                <ChevronDown size={14} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute z-[60] top-full left-0 right-0 mt-1 bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 min-w-[240px]">
                    <div className="p-2 border-b border-slate-50">
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                            <input
                                autoFocus
                                className="w-full pl-8 pr-3 h-9 bg-slate-50 rounded-xl text-xs font-medium outline-none placeholder:text-slate-300 focus:ring-2 focus:ring-brand-500/10"
                                placeholder="Digite o mês ou ano..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="max-h-64 overflow-y-auto">
                        {!search.trim() && (
                            <>
                                <Row label="Fatura Atual" selected={value === 'CURRENT'} onClick={() => select('CURRENT')} />
                                <Row label="Todo o Histórico" selected={value === 'ALL'} onClick={() => select('ALL')} />
                            </>
                        )}

                        {filteredPrev.length > 0 && (
                            <>
                                <p className="px-4 pt-2 pb-1 text-[9px] font-black text-slate-300 uppercase tracking-widest">Anteriores</p>
                                {filteredPrev.map(s => (
                                    <Row key={s.id} label={DateUtils.formatStatementLabel(s)} selected={value === s.id} onClick={() => select(s.id)} />
                                ))}
                            </>
                        )}

                        {filteredUp.length > 0 && (
                            <>
                                <p className="px-4 pt-2 pb-1 text-[9px] font-black text-slate-300 uppercase tracking-widest">Próximas</p>
                                {filteredUp.map(s => (
                                    <Row key={s.id} label={DateUtils.formatStatementLabel(s)} selected={value === s.id} onClick={() => select(s.id)} />
                                ))}
                            </>
                        )}

                        {search.trim() && filteredPrev.length === 0 && filteredUp.length === 0 && (
                            <p className="px-4 py-4 text-xs text-slate-300 text-center">Nenhuma fatura encontrada</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
