import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { parseTags, formatTags, normalizeTag, getKnownTags, rememberTags } from '../../lib/tagUtils';

interface TagsInputProps {
    value: string[] | undefined;
    onChange: (tags: string[]) => void;
    /** Tags já usadas na conta, sugeridas enquanto o usuário digita. */
    suggestions?: string[];
    placeholder?: string;
    className?: string;
}

/** Quantas sugestões cabem sem virar uma parede de botões no celular. */
const MAX_VISIBLE_SUGGESTIONS = 8;

/**
 * Campo de tags — por que ele precisa de estado próprio
 * -----------------------------------------------------
 * A versão anterior era um input controlado assim:
 *
 *     value={form.tags?.join(', ')}
 *     onChange={e => setTags(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
 *
 * Isso torna IMPOSSÍVEL digitar uma vírgula. Ao teclar "viagem," o split produz
 * `['viagem', '']`, o filtro descarta o vazio, e o `join(', ')` devolve
 * "viagem" — a vírgula recém-digitada some da tela no mesmo instante. O usuário
 * nunca conseguia criar a segunda tag, e o espaço depois da vírgula também era
 * engolido. Parecia que a tag "não ficava".
 *
 * A correção é separar o que está sendo DIGITADO (texto livre, preservado como
 * está) do que é PUBLICADO para o formulário (o array limpo). O texto só é
 * reescrito quando o valor muda por fora — abrir outro lançamento, por exemplo.
 *
 * Sugestões: por que não bastava o `<datalist>`
 * ---------------------------------------------
 * A lista de tags conhecidas ficava só num `<datalist>`. No Chrome do Android
 * ele quase nunca aparece: o teclado virtual cobre a lista e, com o
 * autopreenchimento do sistema ativo, o navegador não abre o dropdown. Do lado
 * do usuário, "não aparecia nenhuma tag". Agora as sugestões também saem como
 * botões visíveis logo abaixo do campo — um toque acrescenta a tag. O
 * `<datalist>` continua ali para quem usa teclado físico no computador.
 */
export const TagsInput: React.FC<TagsInputProps> = ({
    value,
    onChange,
    suggestions = [],
    placeholder = 'Ex: viagem, lazer, 2026',
    className
}) => {
    const listId = useId();
    const [draft, setDraft] = useState<string>(() => formatTags(value));
    // Guarda o que este campo publicou por último, para distinguir "o pai mudou
    // porque eu digitei" de "o pai mudou sozinho".
    const publishedRef = useRef<string>(formatTags(value));
    // Catálogo local (tags que este aparelho já viu ou digitou). Fica no estado
    // para a lista crescer no instante em que o usuário confirma uma tag nova,
    // sem precisar fechar e reabrir o lançamento.
    const [knownTags, setKnownTags] = useState<string[]>(() => getKnownTags());

    useEffect(() => {
        const incoming = formatTags(value);
        if (incoming === publishedRef.current) return; // eco da própria digitação
        publishedRef.current = incoming;
        setDraft(incoming);
    }, [value]);

    // As tags que a tela trouxe entram no catálogo: assim uma tag usada no
    // Histórico já aparece como sugestão na tela de Cartões, e vice-versa.
    const suggestionsKey = suggestions.join(',');
    useEffect(() => {
        if (suggestions.length === 0) return;
        setKnownTags(rememberTags(suggestions));
    }, [suggestionsKey]);

    const handleChange = (raw: string) => {
        setDraft(raw); // o que aparece na tela é exatamente o que foi digitado
        const parsed = parseTags(raw);
        publishedRef.current = parsed.join(', ');
        onChange(parsed);
    };

    /** Fecha a digitação: arruma a pontuação e guarda as tags no catálogo. */
    const commit = () => {
        const parsed = parseTags(draft);
        setDraft(formatTags(parsed));
        if (parsed.length > 0) setKnownTags(rememberTags(parsed));
    };

    const selected = parseTags(value);
    const selectedKey = selected.join(',');
    const knownKey = knownTags.join(',');

    /**
     * O que oferecer: tudo que este aparelho conhece, menos o que já está no
     * campo, filtrado pelo pedaço que está sendo digitado depois da última
     * vírgula (digitar "mac" restringe para "Maceió.26").
     */
    const visibleSuggestions = useMemo(() => {
        const pool = parseTags([...suggestions, ...knownTags]);
        if (pool.length === 0) return [];

        const chosen = new Set(selected.map(normalizeTag));
        const typing = normalizeTag(draft.split(',').pop() || '');

        return pool
            .filter(tag => !chosen.has(normalizeTag(tag)))
            .filter(tag => !typing || normalizeTag(tag).includes(typing))
            .slice(0, MAX_VISIBLE_SUGGESTIONS);
    }, [suggestionsKey, knownKey, selectedKey, draft]);

    /** Toque numa sugestão: acrescenta a tag ao que já foi escolhido. */
    const addSuggestion = (tag: string) => {
        const next = parseTags([...selected, tag]);
        setDraft(formatTags(next));
        publishedRef.current = next.join(', ');
        onChange(next);
        setKnownTags(rememberTags(next));
    };

    const allSuggestions = parseTags([...suggestions, ...knownTags]);

    return (
        <>
            <input
                type="text"
                value={draft}
                onChange={e => handleChange(e.target.value)}
                // Ao sair do campo, arruma a pontuação ("a ,, b," -> "a, b").
                onBlur={commit}
                list={allSuggestions.length > 0 ? listId : undefined}
                placeholder={placeholder}
                className={className}
            />
            {allSuggestions.length > 0 && (
                <datalist id={listId}>
                    {allSuggestions.map(tag => <option key={tag} value={tag} />)}
                </datalist>
            )}
            {visibleSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                    {visibleSuggestions.map(tag => (
                        <button
                            key={tag}
                            type="button"
                            // onMouseDown e não onClick: o toque precisa ser
                            // processado ANTES do blur do input, senão o commit
                            // reescreve o rascunho e a escolha se perde.
                            onMouseDown={e => { e.preventDefault(); addSuggestion(tag); }}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-brand-50 text-slate-500 hover:text-brand-600 border border-slate-200 hover:border-brand-200 rounded-lg text-[10px] font-bold transition-colors max-w-full truncate"
                        >
                            + {tag}
                        </button>
                    ))}
                </div>
            )}
        </>
    );
};

export default TagsInput;
