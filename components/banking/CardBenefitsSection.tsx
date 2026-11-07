import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Gift, Info, Pencil, Check, X, Scale, Sparkles, Trophy, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase/client';
import { getSessionUser } from '../../lib/session';
import { useToast } from '../../contexts/ToastContext';
import { FieldLabel } from '../common/HelpTip';
import {
  annualBenefit, breakEvenMonthlySpend, compare, grossRate, milheiroToMatchCashback, verdictFor,
  BENEFIT_TYPE_LABEL, VERDICT_LABEL, DEFAULT_USD_RATE, type CardBenefits, type BenefitType, type Verdict
} from '../../lib/cardBenefits';

// Cartões › Benefícios e Milhas.
// 1) Cada cartão ganha o cadastro do benefício (cashback, pontos ou milhas,
//    anuidade, isenção…) e a análise com o gasto real dos últimos 12 meses:
//    quanto devolve por ano, quanto custa e se compensa.
// 2) "Pontos ou cashback?": compara dois cartões/opções no mesmo gasto.
// 3) "Vale fazer este cartão?": testa uma oferta nova contra o seu melhor cartão.
// As contas ficam em lib/cardBenefits.ts. Cada campo tem um "?" explicando.

interface CardRow {
  id: string;
  name: string | null;
  brand: string | null;
  last4: string | null;
  is_additional: boolean | null;
  parent_card_id: string | null;
  sums_into_invoice: boolean | null;
  benefits?: CardBenefits | null;
}

const brl = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pctTxt = (x: number) => `${(x * 100).toFixed(2).replace('.', ',')}%`;
const num = (v: string) => {
  const s = String(v ?? '').trim();
  if (!s) return undefined;
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? n : undefined;
};
const str = (v: number | undefined) => (v === undefined || v === null ? '' : String(v).replace('.', ','));

const VERDICT_STYLE: Record<Verdict, string> = {
  COMPENSA: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  FRACO: 'bg-amber-50 text-amber-700 border-amber-200',
  NAO_COMPENSA: 'bg-rose-50 text-rose-700 border-rose-200',
  SEM_BENEFICIO: 'bg-slate-50 text-slate-500 border-slate-200'
};

// Textos de ajuda de cada campo (o "?").
export const HELP = {
  type: 'O que o cartão devolve. Cashback = dinheiro de volta (na fatura, na conta ou num investimento, como o Investback da XP). Pontos = programa do banco (Livelo, Esfera, Átomos…), que depois vira milhas ou produtos. Milhas = acumula direto na companhia aérea (Smiles, LATAM Pass, Azul). Sem benefício = não devolve nada.',
  cashbackPct: 'Quanto volta em dinheiro de cada compra, em %. Ex.: 1 = 1% (R$ 10 a cada R$ 1.000). Veja no app do banco ou no contrato do cartão.',
  cashbackCap: 'Alguns cartões limitam o cashback por mês (ex.: no máximo R$ 50/mês). Deixe vazio se não tiver teto.',
  pointsPerUnit: 'Quantos pontos/milhas você ganha a cada dólar (ou real) gasto. Ex.: "2,2 pontos por US$" → 2,2. Está no site do cartão ("pontuação").',
  pointsUnit: 'A maioria dos cartões pontua por dólar gasto (o banco converte sua compra em reais para dólar). Alguns pontuam por real.',
  usdRate: 'Cotação do dólar que o banco usa para converter o gasto em pontos. Se não souber, use a cotação do dia (o padrão é R$ 5,30).',
  program: 'Nome do programa de pontos ou milhas (ex.: Livelo, Esfera, Smiles, LATAM Pass). Só para você identificar.',
  milheiroValue: 'Quanto valem 1.000 pontos/milhas PARA VOCÊ, em reais, no jeito que você costuma usar. Referência: vender milhas paga ~R$ 15–25 o milheiro; trocar por produtos costuma valer menos (~R$ 5–10); passagens bem compradas podem passar de R$ 30. Na dúvida, use R$ 15.',
  transferBonus: 'Bônus quando você transfere os pontos do banco para a companhia aérea em promoção (ex.: +80% → 80). Se você não costuma esperar promoções, deixe 0.',
  usageRate: 'Quanto dos pontos você realmente usa antes de vencer. Se metade expira, use 50. Pontos que vencem valem zero — isso pesa muito na conta.',
  annualFee: 'Valor da anuidade por ANO (se for mensal, multiplique por 12). Deixe 0 se o cartão não cobra ou se você já conseguiu isenção total.',
  feeWaiver: 'Gasto por mês que isenta a anuidade (ex.: "isento gastando R$ 5.000/mês" → 5000). Deixe vazio se não houver isenção por gasto.',
  expiry: 'Em quantos meses os pontos vencem. Serve para lembrar de usar antes de perder.',
  destination: 'Para onde vai o cashback: abate na própria fatura, cai numa conta, ou é aplicado num investimento (ex.: Investback da XP vai para um fundo).',
  monthlySpend: 'Quanto você gasta por mês no cartão. Já vem preenchido com a média dos seus últimos 12 meses neste cartão (incluindo adicionais que somam na fatura); pode mudar para simular.'
};

