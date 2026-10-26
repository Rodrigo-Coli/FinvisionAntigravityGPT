import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calculator, Gavel, BadgeCheck, Landmark, HandCoins, Info, CheckCircle2, AlertTriangle, XCircle, ChevronDown,
  Layers, Plus, Copy, Trash2
} from 'lucide-react';
import { supabase } from '../../lib/supabase/client';
import { getSessionUser } from '../../lib/session';
import { DateUtils } from '../../lib/dateUtils';
import { DateInput } from '../common/DateInput';
import { sanitizeMoneyTyping, parseMoneyInput } from '../../lib/moneyInput';
import {
  simulatePlan, simulateFinancing, evaluateBid, evaluateContemplatedQuota, evaluatePayoff,
  evaluateSale, targetSalePrice, lotteryOdds, bidChance, baseInstallmentValue, installmentsToPct,
  monthlyToAnnualPct, existingQuotaPlan, aggregatePlans, BidMode, AmortizationSystem, PlanResult, SaleFlow, PlanInput
} from '../../lib/consortiumSimulator';

/**
 * Simulador de consórcio (Planejamento). Só calcula — não grava nada.
 * O motor está em lib/consortiumSimulator.ts (testado em
 * tests/consortiumSimulator.test.ts); aqui ficam os campos, o pré-preenchimento
 * com os consórcios e financiamentos cadastrados e a leitura dos resultados.
 */

type SimTab = 'plan' | 'bid' | 'portfolio' | 'contemplated' | 'payoff' | 'sale';
type BidUnit = 'PCT' | 'BRL' | 'INST';

