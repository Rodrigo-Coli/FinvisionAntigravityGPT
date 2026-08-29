import React, { useEffect, useMemo, useRef, useState } from 'react';
import { normalizeStr } from '../../lib/stringUtils';

interface SearchableInputProps {
    value: string;
    onChange: (v: string) => void;
    options: string[];
    placeholder?: string;
    className?: string;
    disabled?: boolean;
    /** Quantas sugestões mostrar de uma vez. */
    maxVisible?: number;
    onBlur?: () => void;
    autoFocus?: boolean;
}

/**
 * Campo com sugestões que ignora acento e maiúscula
 * -------------------------------------------------
 * Os campos de Categoria, Subcategoria e Pessoa usavam `<datalist>` nativo.
 * Quem filtra ali é o NAVEGADOR, e o filtro dele é sensível a acento: digitando
 * "alimentacao" a opção "Alimentação" simplesmente não aparecia, e digitando
 * "cartao" o "Cartão de Crédito" sumia da lista. Como o campo também aceita
 * texto livre (o app cria a categoria que não existe), o resultado prático era
 * pior do que não sugerir nada: o usuário achava que a categoria não existia e
 * criava uma duplicada com a grafia sem acento.
 *
 * Aqui o filtro é nosso, com `normalizeStr` — mesma regra já usada na busca do
 * Histórico: sem acento, sem diferença de maiúscula, sem espaço nas pontas.
 *
 * O campo continua de texto livre de propósito: digitar algo que não está na
 * lista segue permitido, porque é assim que se cria categoria nova.
 */
export const SearchableInput: React.FC<SearchableInputProps> = ({
    value,
    onChange,
    options,
    placeholder,
    className,
    disabled,
    maxVisible = 8,
    onBlur,
    autoFocus
}) => {
    const [open, setOpen] = useState(false);
    const [highlight, setHighlight] = useState(0);
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const matches = useMemo(() => {
        const term = normalizeStr(value || '');
        const unique = Array.from(new Set(options.filter(Boolean)));

        // Sem nada digitado, mostra tudo (o campo funciona como uma lista).
        if (!term) return unique.sort((a, b) => a.localeCompare(b, 'pt-BR'));

        // Quem começa com o termo vem primeiro: digitando "ali", "Alimentação"
        // deve aparecer antes de "Saúde Alimentar".
        const starts: string[] = [];
        const contains: string[] = [];
        for (const opt of unique) {
            const norm = normalizeStr(opt);
            if (norm.startsWith(term)) starts.push(opt);
            else if (norm.includes(term)) contains.push(opt);
        }
        const cmp = (a: string, b: string) => a.localeCompare(b, 'pt-BR');
        return [...starts.sort(cmp), ...contains.sort(cmp)];
    }, [options, value]);

    const visible = matches.slice(0, maxVisible);
    // Digitou exatamente uma opção que já existe: não há o que sugerir.
    const exact = matches.length === 1 && normalizeStr(matches[0]) === normalizeStr(value || '');

    const pick = (option: string) => {
        onChange(option);
        setOpen(false);
        setHighlight(0);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!open || visible.length === 0) {
            if (e.key === 'ArrowDown') { setOpen(true); setHighlight(0); }
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight(h => (h + 1) % visible.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight(h => (h - 1 + visible.length) % visible.length);
        } else if (e.key === 'Enter') {
            // Enter só escolhe da lista se houver uma opção em destaque; caso
            // contrário deixa o texto livre passar (é assim que se cria nova).
            if (visible[highlight]) { e.preventDefault(); pick(visible[highlight]); }
        } else if (e.key === 'Escape') {
            setOpen(false);
        }
    };

    return (
        <div ref={wrapRef} className="relative">
            <input
                type="text"
                value={value}
                disabled={disabled}
                autoFocus={autoFocus}
                onFocus={(e) => { e.target.select(); setOpen(true); setHighlight(0); }}
                onChange={(e) => { onChange(e.target.value); setOpen(true); setHighlight(0); }}
                onKeyDown={handleKeyDown}
                onBlur={onBlur}
                placeholder={placeholder}
                className={className}
                autoComplete="off"
            />

            {open && !disabled && visible.length > 0 && !exact && (
                <div className="absolute z-50 top-full mt-1 left-0 right-0 max-h-56 overflow-y-auto bg-white border border-slate-100 rounded-xl shadow-2xl animate-in fade-in duration-100">
                    {visible.map((option, idx) => (
                        <button
                            key={option}
                            type="button"
                            // mousedown em vez de click: o clique acontece depois do
                            // blur do input, e alguns campos salvam no blur — nessa
                            // ordem a escolha do usuário se perderia.
                            onMouseDown={(e) => { e.preventDefault(); pick(option); }}
                            onMouseEnter={() => setHighlight(idx)}
                            className={`w-full text-left px-4 py-2.5 text-xs font-bold transition-colors ${
                                idx === highlight ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            {option}
                        </button>
                    ))}
                    {matches.length > visible.length && (
                        <div className="px-4 py-2 text-[10px] font-bold text-slate-300 border-t border-slate-50">
                            +{matches.length - visible.length} — continue digitando para refinar
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default SearchableInput;
