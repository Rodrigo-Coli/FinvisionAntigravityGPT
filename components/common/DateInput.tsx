import React, { useEffect, useRef, useState } from 'react';
import { Calendar } from 'lucide-react';

/**
 * Campo de data do app inteiro: DIGITAR ou ESCOLHER no calendário.
 *
 * O `<input type="date">` nativo, no celular, não deixa digitar: qualquer toque
 * abre o calendário, e ir de 2026 para uma data antiga exige rolar mês a mês.
 * Aqui o campo é texto — você digita só os números (25102026) e as barras
 * entram sozinhas (25/10/2026). O ícone do calendário abre o seletor nativo.
 *
 * Por fora funciona como o input antigo: `value` em AAAA-MM-DD e `onChange`
 * recebe um evento com `e.target.value` em AAAA-MM-DD — as telas não mudam.
 * O valor só é enviado com a data completa e válida (ou vazio, ao apagar).
 */

type NativeDateProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'defaultValue'>;

export interface DateInputProps extends NativeDateProps {
  value?: string | null;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-10-25" (ou "2026-10-25T…") → "25/10/2026". Datas-sentinela ("tudo") viram vazio. */
export function isoToDisplay(iso?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '';
  const year = Number(m[1]);
  if (year < 1000 || year >= 9999) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Dígitos digitados → "DD/MM/AAAA" parcial, com as barras no lugar. */
export function maskDateDigits(text: string): string {
  const d = String(text || '').replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** "25/10/2026" → "2026-10-25"; data incompleta ou inexistente (31/02) → null. */
export function displayToIso(display: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || year < 1000) return null;
  const check = new Date(year, month - 1, day);
  if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Evento no formato que as telas já esperam (`e.target.value`). */
const fakeChange = (value: string, name?: string) =>
  ({ target: { value, name }, currentTarget: { value, name } } as unknown as React.ChangeEvent<HTMLInputElement>);

export const DateInput: React.FC<DateInputProps> = ({
  value,
  onChange,
  onBlur,
  onKeyDown,
  className = '',
  min,
  max,
  required,
  disabled,
  autoFocus,
  name,
  id,
  placeholder = 'dd/mm/aaaa',
  title,
  ...rest
}) => {
  const [text, setText] = useState(() => isoToDisplay(value));
  const focusedRef = useRef(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const nativeRef = useRef<HTMLInputElement>(null);

  // Valor mudou por fora (outro lançamento, botão "este mês"): reflete no campo,
  // a não ser que a pessoa esteja digitando nele.
  useEffect(() => {
    if (!focusedRef.current) setText(isoToDisplay(value));
  }, [value]);

  const emit = (iso: string) => onChange?.(fakeChange(iso, name));

  const handleTyping = (raw: string) => {
    let digits = raw.replace(/\D/g, '');
    // Apagar com o cursor logo depois de uma barra: a barra volta sozinha na
    // máscara; sem isto, o backspace "travava" ali.
    const prevDigits = text.replace(/\D/g, '');
    if (raw.length < text.length && digits === prevDigits) digits = digits.slice(0, -1);
    const masked = maskDateDigits(digits);
    setText(masked);
    if (!masked) { emit(''); return; }
    const iso = displayToIso(masked);
    if (iso) emit(iso);
  };

  const openCalendar = () => {
    const el = nativeRef.current as any;
    if (!el || disabled) return;
    try {
      if (typeof el.showPicker === 'function') { el.showPicker(); return; }
    } catch { /* navegador sem showPicker: cai no clique */ }
    el.focus();
    el.click();
  };

  // Só avisa "saiu do campo" quando o foco sai do conjunto (texto + calendário):
  // tocar no ícone não pode disparar o salvar-ao-sair das edições na tabela.
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const next = e.relatedTarget as Node | null;
    if (next && wrapRef.current?.contains(next)) return;
    focusedRef.current = false;
    // Data pela metade: volta para o valor que estava valendo.
    if (text && !displayToIso(text)) setText(isoToDisplay(value));
    onBlur?.(e);
  };

  // O estilo de quem usa o campo vai no contorno; o foco do texto acende o contorno.
  const wrapperClass = `${className.replace(/(^|\s)focus:/g, '$1focus-within:')} relative inline-flex items-center gap-1`;

  return (
    <span ref={wrapRef} className={wrapperClass} title={title}>
      <input
        {...rest}
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={10}
        value={text}
        onFocus={(e) => { focusedRef.current = true; rest.onFocus?.(e); }}
        onChange={(e) => handleTyping(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={onKeyDown}
        className="flex-1 min-w-0 w-full bg-transparent border-0 outline-none p-0 m-0 text-inherit font-inherit placeholder:text-slate-300"
        style={{ font: 'inherit', color: 'inherit' }}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={openCalendar}
        onBlur={(e) => {
          const next = e.relatedTarget as Node | null;
          if (next && wrapRef.current?.contains(next)) return;
          onBlur?.(e as unknown as React.FocusEvent<HTMLInputElement>);
        }}
        className="shrink-0 p-1 -mr-1 rounded-md text-slate-400 hover:text-brand-600 disabled:opacity-40"
        style={{ touchAction: 'manipulation' }}
        aria-label="Abrir calendário"
      >
        <Calendar size={14} />
      </button>
      {/* Calendário nativo: invisível, só para o seletor do sistema. */}
      <input
        ref={nativeRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        min={min}
        max={max}
        disabled={disabled}
        value={/^\d{4}-\d{2}-\d{2}/.test(String(value || '')) ? String(value).slice(0, 10) : ''}
        onChange={(e) => {
          const iso = e.target.value;
          setText(isoToDisplay(iso));
          emit(iso);
        }}
        className="absolute right-0 bottom-0 w-px h-px opacity-0 pointer-events-none"
        style={{ colorScheme: 'light' }}
      />
    </span>
  );
};

export default DateInput;