// Referências de out/2026 (ver "Referências de mercado" na tela).
const DEFAULT_CDI = 13.65;
const DEFAULT_OPPORTUNITY = '11,6';   // CDI 13,65% − IR de 15%
const DEFAULT_INDEX = '6,66';         // INCC 12 meses (set/2026)

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number.isFinite(v) ? v : 0);
const fmtPct = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v.toFixed(digits).replace('.', ',')}%`;
const fmtNum = (v: number, digits = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const num = (s: string) => parseMoneyInput(s);
/** AAAA-MM-DD + n meses (dia limitado ao fim do mês). */
const addMonthsIso = (iso: string, n: number) => {
  const [y, m, d] = (iso || DateUtils.formatToISODate()).split('-').map(Number);
  const total = (m - 1) + n;
  const year = y + Math.floor(total / 12), month = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
};
const toText = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined || !Number.isFinite(Number(v)) ? '' : Number(v).toFixed(digits).replace('.', ',').replace(/,00$/, '');

interface ConsortiumRow {
  id: string; name: string; liability_id: string | null; credit_letter_value: number; total_months: number;
  admin_fee_pct: number; reserve_fund_pct: number; insurance_monthly_amount: number; status: string; metadata: any;
}
interface FinancingRow {
  id: string; name: string; remaining_balance: number; installment_amount: number; installments_remaining: number;
  interest_rate: number | null; metadata: any;
}

// ─── Peças de interface ─────────────────────────────────────────────────────
const inputCls = 'w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-brand-500 transition-all';
const labelCls = 'block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5';

const Field: React.FC<{
  label: string; value: string; onChange: (v: string) => void; suffix?: string; hint?: string; integer?: boolean; placeholder?: string;
}> = ({ label, value, onChange, suffix, hint, integer, placeholder }) => (
  <div>
    <label className={labelCls}>{label}</label>
    <div className="relative">
      <input
        className={`${inputCls} ${suffix ? 'pr-14' : ''}`}
        inputMode={integer ? 'numeric' : 'decimal'}
        value={value}
        placeholder={placeholder || '0'}
        onChange={e => onChange(integer ? e.target.value.replace(/\D/g, '') : sanitizeMoneyTyping(e.target.value))}
      />
      {suffix && <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400 pointer-events-none">{suffix}</span>}
    </div>
    {hint && <p className="text-[10px] text-slate-400 mt-1 leading-snug">{hint}</p>}
  </div>
);

const Seg: React.FC<{ options: { value: string; label: string }[]; value: string; onChange: (v: any) => void }> = ({ options, value, onChange }) => (
  <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
    {options.map(o => (
      <button key={o.value} type="button" onClick={() => onChange(o.value)}
        className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all ${value === o.value ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
        {o.label}
      </button>
    ))}
  </div>
);

const Stat: React.FC<{ label: string; value: string; sub?: string; strong?: boolean }> = ({ label, value, sub, strong }) => (
  <div className={`rounded-2xl border p-3.5 ${strong ? 'bg-brand-50 border-brand-100' : 'bg-white border-slate-100'}`}>
    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
    <p className={`font-black mt-0.5 ${strong ? 'text-brand-900 text-lg' : 'text-slate-900 text-base'}`}>{value}</p>
    {sub && <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{sub}</p>}
  </div>
);

type Tone = 'good' | 'warn' | 'bad' | 'info';
const Verdict: React.FC<{ tone: Tone; title: string; children?: React.ReactNode }> = ({ tone, title, children }) => {
  const cfg = {
    good: { cls: 'bg-emerald-50 border-emerald-200 text-emerald-800', icon: <CheckCircle2 size={18} className="text-emerald-600 shrink-0" /> },
    warn: { cls: 'bg-amber-50 border-amber-200 text-amber-800', icon: <AlertTriangle size={18} className="text-amber-600 shrink-0" /> },
    bad: { cls: 'bg-rose-50 border-rose-200 text-rose-800', icon: <XCircle size={18} className="text-rose-600 shrink-0" /> },
    info: { cls: 'bg-slate-50 border-slate-200 text-slate-700', icon: <Info size={18} className="text-slate-500 shrink-0" /> }
  }[tone];
  return (
    <div className={`flex gap-3 p-4 rounded-2xl border ${cfg.cls}`}>
      {cfg.icon}
      <div className="space-y-1">
        <p className="text-sm font-black">{title}</p>
        {children && <div className="text-xs leading-relaxed">{children}</div>}
      </div>
    </div>
  );
};

const Card: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className }) => (
  <div className={`bg-white border border-slate-100 rounded-[24px] p-5 space-y-4 shadow-sm ${className || ''}`}>
    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">{title}</p>
    {children}
  </div>
);

// ─── Gráfico: parcela mês a mês (uma série) ─────────────────────────────────
interface StepPoint { value: number; lines: React.ReactNode }

/** Degraus mês a mês (uma série), com marcas verticais e dica ao passar o dedo/mouse. */
const StepChart: React.FC<{ title: string; points: StepPoint[]; markers: { month: number; label: string }[] }> = ({ title, points, markers }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  if (!points.length) return null;
  const values = points.map(p => p.value);
  const max = Math.max(...values) * 1.1 || 1;
  const W = 600, H = 160;
  const y = (v: number) => H - (v / max) * H;
  let d = '';
  values.forEach((v, i) => {
    const x0 = (i / points.length) * W, x1 = ((i + 1) / points.length) * W;
    d += `${i === 0 ? 'M' : 'L'}${x0.toFixed(2)},${y(v).toFixed(2)} L${x1.toFixed(2)},${y(v).toFixed(2)} `;
  });
  const xOf = (month: number) => ((month - 0.5) / points.length) * W;
  const onMove = (e: React.MouseEvent | React.TouchEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]?.clientX : (e as React.MouseEvent).clientX;
    if (clientX === undefined) return;
    setHover(Math.min(points.length - 1, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * points.length))));
  };
  const visibleMarkers = markers.filter(m => m.month >= 1 && m.month <= points.length);
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-[10px] text-slate-400 font-bold gap-3">
        <span>{title}</span>
        <span className="whitespace-nowrap">máx. {fmt(max / 1.1)}</span>
      </div>
      <div ref={ref} className="relative h-40 select-none touch-none" onMouseMove={onMove} onMouseLeave={() => setHover(null)} onTouchStart={onMove} onTouchMove={onMove} onTouchEnd={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
          {[0.25, 0.5, 0.75].map(f => <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} stroke="currentColor" className="text-slate-100" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
          <line x1={0} x2={W} y1={H} y2={H} stroke="currentColor" className="text-slate-200" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {visibleMarkers.map((m, i) => <line key={i} x1={xOf(m.month)} x2={xOf(m.month)} y1={0} y2={H} stroke="currentColor" className="text-amber-500" strokeWidth={1.5} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />)}
          <path d={d} fill="none" stroke="currentColor" className="text-brand-600" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          {hover !== null && <line x1={((hover + 0.5) / points.length) * W} x2={((hover + 0.5) / points.length) * W} y1={0} y2={H} stroke="currentColor" className="text-slate-400" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        </svg>
        {visibleMarkers.slice(0, 1).map((m, i) => (
          <span key={i} className="absolute -top-1 text-[9px] font-black text-amber-600 bg-white/90 px-1 rounded" style={{ left: `calc(${(xOf(m.month) / W) * 100}% + 4px)` }}>{m.label}</span>
        ))}
        {hover !== null && (
          <div className="absolute top-2 z-10 pointer-events-none bg-slate-900 text-white rounded-xl px-3 py-2 text-[11px] shadow-lg"
            style={{ left: `${Math.min(70, Math.max(0, ((hover + 0.5) / points.length) * 100 - 10))}%` }}>
            {points[hover].lines}
          </div>
        )}
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 font-bold">
        <span>mês 1</span><span>mês {points.length}</span>
      </div>
    </div>
  );
};

const InstallmentChart: React.FC<{ plan: PlanResult }> = ({ plan }) => (
  <StepChart
    title="Parcela por mês (com seguro e reajuste estimado)"
    markers={[{ month: plan.contemplationMonth, label: 'contemplação' }]}
    points={plan.rows.map(h => ({
      value: h.installment + h.insurance,
      lines: (
        <>
          <p className="font-black">Mês {h.month}{h.phase === 'pre' ? ' · antes de contemplar' : ' · depois'}</p>
          <p>Parcela: <strong>{fmt(h.installment + h.insurance)}</strong>{h.insurance > 0 && <> (seguro {fmt(h.insurance)})</>}</p>
          {h.bidCash > 0 && <p>Lance do bolso: <strong>{fmt(h.bidCash)}</strong></p>}
          <p>Saldo devedor: {fmt(h.balance)}</p>
        </>
      )
    }))}
  />
);

// ─── Várias cotas ───────────────────────────────────────────────────────────
interface QuotaDraft {
  key: string;
  name: string;
  source: string;          // '' = cota nova; senão id do consórcio cadastrado
  credit: string; term: string; adm: string; fr: string; reduced: string;
  balance: string; remaining: string; installment: string;
  unit: BidUnit; baseTerm: string; free: string; emb: string;
  month: string; mode: BidMode;
}

const PORTFOLIO_KEY = 'finvision_consortium_sim_portfolio';
const newKey = () => Math.random().toString(36).slice(2, 10);
const blankQuota = (n: number): QuotaDraft => ({
  key: newKey(), name: `Cota ${n}`, source: '',
  credit: '200.000', term: '200', adm: '18', fr: '2', reduced: '100',
  balance: '', remaining: '', installment: '',
  unit: 'PCT', baseTerm: '240', free: '0', emb: '0', month: '1', mode: 'REDUCE_INSTALLMENT'
});

function draftToPlan(q: QuotaDraft, shared: { index: number; insurance: number }): PlanInput {
  const credit = num(q.credit);
  const planPct = 100 + num(q.adm) + num(q.fr);
  const toPct = (txt: string) => {
    const v = num(txt);
    if (q.unit === 'BRL') return credit > 0 ? (v / credit) * 100 : 0;
    if (q.unit === 'INST') return installmentsToPct(v, planPct, num(q.baseTerm));
    return v;
  };
  const base = q.source
    ? { ...existingQuotaPlan({ credit, balance: num(q.balance), remainingMonths: num(q.remaining), currentInstallment: num(q.installment) }), reserveFundPct: 0, reducedPct: 100 }
    : { credit, termMonths: num(q.term), adminFeePct: num(q.adm), reserveFundPct: num(q.fr), reducedPct: num(q.reduced) || 100 };
  return {
    ...base, annualIndexPct: shared.index, insuranceMonthlyPct: shared.insurance,
    contemplationMonth: num(q.month) || 1, freeBidPct: toPct(q.free), embeddedBidPct: toPct(q.emb), bidMode: q.mode
  };
}

const PortfolioTab: React.FC<{
  consortiums: ConsortiumRow[];
  consLiabs: Record<string, FinancingRow>;
  index: string; insurance: string; opportunity: string;
  setIndex: (v: string) => void; setInsurance: (v: string) => void; setOpportunity: (v: string) => void;
}> = ({ consortiums, consLiabs, index, insurance, opportunity, setIndex, setInsurance, setOpportunity }) => {
  const [quotas, setQuotas] = useState<QuotaDraft[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PORTFOLIO_KEY) || 'null');
      if (Array.isArray(saved) && saved.length) return saved;
    } catch { /* rascunho é opcional */ }
    return [blankQuota(1)];
  });
  useEffect(() => {
    try { localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(quotas)); } catch { /* rascunho é opcional */ }
  }, [quotas]);

  const update = (key: string, patch: Partial<QuotaDraft>) => setQuotas(list => list.map(q => q.key === key ? { ...q, ...patch } : q));
  const remove = (key: string) => setQuotas(list => list.length > 1 ? list.filter(q => q.key !== key) : list);
  const duplicate = (key: string) => setQuotas(list => {
    const i = list.findIndex(q => q.key === key);
    if (i < 0) return list;
    const copy = { ...list[i], key: newKey(), name: `${list[i].name} (cópia)` };
    return [...list.slice(0, i + 1), copy, ...list.slice(i + 1)];
  });
  const add = () => setQuotas(list => [...list, blankQuota(list.length + 1)]);
  const chooseSource = (key: string, id: string) => {
    const c = consortiums.find(x => x.id === id);
    if (!c) { update(key, { source: '' }); return; }
    const l = c.liability_id ? consLiabs[c.liability_id] : undefined;
    update(key, {
      source: id, name: c.name,
      credit: toText(Number(c.credit_letter_value)), term: String(c.total_months || ''),
      adm: toText(Number(c.admin_fee_pct)), fr: toText(Number(c.reserve_fund_pct)),
      balance: l ? toText(Number(l.remaining_balance)) : '', remaining: l ? String(l.installments_remaining || '') : '',
      installment: l ? toText(Number(l.installment_amount)) : ''
    });
  };

  const shared = { index: num(index), insurance: num(insurance) };
  const results = useMemo(() => quotas.map(q => simulatePlan(draftToPlan(q, shared), num(opportunity))), [quotas, index, insurance, opportunity]);
  const agg = useMemo(() => aggregatePlans(results), [results]);
  const unitSuffix = (u: BidUnit) => u === 'PCT' ? '%' : u === 'BRL' ? 'R$' : 'parc.';

  return (
    <div className="space-y-6">
      <Verdict tone="info" title="Monte a operação com várias cotas — novas e suas.">
        Cada cota tem o próprio lance e mês de contemplação; o total soma tudo. Os meses contam a partir de agora. O rascunho fica salvo neste aparelho.
      </Verdict>

      <Card title="Premissas para todas as cotas">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Reajuste anual" value={index} onChange={setIndex} suffix="% a.a." hint="INCC 12m: 6,66% (set/26)" />
          <Field label="Seguro prestamista" value={insurance} onChange={setInsurance} suffix="% a.m." hint="Sobre o saldo, após contemplar" />
          <Field label="Rendimento do seu dinheiro" value={opportunity} onChange={setOpportunity} suffix="% a.a." hint={`CDI ${fmtPct(DEFAULT_CDI)} − IR`} />
        </div>
      </Card>

      {quotas.map((q, i) => {
        const r = results[i];
        const sum = agg.quotas[i];
        const existing = !!q.source;
        return (
          <Card key={q.key} title={`Cota ${i + 1}`}>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="flex-1">
                <label className={labelCls}>Nome</label>
                <input className={inputCls} value={q.name} onChange={e => update(q.key, { name: e.target.value })} />
              </div>
              <div className="flex-1">
                <label className={labelCls}>Cota</label>
                <select className={inputCls} value={q.source} onChange={e => chooseSource(q.key, e.target.value)}>
                  <option value="">Cota nova (simular compra)</option>
                  {consortiums.map(c => <option key={c.id} value={c.id}>{c.name} — minha, situação de hoje</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => duplicate(q.key)} className="flex items-center gap-1 px-3 py-2.5 rounded-xl border border-slate-200 text-[11px] font-bold text-slate-500 hover:text-brand-700"><Copy size={13} />Duplicar</button>
                <button type="button" onClick={() => remove(q.key)} disabled={quotas.length === 1} className="flex items-center gap-1 px-3 py-2.5 rounded-xl border border-slate-200 text-[11px] font-bold text-slate-500 hover:text-rose-600 disabled:opacity-40"><Trash2 size={13} />Remover</button>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Field label={existing ? 'Carta (contratada)' : 'Carta de crédito'} value={q.credit} onChange={v => update(q.key, { credit: v })} suffix="R$" />
              {existing ? (
                <>
                  <Field label="Saldo devedor hoje" value={q.balance} onChange={v => update(q.key, { balance: v })} suffix="R$" />
                  <Field label="Parcelas restantes" value={q.remaining} onChange={v => update(q.key, { remaining: v })} integer />
                  <Field label="Parcela atual" value={q.installment} onChange={v => update(q.key, { installment: v })} suffix="R$" />
                </>
              ) : (
                <>
                  <Field label="Prazo" value={q.term} onChange={v => update(q.key, { term: v })} suffix="meses" integer />
                  <Field label="Parcela até contemplar" value={q.reduced} onChange={v => update(q.key, { reduced: v })} suffix="%" />
                </>
              )}
              <Field label="Taxa de adm. (total)" value={q.adm} onChange={v => update(q.key, { adm: v })} suffix="%" />
              <Field label="Fundo de reserva" value={q.fr} onChange={v => update(q.key, { fr: v })} suffix="%" />
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="col-span-2">
                <label className={labelCls}>Lance em</label>
                <Seg value={q.unit} onChange={(v: BidUnit) => update(q.key, { unit: v })} options={[{ value: 'PCT', label: '% da carta' }, { value: 'BRL', label: 'R$' }, { value: 'INST', label: 'Nº de parcelas' }]} />
              </div>
              {q.unit === 'INST' && <Field label="Prazo-base do grupo" value={q.baseTerm} onChange={v => update(q.key, { baseTerm: v })} suffix="meses" integer />}
              <Field label="Lance do bolso" value={q.free} onChange={v => update(q.key, { free: v })} suffix={unitSuffix(q.unit)} />
              <Field label="Lance embutido" value={q.emb} onChange={v => update(q.key, { emb: v })} suffix={unitSuffix(q.unit)} />
              <Field label="Contempla daqui a" value={q.month} onChange={v => update(q.key, { month: v })} suffix="meses" integer />
              <div>
                <label className={labelCls}>Lance abate</label>
                <Seg value={q.mode} onChange={(v: BidMode) => update(q.key, { mode: v })} options={[{ value: 'REDUCE_INSTALLMENT', label: 'Parcela' }, { value: 'REDUCE_TERM', label: 'Prazo' }]} />
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <Stat label="Crédito líquido" value={fmt(sum.netCredit)} sub={sum.bidEmbedded > 0 ? `carta ${fmt(sum.credit)} − embutido ${fmt(sum.bidEmbedded)}` : `carta ${fmt(sum.credit)}`} strong />
              <Stat label="Lance do bolso" value={fmt(sum.bidCash)} />
              <Stat label="Saque líquido" value={fmt(sum.netCash)} sub="crédito líquido − lance do bolso" />
              <Stat label="Parcela antes → depois" value={`${fmt(sum.initialInstallment)} → ${fmt(sum.postInstallment)}`} sub={`depois: ${sum.monthsAfter} meses`} />
              <Stat label="Saldo depois do lance" value={fmt(r.balanceAfterBid)} />
            </div>
            {r.warnings.map((w, k) => <Verdict key={k} tone="warn" title={w} />)}
          </Card>
        );
      })}

      <button type="button" onClick={add} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-slate-200 text-xs font-black text-slate-500 hover:border-brand-300 hover:text-brand-700">
        <Plus size={14} /> Adicionar cota
      </button>

      <Card title={`Total das ${quotas.length} cotas`}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Crédito contratado" value={fmt(agg.total.credit)} />
          <Stat label="Lance total" value={fmt(agg.total.bidCash + agg.total.bidEmbedded)} sub={`do bolso ${fmt(agg.total.bidCash)} · embutido ${fmt(agg.total.bidEmbedded)}`} />
          <Stat label="Crédito liberado" value={fmt(agg.total.netCredit)} strong />
          <Stat label="Saque líquido" value={fmt(agg.total.netCash)} strong />
          <Stat label="Parcela inicial (soma)" value={fmt(agg.total.initialInstallment)} />
          <Stat label="Parcela depois (soma)" value={fmt(agg.total.postInstallment)} sub="cada cota depois da sua contemplação" />
          <Stat label="Total que sai do bolso" value={fmt(agg.total.totalCashOut)} sub="parcelas + seguro + lances do bolso" />
          <Stat label="Até quitar tudo" value={`${agg.monthly.length} meses`} />
        </div>

        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-[11px] min-w-[640px]">
            <thead>
              <tr className="text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">
                <th className="py-2 px-1">Cota</th><th className="px-1 text-right">Crédito</th><th className="px-1 text-right">Lance bolso</th>
                <th className="px-1 text-right">Embutido</th><th className="px-1 text-right">Crédito líquido</th><th className="px-1 text-right">Saque líquido</th>
                <th className="px-1 text-right">Parcela inicial</th><th className="px-1 text-right">Parcela pós</th>
              </tr>
            </thead>
            <tbody className="font-bold text-slate-700">
              {agg.quotas.map((sq, i) => (
                <tr key={quotas[i].key} className="border-t border-slate-100">
                  <td className="py-2 px-1 truncate max-w-[140px]">{quotas[i].name}</td>
                  <td className="px-1 text-right">{fmt(sq.credit)}</td><td className="px-1 text-right">{fmt(sq.bidCash)}</td>
                  <td className="px-1 text-right">{fmt(sq.bidEmbedded)}</td><td className="px-1 text-right">{fmt(sq.netCredit)}</td>
                  <td className="px-1 text-right">{fmt(sq.netCash)}</td><td className="px-1 text-right">{fmt(sq.initialInstallment)}</td>
                  <td className="px-1 text-right">{fmt(sq.postInstallment)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-200 text-slate-900 font-black">
                <td className="py-2 px-1">Total</td>
                <td className="px-1 text-right">{fmt(agg.total.credit)}</td><td className="px-1 text-right">{fmt(agg.total.bidCash)}</td>
                <td className="px-1 text-right">{fmt(agg.total.bidEmbedded)}</td><td className="px-1 text-right">{fmt(agg.total.netCredit)}</td>
                <td className="px-1 text-right">{fmt(agg.total.netCash)}</td><td className="px-1 text-right">{fmt(agg.total.initialInstallment)}</td>
                <td className="px-1 text-right">{fmt(agg.total.postInstallment)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Soma das parcelas mês a mês">
        <StepChart
          title="Saída do bolso por mês com todas as cotas (sem os lances)"
          markers={agg.quotas.map(sq => ({ month: sq.contemplationMonth, label: 'contemplação' }))}
          points={agg.monthly.map((v, i) => ({
            value: v,
            lines: (
              <>
                <p className="font-black">Mês {i + 1}</p>
                <p>Total: <strong>{fmt(v)}</strong></p>
                {results.map((r, k) => r.rows[i] ? <p key={k}>{quotas[k].name}: {fmt(r.rows[i].installment + r.rows[i].insurance)}</p> : null)}
              </>
            )
          }))}
        />
      </Card>
    </div>
  );
};

// ─── Componente principal ───────────────────────────────────────────────────
const ConsortiumSimulator: React.FC = () => {
  const [tab, setTab] = useState<SimTab>('plan');
  const [consortiums, setConsortiums] = useState<ConsortiumRow[]>([]);
  const [financings, setFinancings] = useState<FinancingRow[]>([]);
  const [consLiabs, setConsLiabs] = useState<Record<string, FinancingRow>>({});

  // Cota: '' = nova (simular compra); id = uma cota minha, a partir de hoje.
  const [quotaId, setQuotaId] = useState('');
  const [exBalance, setExBalance] = useState('');
  const [exRemaining, setExRemaining] = useState('');
  const [exInstallment, setExInstallment] = useState('');
  const existing = !!quotaId;

  // Plano (compartilhado com Lance e Quitar financiamento)
  const [credit, setCredit] = useState('200.000');
  const [term, setTerm] = useState('200');
  const [adm, setAdm] = useState('18');
  const [fr, setFr] = useState('2');
  const [index, setIndex] = useState(DEFAULT_INDEX);
  const [reduced, setReduced] = useState('100');
  const [insurance, setInsurance] = useState('0');
  const [kMonth, setKMonth] = useState('12');
  const [opportunity, setOpportunity] = useState(DEFAULT_OPPORTUNITY);
  const [finRate, setFinRate] = useState('12');
  const [finSystem, setFinSystem] = useState<AmortizationSystem>('SAC');

  // Lance
  const [bidUnit, setBidUnit] = useState<BidUnit>('PCT');
  const [baseTerm, setBaseTerm] = useState('240');
  const [freeBid, setFreeBid] = useState('30');
  const [embBid, setEmbBid] = useState('0');
  const [bidMode, setBidMode] = useState<BidMode>('REDUCE_INSTALLMENT');
  const [bidMonth, setBidMonth] = useState('6');
  const [activeQuotas, setActiveQuotas] = useState('');
  const [lotteryPer, setLotteryPer] = useState('');
  const [lotteryMonthTxt, setLotteryMonthTxt] = useState('');
  const [minWin, setMinWin] = useState('');
  const [avgWin, setAvgWin] = useState('');
  const [benefit, setBenefit] = useState('0');

  // Carta contemplada
  const [cqEntry, setCqEntry] = useState('');
  const [cqFee, setCqFee] = useState('0');
  const [cqCredit, setCqCredit] = useState('');
  const [cqInst, setCqInst] = useState('');
  const [cqMonths, setCqMonths] = useState('');

  // Quitar financiamento
  const [finId, setFinId] = useState('');
  const [poBalance, setPoBalance] = useState('');
  const [poRateMonth, setPoRateMonth] = useState('');
  const [poMonths, setPoMonths] = useState('');
  const [poSystem, setPoSystem] = useState<AmortizationSystem>('PRICE');
  const [poRealInstallments, setPoRealInstallments] = useState<number[] | null>(null);
  const [poNetCredit, setPoNetCredit] = useState('');
  const [poOwnBid, setPoOwnBid] = useState('');
  const [poInst, setPoInst] = useState('');
  const [poConsMonths, setPoConsMonths] = useState('');

  // Vender cota
  const [saleSource, setSaleSource] = useState('');
  const [salePayments, setSalePayments] = useState<SaleFlow[] | null>(null);
  const [manualInst, setManualInst] = useState('');
  const [manualMonths, setManualMonths] = useState('');
  const [manualStart, setManualStart] = useState(DateUtils.formatToISODate());
  const [manualBid, setManualBid] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [saleDate, setSaleDate] = useState(DateUtils.formatToISODate());
  const [targetPct, setTargetPct] = useState('1');
  const [targetBasis, setTargetBasis] = useState<'MONTHLY' | 'TOTAL'>('MONTHLY');

  const [showRefs, setShowRefs] = useState(false);

  // Consórcios e financiamentos cadastrados (para pré-preencher).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!supabase) return;
        const user = await getSessionUser(supabase);
        if (!user) return;
        const [cRes, lRes] = await Promise.all([
          supabase.from('consortiums').select('id, name, liability_id, credit_letter_value, total_months, admin_fee_pct, reserve_fund_pct, insurance_monthly_amount, status, metadata').eq('user_id', user.id).order('name'),
          supabase.from('liabilities').select('id, name, type, remaining_balance, installment_amount, installments_remaining, interest_rate, metadata').eq('user_id', user.id).eq('is_archived', false)
        ]);
        if (!alive) return;
        const liabs = (lRes.data || []) as any[];
        setConsortiums((cRes.data || []) as any);
        setFinancings(liabs.filter(l => l.type !== 'CONSORTIUM' && Number(l.remaining_balance) > 0));
        setConsLiabs(Object.fromEntries(liabs.filter(l => l.type === 'CONSORTIUM').map(l => [l.id, l])));
      } catch { /* sem dados: o simulador funciona com campos manuais */ }
    })();
    return () => { alive = false; };
  }, []);

  // ── Plano ──
  const planBase = existing
    ? {
      ...existingQuotaPlan({ credit: num(credit), balance: num(exBalance), remainingMonths: num(exRemaining), currentInstallment: num(exInstallment) }),
      reserveFundPct: 0, reducedPct: 100, annualIndexPct: num(index), insuranceMonthlyPct: num(insurance)
    }
    : {
      credit: num(credit), termMonths: num(term), adminFeePct: num(adm), reserveFundPct: num(fr),
      annualIndexPct: num(index), reducedPct: num(reduced) || 100, insuranceMonthlyPct: num(insurance)
    };
  // Plano cheio do grupo (para o lance em nº de parcelas), mesmo numa cota existente.
  const planPctValue = 100 + num(adm) + num(fr);
  const toPct = (txt: string) => {
    const v = num(txt);
    if (bidUnit === 'BRL') return planBase.credit > 0 ? (v / planBase.credit) * 100 : 0;
    if (bidUnit === 'INST') return installmentsToPct(v, planPctValue, num(baseTerm));
    return v;
  };
  const freePct = toPct(freeBid);
  const embPct = toPct(embBid);

  const plan = useMemo(() => simulatePlan({
    ...planBase, contemplationMonth: num(kMonth) || 1, freeBidPct: 0, embeddedBidPct: 0
  }, num(opportunity)), [credit, term, adm, fr, index, reduced, insurance, kMonth, opportunity, quotaId, exBalance, exRemaining, exInstallment]);

  const financingAlt = useMemo(() => {
    const months = Math.max(1, plan.monthsAfterContemplation || num(term));
    return simulateFinancing(plan.netCredit, num(finRate), months, finSystem);
  }, [plan, finRate, finSystem, term]);

  // ── Lance ──
  const odds = lotteryOdds(num(activeQuotas), num(lotteryPer));
  const expectedLotteryMonth = Number.isFinite(odds.expectedMonths) ? Math.round(odds.expectedMonths) : 0;
  const lotteryMonth = num(lotteryMonthTxt) || expectedLotteryMonth || Math.round(num(term) / 2);
  const decision = useMemo(() => evaluateBid({
    plan: { ...planBase, bidMode },
    bidMonth: num(bidMonth) || 1,
    freeBidPct: freePct,
    embeddedBidPct: embPct,
    lotteryMonth,
    opportunityPctYear: num(opportunity),
    monthlyBenefit: num(benefit)
  }), [credit, term, adm, fr, index, reduced, insurance, bidMode, bidMonth, freeBid, embBid, bidUnit, baseTerm, lotteryMonth, opportunity, benefit, quotaId, exBalance, exRemaining, exInstallment]);
  // Abaixo de 0,01% da carta é "nenhum" (a vantagem com lance zero é só arredondamento).
  const maxWorthPct = decision.maxWorthwhileFreeBidPct !== null && decision.maxWorthwhileFreeBidPct > 0.01 ? decision.maxWorthwhileFreeBidPct : null;
  const chance = bidChance(freePct + embPct, num(minWin) || null, num(avgWin) || null);
  const unitValue = baseInstallmentValue(planBase.credit, planPctValue, num(baseTerm));

  // ── Carta contemplada ──
  const cq = useMemo(() => evaluateContemplatedQuota({
    entry: num(cqEntry), transferFee: num(cqFee), credit: num(cqCredit), installment: num(cqInst),
    remainingMonths: num(cqMonths), annualIndexPct: num(index)
  }), [cqEntry, cqFee, cqCredit, cqInst, cqMonths, index]);
  // Maior ágio que ainda deixa a cota mais barata que o financiamento.
  const maxEntry = useMemo(() => {
    const base = { transferFee: num(cqFee), credit: num(cqCredit), installment: num(cqInst), remainingMonths: num(cqMonths), annualIndexPct: num(index) };
    if (!base.credit || !base.installment || !base.remainingMonths) return null;
    const target = num(finRate);
    const cetAt = (e: number) => evaluateContemplatedQuota({ ...base, entry: e }).cetAnnualPct;
    const c0 = cetAt(0);
    if (c0 === null || c0 > target) return 0;
    let lo = 0, hi = base.credit;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      const c = cetAt(mid);
      if (c !== null && c <= target) lo = mid; else hi = mid;
    }
    return lo;
  }, [cqFee, cqCredit, cqInst, cqMonths, index, finRate]);

  // ── Quitar financiamento ──
  const chooseFinancing = async (id: string) => {
    setFinId(id);
    setPoRealInstallments(null);
    const f = financings.find(x => x.id === id);
    if (!f || !supabase) return;
    setPoBalance(toText(Number(f.remaining_balance)));
    setPoMonths(String(f.installments_remaining || ''));
    setPoRateMonth(f.interest_rate ? toText(Number(f.interest_rate), 4) : '');
    setPoSystem(f.metadata?.amortizationType === 'SAC' ? 'SAC' : 'PRICE');
    try {
      const { data } = await supabase.from('transactions').select('amount, date, is_paid, is_deleted, paid_amount')
        .eq('liability_id', id).eq('is_paid', false).order('date', { ascending: true });
      const real = (data || []).filter((t: any) => t.is_deleted !== true)
        .map((t: any) => Math.max(0, Number(t.amount) - Number(t.paid_amount || 0))).filter((v: number) => v > 0);
      if (real.length) { setPoRealInstallments(real); setPoMonths(String(real.length)); }
    } catch { /* fica com taxa e sistema */ }
  };
  const usePlanForPayoff = () => {
    const p = simulatePlan({ ...planBase, contemplationMonth: num(bidMonth) || 1, freeBidPct: freePct, embeddedBidPct: embPct, bidMode }, num(opportunity));
    setPoNetCredit(toText(p.netCredit));
    setPoOwnBid(toText(p.bidCash));
    setPoInst(toText(p.postInstallment));
    setPoConsMonths(String(p.monthsAfterContemplation));
  };
  const payoff = useMemo(() => evaluatePayoff({
    financingBalance: num(poBalance),
    financingRatePctYear: monthlyToAnnualPct(num(poRateMonth) / 100),
    financingMonths: num(poMonths),
    financingSystem: poSystem,
    financingInstallments: poRealInstallments || undefined,
    netCredit: num(poNetCredit), ownBid: num(poOwnBid), consortiumInstallment: num(poInst), consortiumMonths: num(poConsMonths),
    annualIndexPct: num(index), opportunityPctYear: num(opportunity)
  }), [poBalance, poRateMonth, poMonths, poSystem, poRealInstallments, poNetCredit, poOwnBid, poInst, poConsMonths, index, opportunity]);

  // ── Vender cota ──
  const chooseSaleSource = async (id: string) => {
    setSaleSource(id);
    setSalePayments(null);
    const c = consortiums.find(x => x.id === id);
    if (!c?.liability_id || !supabase) return;
    try {
      const { data } = await supabase.from('transactions').select('date, paid_at, amount, paid_amount, is_paid, is_deleted, type, metadata')
        .eq('liability_id', c.liability_id).order('date', { ascending: true });
      // Só o que saiu do bolso: parcelas e lance pago. Embutido saiu da carta.
      const pays = (data || []).filter((t: any) => t.is_deleted !== true && t.type === 'EXPENSE'
          && t.metadata?.bid_part !== 'EMBEDDED' && t.metadata?.isCapitalized !== true)
        .map((t: any) => ({
          date: String(t.paid_at || t.date).slice(0, 10),
          amount: t.is_paid ? (Number(t.paid_amount) > 0 ? Number(t.paid_amount) : Number(t.amount)) : Number(t.paid_amount || 0)
        }))
        .filter((p: SaleFlow) => p.amount > 0);
      setSalePayments(pays);
    } catch { setSalePayments([]); }
  };
  const manualPayments: SaleFlow[] = useMemo(() => {
    const list: SaleFlow[] = [];
    const n = num(manualMonths), p = num(manualInst);
    for (let i = 0; i < n; i++) list.push({ date: addMonthsIso(manualStart, i), amount: p });
    if (num(manualBid) > 0) list.push({ date: list.length ? list[list.length - 1].date : manualStart, amount: num(manualBid) });
    return list;
  }, [manualInst, manualMonths, manualStart, manualBid]);
  const payments = saleSource ? (salePayments || []) : manualPayments;
  const sale = useMemo(() => evaluateSale(payments, num(salePrice), saleDate, num(opportunity)), [payments, salePrice, saleDate, opportunity]);
  const target = useMemo(() => targetSalePrice(payments, saleDate, num(targetPct), targetBasis), [payments, saleDate, targetPct, targetBasis]);

  const selectQuota = (id: string) => {
    setQuotaId(id);
    const c = consortiums.find(x => x.id === id);
    if (!c) return;
    setCredit(toText(Number(c.credit_letter_value)));
    setTerm(String(c.total_months || ''));
    setAdm(toText(Number(c.admin_fee_pct)));
    setFr(toText(Number(c.reserve_fund_pct)));
    const l = c.liability_id ? consLiabs[c.liability_id] : undefined;
    setExBalance(l ? toText(Number(l.remaining_balance)) : '');
    setExRemaining(l ? String(l.installments_remaining || '') : '');
    setExInstallment(l ? toText(Number(l.installment_amount)) : '');
  };
  const selectedQuota = consortiums.find(x => x.id === quotaId);
  const monthWord = existing ? 'daqui a' : 'no mês';

  const tabs: { id: SimTab; label: string; icon: React.ReactNode }[] = [
    { id: 'plan', label: 'Plano', icon: <Calculator size={14} /> },
    { id: 'bid', label: 'Lance', icon: <Gavel size={14} /> },
    { id: 'portfolio', label: 'Várias cotas', icon: <Layers size={14} /> },
    { id: 'contemplated', label: 'Carta contemplada', icon: <BadgeCheck size={14} /> },
    { id: 'payoff', label: 'Quitar financiamento', icon: <Landmark size={14} /> },
    { id: 'sale', label: 'Vender cota', icon: <HandCoins size={14} /> }
  ];

  const finRateTxt = `${fmtPct(num(finRate))} a.a.`;
  const oppTxt = `${fmtPct(num(opportunity))} a.a.`;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="bg-gradient-to-br from-brand-900 to-brand-700 text-white rounded-[28px] p-6 space-y-2">
        <div className="flex items-center gap-2"><Calculator size={18} /><h2 className="text-lg font-black">Simulador de Consórcio</h2></div>
        <p className="text-xs text-white/75 leading-relaxed max-w-3xl">
          Conta igual à das administradoras: o plano é um percentual da carta (fundo comum + taxa de administração + fundo de reserva), corrigido pelo índice todo ano.
          As comparações usam valor presente pelo rendimento do seu dinheiro: o caminho que custa menos em dinheiro de hoje é o melhor. Nada aqui é gravado.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap border transition-all ${tab === t.id ? 'bg-brand-600 text-white border-brand-600 shadow' : 'bg-white text-slate-500 border-slate-200 hover:text-slate-900'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ═══ PLANO ═══ */}
      {(tab === 'plan' || tab === 'bid') && (
        <Card title="Plano da cota">
          <div>
            <label className={labelCls}>Cota</label>
            <select className={inputCls} value={quotaId} onChange={e => selectQuota(e.target.value)}>
              <option value="">Cota nova (simular uma compra)</option>
              {consortiums.map(c => <option key={c.id} value={c.id}>{c.name} — minha cota, situação de hoje</option>)}
            </select>
            {existing && <p className="text-[10px] text-slate-400 mt-1">Parte do saldo devedor, das parcelas restantes e da parcela de hoje (do seu cadastro). Os meses contam a partir de agora.</p>}
          </div>
          {existing && selectedQuota && selectedQuota.status !== 'WAITING' && (
            <Verdict tone="info" title="Esta cota já está contemplada.">A simulação de lance fica só como referência; o plano mostra o que falta pagar.</Verdict>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label={existing ? 'Carta (crédito contratado)' : 'Carta de crédito'} value={credit} onChange={setCredit} suffix="R$" />
            {existing ? (
              <>
                <Field label="Saldo devedor hoje" value={exBalance} onChange={setExBalance} suffix="R$" hint="Confira no extrato da administradora" />
                <Field label="Parcelas restantes" value={exRemaining} onChange={setExRemaining} integer />
                <Field label="Parcela atual" value={exInstallment} onChange={setExInstallment} suffix="R$" hint="Se reduzida, o resto é dividido depois de contemplar" />
              </>
            ) : (
              <Field label="Prazo" value={term} onChange={setTerm} suffix="meses" integer />
            )}
            <Field label="Taxa de adm. (total)" value={adm} onChange={setAdm} suffix="%" hint={existing ? 'Do plano — usada no lance em nº de parcelas' : 'Mercado: 13% a 25% da carta'} />
            <Field label="Fundo de reserva" value={fr} onChange={setFr} suffix="%" hint={existing ? 'Do plano' : 'Comum: 0% a 3%'} />
            <Field label="Reajuste anual" value={index} onChange={setIndex} suffix="% a.a." hint="INCC 12m: 6,66% (set/26)" />
            {!existing && <Field label="Parcela até contemplar" value={reduced} onChange={setReduced} suffix="%" hint="100 = cheia; 50/70 = reduzida" />}
            <Field label="Seguro prestamista" value={insurance} onChange={setInsurance} suffix="% a.m." hint="Sobre o saldo, após contemplar" />
            <Field label="Rendimento do seu dinheiro" value={opportunity} onChange={setOpportunity} suffix="% a.a." hint={`CDI ${fmtPct(DEFAULT_CDI)} − IR`} />
          </div>
        </Card>
      )}

      {tab === 'plan' && (
        <>
          <Card title="Contemplação e comparação">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Field label={`Contemplação ${monthWord}`} value={kMonth} onChange={setKMonth} suffix="meses" integer hint="Sem lance (sorteio)" />
              <Field label="Financiamento alternativo" value={finRate} onChange={setFinRate} suffix="% a.a." hint="CET da proposta do banco" />
              <div className="col-span-2">
                <label className={labelCls}>Sistema do financiamento</label>
                <Seg value={finSystem} onChange={setFinSystem} options={[{ value: 'SAC', label: 'SAC' }, { value: 'PRICE', label: 'PRICE' }]} />
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {existing
              ? <Stat label="Parcela atual" value={fmt(plan.preInstallment)} sub={`${num(exRemaining)} parcelas restantes`} strong />
              : <Stat label="Parcela integral" value={fmt(plan.fullInstallment)} sub={`${fmtPct(plan.planPct, 1)} da carta em ${num(term)} meses`} strong />}
            <Stat label="Parcela até contemplar" value={fmt(plan.preInstallment)} />
            <Stat label="Parcela depois" value={fmt(plan.postInstallment)} sub={plan.postInstallment > plan.preInstallment + 0.01 ? 'O restante foi dividido nos meses que faltam' : undefined} />
            {existing
              ? <Stat label="Saldo devedor hoje" value={fmt(num(exBalance))} sub={`${fmtPct(plan.planPct, 1)} da carta`} />
              : <Stat label="Taxas do plano" value={fmt(planBase.credit * (planPctValue - 100) / 100)} sub={`${fmtPct(planPctValue - 100, 1)} da carta (sem reajuste)`} />}
            <Stat label="Total pago (com reajuste)" value={fmt(plan.totalCashOut)} sub={`em ${plan.monthsTotal} meses`} />
            <Stat label="Carta na contemplação" value={fmt(plan.netCredit)} sub={`mês ${plan.contemplationMonth}, corrigida pelo índice`} />
            <Stat label="Custo efetivo após contemplar" value={`${fmtPct(plan.cetAfterContemplationPct)} a.a.`} sub="Saldo financiado (já descontado o que pagou antes)" strong />
            <Stat label="Financiamento do mesmo valor" value={`${fmt(financingAlt.firstInstallment)}/mês`} sub={`${finSystem}, ${finRateTxt}: total ${fmt(financingAlt.totalPaid)}`} />
          </div>

          {plan.cetAfterContemplationPct !== null && (
            plan.cetAfterContemplationPct < num(finRate)
              ? <Verdict tone="good" title={`Consórcio sai mais barato: ${fmtPct(plan.cetAfterContemplationPct)} a.a. contra ${finRateTxt} do financiamento.`}>
                  A diferença é o preço da espera: o bem chega no mês {plan.contemplationMonth}, não hoje. Se precisa do bem já, compare na aba Lance (com o aluguel que economizaria) ou em Carta contemplada.
                </Verdict>
              : <Verdict tone="warn" title={`Consórcio sai mais caro que o financiamento: ${fmtPct(plan.cetAfterContemplationPct)} a.a. contra ${finRateTxt}.`}>
                  Com essa taxa de administração e reajuste, o financiamento custa menos — e ainda entrega o bem hoje.
                </Verdict>
          )}
          {plan.warnings.map((w, i) => <Verdict key={i} tone="warn" title={w} />)}

          <Card title="Parcelas ao longo do plano"><InstallmentChart plan={plan} /></Card>
        </>
      )}

      {/* ═══ LANCE ═══ */}
      {tab === 'bid' && (
        <>
          <Card title="O lance">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className={labelCls}>Como a administradora oferta o lance</label>
                <Seg value={bidUnit} onChange={setBidUnit} options={[{ value: 'PCT', label: '% da carta' }, { value: 'BRL', label: 'R$' }, { value: 'INST', label: 'Nº de parcelas' }]} />
                {bidUnit === 'INST' && (
                  <Field label="Prazo-base do grupo" value={baseTerm} onChange={setBaseTerm} suffix="meses" integer
                    hint={`1 parcela de lance = ${fmt(unitValue)} (carta × ${fmtPct(planPctValue, 0)} ÷ ${num(baseTerm) || 0}). Ex.: Ademicon usa o prazo original do grupo.`} />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Lance do bolso (livre)" value={freeBid} onChange={setFreeBid} suffix={bidUnit === 'PCT' ? '%' : bidUnit === 'BRL' ? 'R$' : 'parc.'} hint={fmt(planBase.credit * freePct / 100)} />
                <Field label="Lance embutido" value={embBid} onChange={setEmbBid} suffix={bidUnit === 'PCT' ? '%' : bidUnit === 'BRL' ? 'R$' : 'parc.'} hint={`${fmt(planBase.credit * embPct / 100)} — sai da carta (até ~30%)`} />
                <Field label={`Dar o lance ${monthWord}`} value={bidMonth} onChange={setBidMonth} suffix="meses" integer />
                <div>
                  <label className={labelCls}>Lance abate</label>
                  <Seg value={bidMode} onChange={setBidMode} options={[{ value: 'REDUCE_INSTALLMENT', label: 'Parcela' }, { value: 'REDUCE_TERM', label: 'Prazo' }]} />
                </div>
              </div>
            </div>
          </Card>

          <Card title="O grupo e o seu ganho em antecipar">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <Field label="Cotas ativas no grupo" value={activeQuotas} onChange={setActiveQuotas} integer hint="Na assembleia da administradora" />
              <Field label="Sorteios por assembleia" value={lotteryPer} onChange={setLotteryPer} integer />
              <Field label={`Sorteio esperado ${monthWord}`} value={lotteryMonthTxt} onChange={setLotteryMonthTxt} integer
                hint={expectedLotteryMonth ? `Pelo grupo: ~mês ${expectedLotteryMonth}` : `Sem dados: usando mês ${lotteryMonth}`} placeholder={String(lotteryMonth)} />
              <Field label="Menor lance vencedor" value={minWin} onChange={setMinWin} suffix="%" hint="Últimas assembleias" />
              <Field label="Lance médio vencedor" value={avgWin} onChange={setAvgWin} suffix="%" hint="Últimas assembleias" />
              <Field label="Ganho por mês com o bem antes" value={benefit} onChange={setBenefit} suffix="R$" hint="Aluguel economizado, aluguel recebido ou juros que deixa de pagar" />
            </div>
          </Card>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Lance total" value={fmt(decision.withBid.bidCash + decision.withBid.bidEmbedded)} sub={`${fmtPct(freePct + embPct, 1)} da carta · do bolso ${fmt(decision.withBid.bidCash)}`} strong />
            <Stat label="Crédito líquido" value={fmt(decision.withBid.netCredit)} sub={decision.withBid.bidEmbedded > 0 ? `carta − embutido ${fmt(decision.withBid.bidEmbedded)}` : 'carta inteira'} />
            <Stat label="Saldo devedor" value={`${fmt(decision.withBid.balanceBeforeBid)} → ${fmt(decision.withBid.balanceAfterBid)}`} />
            <Stat label={bidMode === 'REDUCE_TERM' ? 'Prazo depois do lance' : 'Parcela depois do lance'}
              value={bidMode === 'REDUCE_TERM' ? `${decision.withBid.monthsAfterContemplation} meses` : fmt(decision.withBid.postInstallment)}
              sub={bidMode === 'REDUCE_TERM' ? `parcela ${fmt(decision.withBid.postInstallment)}` : `por ${decision.withBid.monthsAfterContemplation} meses`} />
            <Stat label="Saque líquido" value={fmt(decision.withBid.netCredit - decision.withBid.bidCash)} sub="Crédito líquido − lance do bolso" />
            <Stat label="Chance pelo sorteio" value={num(activeQuotas) && num(lotteryPer) ? fmtPct(odds.withinMonthsPct, 1) : '—'} sub={num(activeQuotas) && num(lotteryPer) ? `em 12 meses · ${fmtPct(odds.perAssemblyPct, 2)} por assembleia` : 'Informe cotas e sorteios'} />
            <Stat label="Antecipa" value={`${decision.monthsAnticipated} meses`} sub={`ganho em valor presente: ${fmt(decision.pvBenefit)}`} />
            <Stat label="Lance livre máximo que compensa" value={maxWorthPct === null ? 'nenhum' : fmt(planBase.credit * maxWorthPct / 100)}
              sub={maxWorthPct === null ? 'Sem ganho em antecipar, esperar sai mais barato' : `${fmtPct(maxWorthPct, 1)} da carta${bidUnit === 'INST' && unitValue > 0 ? ` · ${fmtNum(planBase.credit * maxWorthPct / 100 / unitValue, 0)} parcelas` : ''}`} strong />
          </div>

          {chance !== 'SEM_DADOS' && (
            <Verdict tone={chance === 'ALTA' ? 'good' : chance === 'MEDIA' ? 'warn' : 'bad'}
              title={chance === 'ALTA' ? 'Chance alta de contemplar: seu lance está no nível do lance médio vencedor.' : chance === 'MEDIA' ? 'Chance média: acima do menor lance vencedor, abaixo da média.' : 'Chance baixa: abaixo do menor lance vencedor das últimas assembleias.'}>
              Seu lance: {fmtPct(freePct + embPct, 1)} da carta. Lances vencedores mudam a cada assembleia — use os resultados mais recentes do seu grupo.
            </Verdict>
          )}
          {decision.advantage >= 0
            ? <Verdict tone="good" title={`Dar esse lance compensa: vantagem de ${fmt(decision.advantage)} em valor presente.`}>
                Antecipa {decision.monthsAnticipated} meses. O ganho de ter o bem antes ({fmt(decision.pvBenefit)}) supera o custo de tirar o dinheiro do rendimento ({oppTxt}).
              </Verdict>
            : <Verdict tone={num(benefit) > 0 ? 'warn' : 'bad'} title={`Esse lance não compensa: custa ${fmt(-decision.advantage)} a mais em valor presente.`}>
                {num(benefit) > 0
                  ? `O ganho de antecipar ${decision.monthsAnticipated} meses não paga o dinheiro parado. ${maxWorthPct !== null ? `Até ${fmt(planBase.credit * maxWorthPct / 100)} do bolso ainda compensaria.` : ''}`
                  : 'Sem informar o ganho de ter o bem antes (aluguel, juros evitados), o lance só antecipa pagamento — o dinheiro renderia mais aplicado.'}
              </Verdict>
          }
          {decision.withBid.warnings.map((w, i) => <Verdict key={i} tone="warn" title={w} />)}
          <Card title="Parcelas com o lance"><InstallmentChart plan={decision.withBid} /></Card>
        </>
      )}

      {/* ═══ CARTA CONTEMPLADA ═══ */}
      {tab === 'contemplated' && (
        <>
          <Card title="Cota já contemplada à venda">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <Field label="Crédito disponível" value={cqCredit} onChange={setCqCredit} suffix="R$" />
              <Field label="Entrada / ágio ao vendedor" value={cqEntry} onChange={setCqEntry} suffix="R$" />
              <Field label="Taxa de transferência" value={cqFee} onChange={setCqFee} suffix="R$" />
              <Field label="Parcela atual" value={cqInst} onChange={setCqInst} suffix="R$" />
              <Field label="Parcelas restantes" value={cqMonths} onChange={setCqMonths} integer />
              <Field label="Financiamento alternativo" value={finRate} onChange={setFinRate} suffix="% a.a." />
            </div>
            <p className="text-[10px] text-slate-400">As parcelas são reajustadas todo ano pelo índice do plano ({fmtPct(num(index))} a.a.).</p>
          </Card>
          {num(cqCredit) > 0 && num(cqInst) > 0 && num(cqMonths) > 0 ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat label="Custo efetivo (CET)" value={`${fmtPct(cq.cetAnnualPct)} a.a.`} sub={`${fmtPct(cq.cetMonthlyPct, 3)} a.m.`} strong />
                <Stat label="Total que vai pagar" value={fmt(cq.totalPaid)} sub="entrada + taxa + parcelas" />
                <Stat label="Custo acima do crédito" value={fmt(cq.nominalCost)} />
                <Stat label="Ágio máximo que vale" value={maxEntry === null ? '—' : fmt(maxEntry)} sub={`para o CET ficar até ${finRateTxt}`} strong />
              </div>
              {cq.cetAnnualPct === null
                ? <Verdict tone="info" title="Não dá para calcular o custo com esses números." />
                : cq.cetAnnualPct <= num(finRate)
                  ? <Verdict tone="good" title={`Mais barata que o financiamento: ${fmtPct(cq.cetAnnualPct)} a.a. contra ${finRateTxt}.`}>Com o crédito na mão hoje, como no financiamento. Confira a transferência na administradora antes de pagar o ágio.</Verdict>
                  : <Verdict tone="bad" title={`Mais cara que o financiamento: ${fmtPct(cq.cetAnnualPct)} a.a. contra ${finRateTxt}.`}>{maxEntry ? `Negocie o ágio para até ${fmt(maxEntry)}.` : 'Mesmo sem ágio as parcelas já custam mais que o financiamento.'}</Verdict>}
            </>
          ) : <Verdict tone="info" title="Preencha crédito, parcela e parcelas restantes da cota anunciada." />}
        </>
      )}

      {/* ═══ QUITAR FINANCIAMENTO ═══ */}
      {tab === 'payoff' && (
        <>
          <Card title="O financiamento de hoje">
            {financings.length > 0 && (
              <div>
                <label className={labelCls}>Usar um financiamento meu</label>
                <select className={inputCls} value={finId} onChange={e => chooseFinancing(e.target.value)}>
                  <option value="">Digitar manualmente…</option>
                  {financings.map(f => <option key={f.id} value={f.id}>{f.name.trim()} — saldo {fmt(Number(f.remaining_balance))}</option>)}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Field label="Saldo para quitar" value={poBalance} onChange={setPoBalance} suffix="R$" hint="Peça o valor de quitação ao banco" />
              <Field label="Juros" value={poRateMonth} onChange={v => { setPoRateMonth(v); setPoRealInstallments(null); }} suffix="% a.m." />
              <Field label="Parcelas restantes" value={poMonths} onChange={v => { setPoMonths(v); setPoRealInstallments(null); }} integer />
              <div>
                <label className={labelCls}>Sistema</label>
                <Seg value={poSystem} onChange={v => { setPoSystem(v); setPoRealInstallments(null); }} options={[{ value: 'PRICE', label: 'PRICE' }, { value: 'SAC', label: 'SAC' }]} />
              </div>
            </div>
            {poRealInstallments && (
              <p className="text-[11px] text-emerald-700 font-bold">
                Usando as {poRealInstallments.length} parcelas reais cadastradas ({fmt(poRealInstallments[0])} → {fmt(poRealInstallments[poRealInstallments.length - 1])}), no lugar de taxa e sistema.
              </p>
            )}
          </Card>
          <Card title="O consórcio que quita">
            <button onClick={usePlanForPayoff} className="text-[11px] font-black text-brand-600 hover:text-brand-800">↳ Usar o resultado da aba Lance (crédito líquido, lance do bolso e parcela depois)</button>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Field label="Crédito líquido liberado" value={poNetCredit} onChange={setPoNetCredit} suffix="R$" />
              <Field label="Lance pago do bolso" value={poOwnBid} onChange={setPoOwnBid} suffix="R$" />
              <Field label="Parcela do consórcio" value={poInst} onChange={setPoInst} suffix="R$" />
              <Field label="Parcelas do consórcio" value={poConsMonths} onChange={setPoConsMonths} integer />
            </div>
          </Card>
          {num(poBalance) > 0 && num(poNetCredit) > 0 ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat label="Capital livre gerado" value={fmt(payoff.freeCapital - num(poOwnBid))} sub={`crédito ${fmt(num(poNetCredit))} − quitação ${fmt(num(poBalance))} − lance ${fmt(num(poOwnBid))}`} strong />
                <Stat label="Parcela: hoje → depois" value={`${fmt(payoff.financing.firstInstallment)} → ${fmt(num(poInst))}`} sub={payoff.monthlyDifference >= 0 ? `sobra ${fmt(payoff.monthlyDifference)}/mês` : `${fmt(-payoff.monthlyDifference)}/mês a mais`} />
                <Stat label="Custo hoje (valor presente)" value={fmt(payoff.pvCostKeepFinancing)} sub={`total nominal ${fmt(payoff.financing.totalPaid)}`} />
                <Stat label="Custo trocando (valor presente)" value={fmt(payoff.pvCostSwitch)} sub={`parcelas ${fmt(payoff.consortiumTotal)} (com reajuste)`} />
              </div>
              {payoff.freeCapital < 0 && <Verdict tone="bad" title={`O crédito não cobre a quitação: faltam ${fmt(-payoff.freeCapital)}.`} />}
              {payoff.advantage >= 0
                ? <Verdict tone="good" title={`Trocar compensa: ${fmt(payoff.advantage)} a menos em valor presente.`}>Já contando o capital livre que sobra e o rendimento do dinheiro a {oppTxt}.</Verdict>
                : <Verdict tone="warn" title={`Trocar custa ${fmt(-payoff.advantage)} a mais em valor presente.`}>Considere se o capital livre ({fmt(payoff.freeCapital - num(poOwnBid))}) vai render mais que {oppTxt} — por exemplo, num imóvel que gera aluguel. Se render, a troca pode compensar mesmo assim.</Verdict>}
            </>
          ) : <Verdict tone="info" title="Preencha o saldo do financiamento e o crédito líquido do consórcio." />}
        </>
      )}

      {/* ═══ VÁRIAS COTAS ═══ */}
      {tab === 'portfolio' && (
        <PortfolioTab consortiums={consortiums} consLiabs={consLiabs} index={index} insurance={insurance} opportunity={opportunity}
          setIndex={setIndex} setInsurance={setInsurance} setOpportunity={setOpportunity} />
      )}

      {/* ═══ VENDER COTA ═══ */}
      {tab === 'sale' && (
        <>
          <Card title="O que você já pagou">
            <div>
              <label className={labelCls}>Pagamentos</label>
              <select className={inputCls} value={saleSource} onChange={e => chooseSaleSource(e.target.value)}>
                <option value="">Digitar manualmente…</option>
                {consortiums.map(c => <option key={c.id} value={c.id}>{c.name} (pagamentos reais)</option>)}
              </select>
            </div>
            {!saleSource ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Field label="Parcela paga" value={manualInst} onChange={setManualInst} suffix="R$" />
                <Field label="Meses pagos" value={manualMonths} onChange={setManualMonths} integer />
                <div><label className={labelCls}>1ª parcela em</label><DateInput className={inputCls} value={manualStart} onChange={e => setManualStart(e.target.value)} /></div>
                <Field label="Lance pago do bolso" value={manualBid} onChange={setManualBid} suffix="R$" />
              </div>
            ) : (
              <p className="text-[11px] text-slate-500">
                {salePayments === null ? 'Carregando pagamentos…' : `${salePayments.length} pagamentos, total ${fmt(sale.invested)} — parcelas e lance do bolso (o embutido não conta, saiu da carta).`}
              </p>
            )}
          </Card>
          <Card title="A venda">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Field label="Preço de venda" value={salePrice} onChange={setSalePrice} suffix="R$" />
              <div><label className={labelCls}>Data da venda</label><DateInput className={inputCls} value={saleDate} onChange={e => setSaleDate(e.target.value)} /></div>
              <Field label="Rendimento do seu dinheiro" value={opportunity} onChange={setOpportunity} suffix="% a.a." />
            </div>
          </Card>
          {sale.invested > 0 && num(salePrice) > 0 && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat label="Lucro" value={fmt(sale.profit)} sub={`sobre ${fmt(sale.invested)} investidos`} strong />
                <Stat label="Lucro total" value={fmtPct(sale.profitPct)} />
                <Stat label="Rentabilidade mensal" value={`${fmtPct(sale.monthlyIrrPct, 3)} a.m.`} sub={sale.months < 6 ? 'Período curto: a taxa ao ano fica exagerada — olhe a ao mês e o lucro total' : `${fmtPct(sale.annualIrrPct)} a.a. · desde cada pagamento`} strong />
                <Stat label="Se tivesse aplicado" value={fmt(sale.opportunityValue)} sub={`a ${oppTxt}`} />
              </div>
              {sale.excessOverOpportunity >= 0
                ? <Verdict tone="good" title={`A venda rende ${fmt(sale.excessOverOpportunity)} a mais do que o dinheiro aplicado.`} />
                : <Verdict tone="warn" title={`O dinheiro aplicado teria rendido ${fmt(-sale.excessOverOpportunity)} a mais.`}>Para empatar com a aplicação, venda por pelo menos {fmt(sale.opportunityValue)}.</Verdict>}
            </>
          )}
          <Card title="Preço para a rentabilidade que você quer">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
              <Field label="Meta de lucro" value={targetPct} onChange={setTargetPct} suffix="%" />
              <div className="lg:col-span-2">
                <label className={labelCls}>A meta é</label>
                <Seg value={targetBasis} onChange={setTargetBasis} options={[{ value: 'MONTHLY', label: '% ao mês' }, { value: 'TOTAL', label: '% total' }]} />
              </div>
              <Stat label="Preço mínimo de venda" value={fmt(target)} sub={targetBasis === 'MONTHLY' ? 'Cada pagamento rendendo a meta desde a data em que foi pago' : `Pago ${fmt(sale.invested)} + ${fmtPct(num(targetPct))}`} strong />
            </div>
          </Card>
        </>
      )}

      {/* Referências */}
      <div className="bg-slate-50 border border-slate-100 rounded-[24px]">
        <button onClick={() => setShowRefs(v => !v)} className="w-full flex items-center justify-between p-5 text-left">
          <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Referências de mercado e como o simulador calcula</span>
          <ChevronDown size={16} className={`text-slate-400 transition-transform ${showRefs ? 'rotate-180' : ''}`} />
        </button>
        {showRefs && (
          <div className="px-5 pb-5 space-y-3 text-xs text-slate-600 leading-relaxed">
            <ul className="list-disc pl-4 space-y-1.5">
              <li><strong>Taxa de administração:</strong> média da Abac de 0,073% ao mês (~17,5% em 20 anos); faixa comum de 13% a 25% da carta. <a className="text-brand-600 underline" href="https://www.infomoney.com.br/minhas-financas/custos-do-consorcio/" target="_blank" rel="noreferrer">InfoMoney</a> · <a className="text-brand-600 underline" href="https://www.c6bank.com.br/blog/taxa-de-administracao-consorcio" target="_blank" rel="noreferrer">C6 Bank</a></li>
              <li><strong>Fundo de reserva:</strong> geralmente 0% a 3% da carta; parte volta no encerramento do grupo.</li>
              <li><strong>Lance embutido:</strong> a maioria dos grupos aceita até ~25–30% da carta; o contrato define. <a className="text-brand-600 underline" href="https://www.serasa.com.br/credito/blog/lance-embutido-consorcio/" target="_blank" rel="noreferrer">Serasa</a></li>
              <li><strong>Lance vencedor:</strong> não há estatística pública confiável — use o resultado das últimas assembleias do seu grupo (menor e médio vencedores).</li>
              <li><strong>Lance não é investimento:</strong> é adiantar parcelas; o custo é o rendimento que o dinheiro deixa de ter. Ele compensa quando ter o bem antes vale mais (aluguel economizado, juros evitados). <a className="text-brand-600 underline" href="https://www.serasa.com.br/blog/consorcio-ou-financiamento-comparativo/" target="_blank" rel="noreferrer">Serasa</a></li>
              <li><strong>Índices (out/2026):</strong> Selic 13,75% a.a. e CDI 13,65% a.a.; INCC 6,66% em 12 meses (set/2026). <a className="text-brand-600 underline" href="https://brasilindicadores.com.br/selic/" target="_blank" rel="noreferrer">Brasil Indicadores</a> · <a className="text-brand-600 underline" href="https://www.partnr.ai/indicadores/incc" target="_blank" rel="noreferrer">INCC</a></li>
            </ul>
            <p><strong>Como calcula:</strong> o plano é um % da carta (100% + taxa de administração + fundo de reserva), amortizado mês a mês e corrigido pelo índice todo ano. Parcela reduzida: a diferença é redistribuída nos meses depois de contemplar. Lance livre sai do bolso; embutido sai da carta (crédito líquido = carta − embutido). Comparações em valor presente pela taxa de rendimento informada; o "custo efetivo após contemplar" é a TIR do saldo financiado.</p>
            <p className="text-slate-400">Muitos números de mercado vêm de blogs de instituições com interesse comercial. Para decidir, use a proposta e o contrato da administradora.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConsortiumSimulator;