/**
 * Campo numérico que aceita vírgula enquanto a pessoa digita ("2," não vira "2").
 * Guarda o texto digitado e só repassa o número; se o valor mudar por fora
 * (ex.: trocar de cartão), o texto acompanha.
 */
const NumInput: React.FC<{ value: number | undefined; onChange: (v: number | undefined) => void; placeholder?: string; className?: string; inputMode?: 'decimal' | 'numeric' }> = ({ value, onChange, placeholder, className, inputMode = 'decimal' }) => {
  const [text, setText] = useState(str(value));
  useEffect(() => {
    if (num(text) !== value) setText(str(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      inputMode={inputMode}
      className={className}
      value={text}
      placeholder={placeholder}
      onChange={e => { setText(e.target.value); onChange(num(e.target.value)); }}
    />
  );
};

const emptyBenefits = (): CardBenefits => ({ type: 'NONE', pointsUnit: 'USD', usdRate: DEFAULT_USD_RATE, usageRatePct: 100 });

/** Formulário do benefício (usado no cadastro do cartão e nos simuladores). */
const BenefitForm: React.FC<{ value: CardBenefits; onChange: (b: CardBenefits) => void; compact?: boolean }> = ({ value, onChange, compact }) => {
  const set = (patch: Partial<CardBenefits>) => onChange({ ...value, ...patch });
  const isPoints = value.type === 'PONTOS' || value.type === 'MILHAS';
  const input = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white';
  return (
    <div className={`grid grid-cols-1 ${compact ? '' : 'sm:grid-cols-2'} gap-3`}>
      <div className={compact ? '' : 'sm:col-span-2'}>
        <FieldLabel label="Tipo de benefício" help={HELP.type} />
        <div className="flex flex-wrap gap-1.5">
          {(['CASHBACK', 'PONTOS', 'MILHAS', 'NONE'] as BenefitType[]).map(t => (
            <button key={t} type="button" onClick={() => set({ type: t })}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${value.type === t ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200'}`}>
              {BENEFIT_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      {value.type === 'CASHBACK' && (
        <>
          <div>
            <FieldLabel label="Cashback (%)" help={HELP.cashbackPct} />
            <NumInput inputMode="decimal" className={input} value={value.cashbackPct} onChange={v => set({ cashbackPct: v })} placeholder="ex.: 1" />
          </div>
          <div>
            <FieldLabel label="Teto por mês (R$)" help={HELP.cashbackCap} />
            <NumInput inputMode="decimal" className={input} value={value.cashbackCapMonthly} onChange={v => set({ cashbackCapMonthly: v })} placeholder="sem teto" />
          </div>
          <div className={compact ? '' : 'sm:col-span-2'}>
            <FieldLabel label="Para onde vai o cashback" help={HELP.destination} />
            <select className={input} value={value.destination || 'FATURA'} onChange={e => set({ destination: e.target.value as CardBenefits['destination'] })}>
              <option value="FATURA">Abate na fatura</option>
              <option value="CONTA">Cai numa conta</option>
              <option value="INVESTIMENTO">Vai para um investimento</option>
            </select>
          </div>
        </>
      )}

      {isPoints && (
        <>
          <div>
            <FieldLabel label={value.type === 'MILHAS' ? 'Milhas por unidade gasta' : 'Pontos por unidade gasta'} help={HELP.pointsPerUnit} />
            <NumInput inputMode="decimal" className={input} value={value.pointsPerUnit} onChange={v => set({ pointsPerUnit: v })} placeholder="ex.: 2,2" />
          </div>
          <div>
            <FieldLabel label="Pontua por" help={HELP.pointsUnit} />
            <select className={input} value={value.pointsUnit || 'USD'} onChange={e => set({ pointsUnit: e.target.value as 'USD' | 'BRL' })}>
              <option value="USD">Dólar gasto (US$)</option>
              <option value="BRL">Real gasto (R$)</option>
            </select>
          </div>
          {(value.pointsUnit || 'USD') === 'USD' && (
            <div>
              <FieldLabel label="Cotação do dólar (R$)" help={HELP.usdRate} />
              <NumInput inputMode="decimal" className={input} value={value.usdRate} onChange={v => set({ usdRate: v })} placeholder="5,30" />
            </div>
          )}
          <div>
            <FieldLabel label="Programa" help={HELP.program} />
            <input className={input} value={value.program || ''} onChange={e => set({ program: e.target.value })} placeholder="ex.: Livelo" />
          </div>
          <div>
            <FieldLabel label="Valor do milheiro (R$)" help={HELP.milheiroValue} />
            <NumInput inputMode="decimal" className={input} value={value.milheiroValue} onChange={v => set({ milheiroValue: v })} placeholder="ex.: 15" />
          </div>
          <div>
            <FieldLabel label="Bônus de transferência (%)" help={HELP.transferBonus} />
            <NumInput inputMode="decimal" className={input} value={value.transferBonusPct} onChange={v => set({ transferBonusPct: v })} placeholder="0" />
          </div>
          <div>
            <FieldLabel label="Quanto dos pontos você usa (%)" help={HELP.usageRate} />
            <NumInput inputMode="decimal" className={input} value={value.usageRatePct} onChange={v => set({ usageRatePct: v })} placeholder="100" />
          </div>
          <div>
            <FieldLabel label="Validade dos pontos (meses)" help={HELP.expiry} />
            <NumInput inputMode="numeric" className={input} value={value.pointsExpiryMonths} onChange={v => set({ pointsExpiryMonths: v })} placeholder="ex.: 24" />
          </div>
        </>
      )}

      <div>
        <FieldLabel label="Anuidade por ano (R$)" help={HELP.annualFee} />
        <NumInput inputMode="decimal" className={input} value={value.annualFee} onChange={v => set({ annualFee: v })} placeholder="0" />
      </div>
      <div>
        <FieldLabel label="Isenta gastando por mês (R$)" help={HELP.feeWaiver} />
        <NumInput inputMode="decimal" className={input} value={value.feeWaiverMinMonthlySpend} onChange={v => set({ feeWaiverMinMonthlySpend: v })} placeholder="sem isenção" />
      </div>
    </div>
  );
};

/** Bloco de resultado de um cartão num gasto. */
const ResultBox: React.FC<{ title: string; b: CardBenefits; monthlySpend: number; highlight?: boolean }> = ({ title, b, monthlySpend, highlight }) => {
  const r = annualBenefit(monthlySpend, b);
  const v = verdictFor(r, b);
  return (
    <div className={`p-4 rounded-2xl border ${highlight ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-100 bg-white'} space-y-1.5`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-black text-slate-800">{title}</p>
        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-black uppercase ${VERDICT_STYLE[v.verdict]}`}>{VERDICT_LABEL[v.verdict]}</span>
      </div>
      <p className="text-xs text-slate-500">Devolve por ano: <strong className="text-slate-800">{brl(r.gross)}</strong>{r.pointsYear ? ` (${r.pointsYear.toLocaleString('pt-BR')} pontos)` : ''}</p>
      <p className="text-xs text-slate-500">Anuidade: <strong className="text-slate-800">{r.feeWaived ? 'isenta pelo gasto' : brl(r.fee)}</strong></p>
      <p className="text-xs text-slate-500">Sobra no ano: <strong className={r.net >= 0 ? 'text-emerald-700' : 'text-rose-600'}>{brl(r.net)}</strong> · retorno {pctTxt(r.effectivePct)}</p>
      <p className="text-[11px] text-slate-500 leading-relaxed">{v.text}</p>
    </div>
  );
};

const CardBenefitsSection: React.FC = () => {
  const { toast } = useToast();
  const [cards, setCards] = useState<CardRow[]>([]);
  const [spend12m, setSpend12m] = useState<Record<string, { total: number; months: number }>>({});
  const [loading, setLoading] = useState(true);
  const [columnMissing, setColumnMissing] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<CardBenefits>(emptyBenefits());
  const [saving, setSaving] = useState(false);
  const [showHow, setShowHow] = useState(false);

  // Simulador 1: pontos ou cashback
  const [simSpend, setSimSpend] = useState('5000');
  const [simA, setSimA] = useState<CardBenefits>({ type: 'CASHBACK', cashbackPct: 1 });
  const [simB, setSimB] = useState<CardBenefits>({ type: 'PONTOS', pointsPerUnit: 2.2, pointsUnit: 'USD', usdRate: DEFAULT_USD_RATE, milheiroValue: 15, usageRatePct: 100 });

  // Simulador 2: vale fazer este cartão?
  const [offer, setOffer] = useState<CardBenefits>({ type: 'PONTOS', pointsPerUnit: 3, pointsUnit: 'USD', usdRate: DEFAULT_USD_RATE, milheiroValue: 15, usageRatePct: 100, annualFee: 1200 });
  const [offerSpend, setOfferSpend] = useState('');

  const load = useCallback(async () => {
    if (!supabase) return;
    const user = await getSessionUser(supabase);
    if (!user) return;
    let res: any = await supabase.from('cards').select('id, name, brand, last4, is_additional, parent_card_id, sums_into_invoice, benefits').eq('user_id', user.id).eq('is_archived', false);
    if (res.error && /benefits/.test(res.error.message || '')) {
      setColumnMissing(true);
      res = await supabase.from('cards').select('id, name, brand, last4, is_additional, parent_card_id, sums_into_invoice').eq('user_id', user.id).eq('is_archived', false);
    }
    const list = (res.data || []) as CardRow[];
    setCards(list);

    const since = new Date();
    since.setMonth(since.getMonth() - 12);
    const { data: txs } = await supabase
      .from('card_transactions')
      .select('card_id, amount, date')
      .eq('user_id', user.id)
      .gte('date', since.toISOString().slice(0, 10));
    // Adicional que soma na fatura conta no gasto do titular.
    const parentOf = new Map(list.filter(c => c.is_additional && c.parent_card_id && c.sums_into_invoice !== false).map(c => [c.id, c.parent_card_id as string]));
    const agg: Record<string, { total: number; monthsSet: Set<string> }> = {};
    for (const t of txs || []) {
      const id = parentOf.get(t.card_id) || t.card_id;
      const amt = Number(t.amount) || 0;
      if (!agg[id]) agg[id] = { total: 0, monthsSet: new Set() };
      agg[id].total += amt;
      if (t.date) agg[id].monthsSet.add(String(t.date).slice(0, 7));
    }
    setSpend12m(Object.fromEntries(Object.entries(agg).map(([k, v]) => [k, { total: v.total, months: Math.max(1, v.monthsSet.size) }])));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const mainCards = useMemo(() => cards.filter(c => !(c.is_additional && c.parent_card_id && c.sums_into_invoice !== false)), [cards]);
  const monthlyAvg = (id: string) => {
    const s = spend12m[id];
    return s ? Math.max(0, s.total / s.months) : 0;
  };
  const cardLabel = (c: CardRow) => `${c.name || c.brand || 'Cartão'}${c.last4 ? ` •${c.last4}` : ''}`;

  const configured = mainCards.filter(c => c.benefits && c.benefits.type);
  const ranking = useMemo(() => [...configured]
    .map(c => ({ card: c, rate: grossRate(c.benefits as CardBenefits) }))
    .filter(x => x.rate > 0)
    .sort((a, b) => b.rate - a.rate), [configured]);
  const best = ranking[0];

  const totalMonthly = mainCards.reduce((s, c) => s + monthlyAvg(c.id), 0);
  const offerSpendValue = num(offerSpend) ?? Math.round(totalMonthly);

  const save = async (card: CardRow) => {
    if (!supabase) return;
    if (columnMissing) {
      toast('O cadastro de benefícios ainda está sendo ativado no banco de dados. Tente de novo em instantes.', 'warning');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('cards').update({ benefits: draft }).eq('id', card.id);
    setSaving(false);
    if (error) {
      toast(`Não foi possível salvar: ${error.message}`, 'error');
      return;
    }
    setEditing(null);
    toast('Benefício salvo.', 'success');
    load();
  };

  if (loading) {
    return <div className="py-16 flex justify-center text-slate-400"><Loader2 className="animate-spin" /></div>;
  }

  const simSpendValue = num(simSpend) ?? 0;
  const cmp = compare(simSpendValue, simA, simB);
  const matchMilheiro = simB.type === 'PONTOS' || simB.type === 'MILHAS'
    ? milheiroToMatchCashback(simB, simA.type === 'CASHBACK' ? Number(simA.cashbackPct || 0) : grossRate(simA) * 100)
    : null;

  const offerResult = annualBenefit(offerSpendValue, offer);
  const bestOnSameSpend = best ? annualBenefit(offerSpendValue, best.card.benefits as CardBenefits) : null;
  const offerGain = bestOnSameSpend ? Math.round((offerResult.net - bestOnSameSpend.net) * 100) / 100 : offerResult.net;
  const offerBreakEven = breakEvenMonthlySpend(offer);

  return (
    <div className="space-y-8">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center"><Gift size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Benefícios e Milhas</h1>
            <p className="text-sm text-slate-400 font-medium">Quanto cada cartão te devolve de verdade — e se vale a pena.</p>
          </div>
        </div>
        <button onClick={() => setShowHow(v => !v)} className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-50 text-slate-600 border border-slate-100 flex items-center gap-1.5">
          <Info size={14} /> Como funciona
        </button>
      </div>

      {showHow && (
        <div className="p-5 rounded-3xl bg-slate-50 border border-slate-100 text-sm text-slate-600 leading-relaxed space-y-2">
          <p><strong className="text-slate-800">1. Cadastre o benefício de cada cartão</strong> (toque em "Configurar"). Cada campo tem um <strong>?</strong> explicando o que colocar.</p>
          <p><strong className="text-slate-800">2. O app usa o seu gasto real</strong> dos últimos 12 meses em cada cartão (adicionais que somam na fatura entram no titular) para calcular quanto o cartão devolve por ano, quanto custa de anuidade e o <strong>retorno líquido</strong> (% do gasto que volta para você).</p>
          <p><strong className="text-slate-800">3. Pontos viram reais</strong> pelo valor do milheiro que você informar, com o bônus de transferência e descontando os pontos que você deixa vencer. Assim dá para comparar pontos com cashback na mesma régua.</p>
          <p><strong className="text-slate-800">4. Qual cartão usar:</strong> para cada compra nova, use o cartão com <strong>maior retorno por real gasto</strong> (a anuidade você paga de qualquer jeito). Para decidir <strong>manter ou cancelar</strong> um cartão, olhe a sobra no ano já descontada a anuidade.</p>
          <p><strong className="text-slate-800">5. Simuladores:</strong> "Pontos ou cashback?" compara duas opções no mesmo gasto; "Vale fazer este cartão?" testa uma oferta nova contra o seu melhor cartão atual.</p>
        </div>
      )}

      {columnMissing && (
        <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800 font-medium">
          O cadastro de benefícios ainda está sendo ativado no banco de dados. Os simuladores já funcionam; salvar o benefício de cada cartão volta a funcionar assim que a atualização for aplicada.
        </div>
      )}

      {/* Seus cartões */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-slate-900">Seus cartões</h2>
        </div>
        {best && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-start gap-3">
            <Trophy size={18} className="shrink-0 mt-0.5" />
            <p><strong>Use primeiro o {cardLabel(best.card)}</strong>: devolve {pctTxt(best.rate)} de cada compra.{ranking.length > 1 ? ` Depois: ${ranking.slice(1).map(x => `${cardLabel(x.card)} (${pctTxt(x.rate)})`).join(', ')}.` : ''}</p>
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {mainCards.map(card => {
            const avg = monthlyAvg(card.id);
            const b = card.benefits as CardBenefits | null | undefined;
            const isEditing = editing === card.id;
            return (
              <div key={card.id} className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-900 truncate">{cardLabel(card)}</p>
                    <p className="text-[11px] text-slate-500">Gasto médio: <strong>{brl(avg)}/mês</strong> (últimos 12 meses)</p>
                  </div>
                  {!isEditing && (
                    <button onClick={() => { setEditing(card.id); setDraft({ ...emptyBenefits(), ...(b || {}) }); }} className="shrink-0 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100 text-xs font-bold text-slate-600 flex items-center gap-1">
                      <Pencil size={12} /> {b ? 'Editar' : 'Configurar'}
                    </button>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-3">
                    <BenefitForm value={draft} onChange={setDraft} />
                    {draft.type !== 'NONE' && <ResultBox title="Prévia com o seu gasto" b={draft} monthlySpend={avg} />}
                    <div className="flex gap-2">
                      <button disabled={saving} onClick={() => save(card)} className="px-4 py-2 rounded-xl bg-brand-600 text-white text-xs font-bold flex items-center gap-1 disabled:opacity-50"><Check size={14} /> Salvar</button>
                      <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold flex items-center gap-1"><X size={14} /> Cancelar</button>
                    </div>
                  </div>
                ) : b ? (
                  <ResultBox title={`${BENEFIT_TYPE_LABEL[b.type]}${b.program ? ` · ${b.program}` : ''}`} b={b} monthlySpend={avg} />
                ) : (
                  <p className="text-xs text-slate-500">Benefício ainda não cadastrado. Toque em "Configurar" para saber quanto este cartão te devolve.</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Simulador 1 */}
      <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 sm:p-7 space-y-4">
        <div className="flex items-center gap-2">
          <Scale size={18} className="text-brand-600" />
          <h2 className="text-lg font-bold text-slate-900">Pontos ou cashback?</h2>
        </div>
        <p className="text-sm text-slate-500">Compare duas opções no mesmo gasto. Ex.: o mesmo cartão com cashback ou com pontos, ou dois cartões diferentes.</p>
        <div className="max-w-xs">
          <FieldLabel label="Gasto por mês (R$)" help={HELP.monthlySpend} />
          <input inputMode="decimal" value={simSpend} onChange={e => setSimSpend(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-3">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Opção A</p>
            <BenefitForm value={simA} onChange={setSimA} compact />
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-3">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Opção B</p>
            <BenefitForm value={simB} onChange={setSimB} compact />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ResultBox title="Opção A" b={simA} monthlySpend={simSpendValue} highlight={cmp.winner === 'A'} />
          <ResultBox title="Opção B" b={simB} monthlySpend={simSpendValue} highlight={cmp.winner === 'B'} />
        </div>
        <div className="p-4 rounded-2xl bg-brand-50 border border-brand-100 text-sm text-brand-900 flex gap-3">
          <Sparkles size={18} className="shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p>
              {cmp.winner === 'EMPATE'
                ? 'As duas opções dão praticamente o mesmo resultado nesse gasto.'
                : <><strong>A opção {cmp.winner} rende {brl(cmp.difference)} a mais por ano</strong> gastando {brl(simSpendValue)} por mês.</>}
            </p>
            {matchMilheiro !== null && (
              <p className="text-xs">Para os pontos da opção B empatarem com a opção A, cada 1.000 pontos precisa valer pelo menos <strong>{brl(matchMilheiro)}</strong> para você (sem contar anuidade).</p>
            )}
          </div>
        </div>
      </section>

      {/* Simulador 2 */}
      <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 sm:p-7 space-y-4">
        <div className="flex items-center gap-2">
          <Gift size={18} className="text-brand-600" />
          <h2 className="text-lg font-bold text-slate-900">Vale fazer este cartão?</h2>
        </div>
        <p className="text-sm text-slate-500">
          Coloque os dados da oferta (do site do banco ou do que o gerente falou). O app compara com {best ? <>o seu melhor cartão hoje (<strong>{cardLabel(best.card)}</strong>)</> : 'não ter o cartão (cadastre os benefícios dos seus cartões para comparar com eles)'} no mesmo gasto.
        </p>
        <div className="max-w-xs">
          <FieldLabel label="Quanto você passaria a gastar nele (R$/mês)" help="Quanto do seu gasto mensal iria para o cartão novo. Vem preenchido com o seu gasto total nos cartões (média de 12 meses)." />
          <input inputMode="decimal" value={offerSpend} onChange={e => setOfferSpend(e.target.value)} placeholder={String(Math.round(totalMonthly))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
        </div>
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
          <BenefitForm value={offer} onChange={setOffer} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ResultBox title="Cartão novo" b={offer} monthlySpend={offerSpendValue} highlight={offerGain > 0} />
          {best && <ResultBox title={`Seu melhor hoje: ${cardLabel(best.card)}`} b={best.card.benefits as CardBenefits} monthlySpend={offerSpendValue} highlight={offerGain <= 0} />}
        </div>
        <div className={`p-4 rounded-2xl border text-sm flex gap-3 ${offerGain > 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
          <Sparkles size={18} className="shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p>
              {offerGain > 0
                ? <><strong>Vale a pena:</strong> rende {brl(offerGain)} a mais por ano {best ? 'do que o seu melhor cartão' : ''}, já descontada a anuidade.</>
                : <><strong>Não vale a pena:</strong> {best ? `rende ${brl(Math.abs(offerGain))} a menos por ano do que o seu melhor cartão` : 'a anuidade é maior do que o benefício'} nesse gasto.</>}
            </p>
            {offerBreakEven !== null && offerBreakEven > 0 && (
              <p className="text-xs">A anuidade só se paga gastando a partir de <strong>{brl(offerBreakEven)}/mês</strong> nele.</p>
            )}
            {offerBreakEven === null && Number(offer.annualFee) > 0 && (
              <p className="text-xs">Sem benefício, a anuidade nunca se paga.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default CardBenefitsSection;
