/**
 * Estabelecimento lido do cupom (Inteligência Labs)
 * -------------------------------------------------
 * - Segmento: a IA só conhecia "Mercado | Restaurante | Farmácia | Loja |
 *   Posto | Outros" e o Comparador só filtrava Mercado / Restaurante / Loja.
 *   Um cupom da Panvel (farmácia) não aparecia em filtro nenhum. Agora há uma
 *   lista completa de segmentos e os sinônimos que a IA devolve ("Drogaria",
 *   "Supermercado", "Combustível"...) caem no segmento certo.
 * - Nomes: o cupom traz o nome fantasia ("Panvel"), a razão social
 *   ("PANVEL FARMACIAS") e o CNPJ. Guardamos os três; o app mostra o nome
 *   fantasia por padrão e o usuário pode preferir a razão social.
 *
 * Sem imports de propósito: este arquivo também roda na API (Node ESM).
 */

export const MERCHANT_SEGMENTS = [
  'Mercado',
  'Farmácia',
  'Restaurante',
  'Padaria',
  'Posto',
  'Loja',
  'Vestuário',
  'Eletrônicos',
  'Casa e Construção',
  'Pet Shop',
  'Saúde',
  'Beleza',
  'Transporte',
  'Serviços',
  'Educação',
  'Lazer',
  'Outros',
] as const;

export type MerchantSegment = (typeof MERCHANT_SEGMENTS)[number];

const norm = (s: unknown): string =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Sinônimos (já normalizados) → segmento. Ordem importa: o primeiro que casar vence. */
const SEGMENT_SYNONYMS: [MerchantSegment, string[]][] = [
  ['Farmácia', ['farmacia', 'drogaria', 'drogarias', 'farmacias', 'medicamento', 'medicamentos', 'remedio', 'remedios', 'manipulacao']],
  ['Padaria', ['padaria', 'confeitaria', 'panificadora', 'panificacao', 'doceria']],
  ['Mercado', ['mercado', 'supermercado', 'hipermercado', 'minimercado', 'mercearia', 'atacado', 'atacadista', 'hortifruti', 'acougue', 'emporio', 'conveniencia', 'alimentacao', 'mercado/supermercado']],
  ['Restaurante', ['restaurante', 'lanchonete', 'bar', 'cafe', 'cafeteria', 'pizzaria', 'hamburgueria', 'fast food', 'delivery', 'sorveteria', 'churrascaria', 'food']],
  ['Posto', ['posto', 'posto de combustivel', 'combustivel', 'combustiveis', 'gasolina', 'auto posto']],
  ['Pet Shop', ['pet shop', 'petshop', 'pet', 'veterinaria', 'veterinario', 'agropecuaria']],
  ['Vestuário', ['vestuario', 'roupa', 'roupas', 'moda', 'calcados', 'calcado', 'sapataria', 'confeccao', 'confeccoes']],
  ['Eletrônicos', ['eletronicos', 'eletronico', 'eletrodomesticos', 'informatica', 'celular', 'celulares', 'tecnologia', 'games']],
  ['Casa e Construção', ['casa e construcao', 'construcao', 'material de construcao', 'materiais de construcao', 'ferragem', 'ferragens', 'home center', 'moveis', 'decoracao', 'utilidades domesticas']],
  ['Saúde', ['saude', 'clinica', 'hospital', 'laboratorio', 'otica', 'odontologia', 'dentista', 'consultorio']],
  ['Beleza', ['beleza', 'cosmeticos', 'perfumaria', 'salao', 'salao de beleza', 'barbearia', 'estetica']],
  ['Transporte', ['transporte', 'estacionamento', 'pedagio', 'taxi', 'aplicativo de transporte', 'uber', 'onibus', 'passagem', 'oficina', 'autopecas', 'auto pecas']],
  ['Educação', ['educacao', 'escola', 'curso', 'cursos', 'livraria', 'papelaria', 'faculdade']],
  ['Lazer', ['lazer', 'cinema', 'teatro', 'entretenimento', 'hotel', 'hospedagem', 'turismo', 'viagem', 'academia', 'esporte', 'esportes', 'artigos esportivos']],
  ['Serviços', ['servicos', 'servico', 'lavanderia', 'assinatura', 'telefonia', 'internet']],
  ['Loja', ['loja', 'lojas', 'varejo', 'magazine', 'loja de departamento', 'departamento', 'shopping', 'presentes', 'bazar']],
  ['Outros', ['outros', 'outro', 'geral', 'diversos', 'nao identificado']],
];

/**
 * Segmento canônico para o que a IA (ou o usuário) escreveu. Vazio → `fallback`.
 * Texto desconhecido também cai no `fallback`, para não criar filtro solto.
 */
export function normalizeMerchantSegment(raw: unknown, fallback: MerchantSegment = 'Outros'): MerchantSegment {
  const key = norm(raw);
  if (!key) return fallback;
  for (const seg of MERCHANT_SEGMENTS) if (norm(seg) === key) return seg;
  for (const [seg, words] of SEGMENT_SYNONYMS) if (words.includes(key)) return seg;
  // "Farmácia e Drogaria", "Supermercado Bom Preço"...: procura palavra a palavra.
  const tokens = key.split(/[^a-z0-9]+/).filter(Boolean);
  for (const [seg, words] of SEGMENT_SYNONYMS) {
    if (seg === 'Outros') continue;
    if (words.some(w => !w.includes(' ') && tokens.includes(w))) return seg;
  }
  return fallback;
}

