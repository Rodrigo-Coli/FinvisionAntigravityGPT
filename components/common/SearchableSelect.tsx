import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

// Combobox padrão do sistema: mostra o valor selecionado, e ao clicar permite
// digitar para filtrar as opções em vez de rolar uma lista fixa. Feito para
// substituir gradualmente os <select> simples nas telas com listas longas.
export default function SearchableSelect({ options, value, onChange, placeholder, className }: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = options.find(o => o.value === value)?.label || '';

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const filteredOptions = useMemo(() => {
    if (!query.trim()) return options;
    const q = normalize(query);
    return options.filter(o => normalize(o.label).includes(q));
  }, [options, query]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className={className || 'w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold flex items-center justify-between gap-2'}
      >
        <span className={selectedLabel ? '' : 'text-slate-400'}>{selectedLabel || placeholder || 'Selecione...'}</span>
        <ChevronDown size={12} className="text-slate-400 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
            <Search size={12} className="text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Digite para buscar..."
              className="w-full text-xs font-bold outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filteredOptions.length === 0 && (
              <div className="px-3 py-2 text-xs text-slate-400 font-semibold">Nenhuma opção encontrada</div>
            )}
            {filteredOptions.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setIsOpen(false);
                  setQuery('');
                }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-bold text-left hover:bg-indigo-50 transition-colors"
              >
                <span>{o.label}</span>
                {o.value === value && <Check size={12} className="text-indigo-500 shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
