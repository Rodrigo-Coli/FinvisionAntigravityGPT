import React, { useEffect, useId, useRef, useState } from 'react';
import { parseTags, formatTags } from '../../lib/tagUtils';

interface TagsInputProps {
    value: string[] | undefined;
    onChange: (tags: string[]) => void;
    /** Tags já usadas na conta, sugeridas enquanto o usuário digita. */
    suggestions?: string[];
    placeholder?: string;
    className?: string;
}

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

    useEffect(() => {
        const incoming = formatTags(value);
        if (incoming === publishedRef.current) return; // eco da própria digitação
        publishedRef.current = incoming;
        setDraft(incoming);
    }, [value]);

    const handleChange = (raw: string) => {
        setDraft(raw); // o que aparece na tela é exatamente o que foi digitado
        const parsed = parseTags(raw);
        publishedRef.current = parsed.join(', ');
        onChange(parsed);
    };

    return (
        <>
            <input
                type="text"
                value={draft}
                onChange={e => handleChange(e.target.value)}
                // Ao sair do campo, arruma a pontuação ("a ,, b," -> "a, b").
                onBlur={() => setDraft(formatTags(parseTags(draft)))}
                list={suggestions.length > 0 ? listId : undefined}
                placeholder={placeholder}
                className={className}
            />
            {suggestions.length > 0 && (
                <datalist id={listId}>
                    {suggestions.map(tag => <option key={tag} value={tag} />)}
                </datalist>
            )}
        </>
    );
};

export default TagsInput;