/** Ordena segmentos na ordem da lista padrão (desconhecidos no fim, alfabético). */
export function sortSegments(segments: string[]): string[] {
  const idx = (s: string) => {
    const i = (MERCHANT_SEGMENTS as readonly string[]).indexOf(s);
    return i === -1 ? MERCHANT_SEGMENTS.length : i;
  };
  return Array.from(new Set(segments.filter(Boolean))).sort((a, b) => idx(a) - idx(b) || a.localeCompare(b, 'pt-BR'));
}

// ---------------------------------------------------------------------------
// Nomes
// ---------------------------------------------------------------------------

/** Qual nome mostrar: nome fantasia (padrão) ou razão social. */
export type MerchantNameDisplay = 'trade' | 'legal';

export const parseNameDisplay = (raw: unknown): MerchantNameDisplay => (raw === 'legal' ? 'legal' : 'trade');

export interface MerchantNames {
  /** Nome fantasia (como o cliente conhece a loja). */
  trade?: string | null;
  /** Razão social. */
  legal?: string | null;
}

const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Nome a exibir conforme a preferência; sem o preferido, usa o outro; sem nenhum, `fallback`. */
export function pickMerchantName(names: MerchantNames, display: MerchantNameDisplay, fallback = ''): string {
  const trade = clean(names.trade);
  const legal = clean(names.legal);
  const first = display === 'legal' ? legal : trade;
  const second = display === 'legal' ? trade : legal;
  return first || second || clean(fallback);
}

export const onlyDigits = (s: unknown) => String(s ?? '').replace(/\D/g, '');

/** "92665611066860" → "92.665.611/0668-60". Outro tamanho volta só com os dígitos (ou vazio). */
export function formatCnpj(raw: unknown): string {
  const d = onlyDigits(raw);
  if (d.length !== 14) return d.length >= 8 ? d : '';
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

// ---------------------------------------------------------------------------
// Lista de estabelecimentos (Configurações › Estabelecimentos)
// ---------------------------------------------------------------------------

export interface MerchantDoc {
  id?: string;
  merchant_raw?: string | null;
  document_date?: string | null;
  created_at?: string | null;
  ocr_structured?: Record<string, any> | null;
}

export interface Establishment {
  key: string;
  /** Nome a exibir, conforme a preferência do usuário. */
  name: string;
  tradeName: string;
  legalName: string;
  cnpj: string;
  segment: string;
  lastActive: string;
  count: number;
  docIds: string[];
}

/**
 * Mesmo estabelecimento = mesmo CNPJ (o nome varia de cupom para cupom);
 * sem CNPJ, mesmo nome (sem acento/maiúscula). Cupons antigos não têm os
 * campos novos: o nome que foi gravado (`merchant_raw`) vira o nome fantasia
 * e o segmento sem valor continua "Mercado", como era mostrado antes.
 */
export function groupEstablishments(docs: MerchantDoc[], display: MerchantNameDisplay): Establishment[] {
  const map = new Map<string, Establishment & { lastTouched: string }>();
  // Mais recente primeiro: os nomes/segmento do cupom mais novo prevalecem.
  const sorted = [...docs].sort((a, b) =>
    String(b.document_date || '').localeCompare(String(a.document_date || ''))
    || String(b.created_at || '').localeCompare(String(a.created_at || ''))
  );
  for (const d of sorted) {
    const ocr = d.ocr_structured || {};
    const trade = clean(ocr.merchant_trade_name) || clean(d.merchant_raw) || clean(ocr.merchant);
    const legal = clean(ocr.merchant_legal_name);
    const cnpj = onlyDigits(ocr.merchant_cnpj);
    const key = cnpj.length === 14 ? `cnpj:${cnpj}` : `name:${norm(trade || legal)}`;
    if (key === 'name:') continue;
    const date = String(d.document_date || '').slice(0, 10);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, {
        key,
        name: '',
        tradeName: trade,
        legalName: legal,
        cnpj: cnpj.length === 14 ? cnpj : '',
        segment: normalizeMerchantSegment(ocr.merchant_category, 'Mercado'),
        lastActive: date,
        count: 1,
        docIds: d.id ? [d.id] : [],
        lastTouched: date,
      });
    } else {
      prev.count++;
      if (d.id) prev.docIds.push(d.id);
      if (!prev.tradeName && trade) prev.tradeName = trade;
      if (!prev.legalName && legal) prev.legalName = legal;
      if (date > prev.lastActive) prev.lastActive = date;
    }
  }
  return [...map.values()]
    .map(({ lastTouched, ...e }) => ({ ...e, name: pickMerchantName({ trade: e.tradeName, legal: e.legalName }, display, e.tradeName || e.legalName) }))
    .sort((a, b) => b.lastActive.localeCompare(a.lastActive) || a.name.localeCompare(b.name, 'pt-BR'));
}

/** Texto para o prompt da IA: lista de segmentos aceitos. */
export const SEGMENT_PROMPT_LIST = MERCHANT_SEGMENTS.join(' | ');
