import { describe, it, expect, beforeEach } from 'vitest';
import { parseTags, formatTags, normalizeTag, collectTags, matchesAnyTag, getKnownTags, rememberTags, suggestTags } from '../lib/tagUtils';

describe('parseTags — o que ia para a coluna text[]', () => {
  it('converte o texto digitado em array', () => {
    expect(parseTags('viagem, lazer, 2026')).toEqual(['viagem', 'lazer', '2026']);
  });

  it('campo esvaziado vira array vazio, nunca string', () => {
    // Este era o bug: `if (patch.tags && ...)` pulava a conversão porque '' é
    // falso, e a string vazia ia para uma coluna text[]. O Postgres recusa, o
    // erro era engolido, e a tag "não ficava salva".
    expect(parseTags('')).toEqual([]);
    expect(parseTags(null)).toEqual([]);
    expect(parseTags(undefined)).toEqual([]);
  });

  it('descarta separadores soltos e espaços', () => {
    expect(parseTags(' a ,, b , ')).toEqual(['a', 'b']);
  });

  it('não duplica a mesma tag escrita de formas diferentes', () => {
    expect(parseTags('Viagem, viagem, VIAGEM')).toEqual(['Viagem']);
    expect(parseTags('Maceió, maceio')).toEqual(['Maceió']);
  });

  it('aceita array já pronto sem alterar o conteúdo', () => {
    expect(parseTags(['casa', 'obra'])).toEqual(['casa', 'obra']);
  });
});

describe('formatTags — texto exibido no campo', () => {
  it('mantém a vírgula que o usuário digitou entre duas tags', () => {
    // O input controlado antigo derivava o valor de `arr.join(', ')` a cada
    // tecla, então ao digitar "viagem," o split/filter descartava o vazio e a
    // vírgula sumia da tela — era impossível criar a segunda tag.
    expect(formatTags(parseTags('viagem, lazer'))).toBe('viagem, lazer');
  });

  it('normaliza a pontuação bagunçada', () => {
    expect(formatTags('a ,,  b,')).toBe('a, b');
  });
});

describe('normalizeTag', () => {
  it('ignora acento e caixa na comparação', () => {
    expect(normalizeTag('Maceió.26')).toBe(normalizeTag('maceio.26'));
    expect(normalizeTag('Maceió.26')).not.toBe(normalizeTag('maceio.2026'));
  });
});

describe('collectTags — lista que alimenta filtro e sugestões', () => {
  it('junta banco e cartão, sem repetir', () => {
    const bancos = [{ tags: ['casa'] }, { tags: ['viagem'] }];
    const cartoes = [{ tags: ['viagem', 'lazer'] }];
    expect(collectTags(bancos, cartoes)).toEqual(['casa', 'lazer', 'viagem']);
  });

  it('agrupa variações de acento sob a grafia mais usada', () => {
    const rows = [
      { tags: ['Maceió.26'] },
      { tags: ['Maceió.26'] },
      { tags: ['Maceio.26'] }
    ];
    expect(collectTags(rows)).toEqual(['Maceió.26']);
  });

  it('ignora linhas sem tag', () => {
    expect(collectTags([{ tags: null }, { tags: [] }, {}])).toEqual([]);
  });
});

describe('matchesAnyTag — filtro por tag', () => {
  const linha = { tags: ['Maceió.26', 'lazer'] };

  it('sem filtro selecionado, tudo passa', () => {
    expect(matchesAnyTag(linha.tags, [])).toBe(true);
  });

  it('casa por qualquer uma das tags escolhidas', () => {
    expect(matchesAnyTag(linha.tags, ['lazer'])).toBe(true);
    expect(matchesAnyTag(linha.tags, ['casa', 'lazer'])).toBe(true);
  });

  it('casa ignorando acento e caixa', () => {
    expect(matchesAnyTag(linha.tags, ['maceio.26'])).toBe(true);
  });

  it('não casa o que não tem a tag', () => {
    expect(matchesAnyTag(linha.tags, ['casa'])).toBe(false);
    expect(matchesAnyTag(null, ['casa'])).toBe(false);
  });
});

describe('catálogo local de tags — por que o campo não sugeria nada', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('começa vazio e guarda o que foi digitado', () => {
    expect(getKnownTags()).toEqual([]);
    rememberTags('Maceió.26, lazer');
    expect(getKnownTags()).toEqual(['lazer', 'Maceió.26']);
  });

  it('não duplica variação de acento e caixa da mesma tag', () => {
    rememberTags(['Maceió.26']);
    rememberTags(['maceio.26']);
    expect(getKnownTags()).toEqual(['Maceió.26']);
  });

  it('sobrevive a recarregar o app: fica no localStorage, não na memória', () => {
    rememberTags(['obra']);
    // getKnownTags relê do storage a cada chamada — é o que faz a sugestão
    // continuar existindo depois de fechar e reabrir o app, inclusive offline.
    expect(getKnownTags()).toEqual(['obra']);
  });

  it('sugere o que está na tela somado ao que o aparelho já conhece', () => {
    // O caso real: a tag foi usada num lançamento bancário (Histórico) e o
    // usuário abre a tela de Cartões, onde só as compras da fatura estão
    // carregadas. Antes, a sugestão vinha só da tela e não aparecia nada.
    rememberTags(['Maceió.26']);
    const sugestoes = suggestTags([{ tags: ['mercado'] }]);
    expect(sugestoes).toEqual(['Maceió.26', 'mercado']);
  });

  it('a tela alimenta o catálogo: o que passou por suggestTags vira sugestão depois', () => {
    suggestTags([{ tags: ['viagem'] }, { tags: ['lazer'] }]);
    expect(getKnownTags()).toEqual(['lazer', 'viagem']);
    // Mesmo com a tela vazia (offline, cache de outro período), a lista continua.
    expect(suggestTags([])).toEqual(['lazer', 'viagem']);
  });

  it('ignora entrada vazia sem apagar o que já existe', () => {
    rememberTags(['casa']);
    rememberTags('');
    rememberTags(null);
    expect(getKnownTags()).toEqual(['casa']);
  });
});
