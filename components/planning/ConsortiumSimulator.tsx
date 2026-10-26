import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calculator, Gavel, BadgeCheck, Landmark, HandCoins, Info, CheckCircle2, AlertTriangle, XCircle, ChevronDown,
  Layers, Plus, Copy, Trash2, Sparkles, Mic, MicOff, Send, Loader2, Save, FileSpreadsheet, FileText, FolderOpen
} from 'lucide-react';
import { supabase } from '../../lib/supabase/client';
import { getSessionUser } from '../../lib/session';
import { DateUtils } from '../../lib/dateUtils';
import { DateInput } from '../common/DateInput';
import { sanitizeMoneyTyping, parseMoneyInput } from '../../lib/moneyInput';
import { authHeaders } from '../../lib/apiClient';
import {
  QuotaDraft, KnownConsortium, SimulationState, blankQuota, newQuotaKey, applyAiSimulation, matchesQuotaDescription, availableCredit, paidBids
} from '../../lib/consortiumSimState';
import { exportSimulationXlsx, exportSimulationPdf } from '../../lib/consortiumSimExport';
import {
  simulatePlan, simulateFinancing, evaluateBid, evaluateContemplatedQuota, evaluatePayoff,
  evaluateSale, targetSalePrice, lotteryOdds, bidChance, baseInstallmentValue, installmentsToPct,
  monthlyToAnnualPct, annualToMonthly, existingQuotaPlan, aggregatePlans, evaluatePayoffPortfolio, manualContemplatedPlan, capitalCoverage, BidMode, AmortizationSystem, PlanResult, SaleFlow, PlanInput
} from '../../lib/consortiumSimulator';

/**
 * Simulador de consórcio (Planejamento). Só calcula — não grava nada.
 * O motor está em lib/consortiumSimulator.ts (testado em
 * tests/consortiumSimulator.test.ts); aqui ficam os campos, o pré-preenchimento
 * com os consórcios e financiamentos cadastrados e a leitura dos resultados.
 */

type SimTab = 'plan' | 'bid' | 'portfolio' | 'contemplated' | 'payoff' | 'sale';
type BidUnit = 'PCT' | 'BRL' | 'INST';
interface SavedSimulation { id: string; name: string; savedAt: string; state: SimulationState }

const readSaved = (): SavedSimulation[] => {
  try { const v = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
};
const writeSaved = (list: SavedSimulation[]) => { try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch { /* opcional */ } };

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
  id: string; name: string; administrator_name?: string | null; liability_id: string | null;
  group_number?: string | null; quota_number?: string | null; credit_letter_value: number; total_months: number;
  admin_fee_pct: number; reserve_fund_pct: number; insurance_monthly_amount: number; status: string; metadata: any;
}
interface FinancingRow {
  id: string; name: string; remaining_balance: number; installment_amount: number; installments_remaining: number;
  interest_rate: number | null; metadata: any;
}

// ─── Peças de interface ─────────────────────────────────────────────────────
const inputCls = 'w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-brand-500 transition-all';
const labelCls = 'block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5';

/** Rótulo com "?" que abre a explicação do campo (o que é, onde achar, exemplo). */
const HelpLabel: React.FC<{ label: string; help?: React.ReactNode }> = ({ label, help }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex items-start justify-between gap-1.5 mb-1.5">
        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest leading-snug">{label}</label>
        {help && (
          <button type="button" onClick={() => setOpen(o => !o)} aria-label={`O que é: ${label}`} aria-expanded={open}
            className={`shrink-0 w-5 h-5 -mt-0.5 rounded-full border text-[10px] font-black leading-none flex items-center justify-center transition-colors ${open ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-sky-600 border-sky-200 hover:bg-sky-50'}`}>?</button>
        )}
      </div>
      {open && help && <div className="mb-2 p-2.5 rounded-xl bg-sky-50 border border-sky-100 text-[11px] text-sky-900 leading-snug space-y-1">{help}</div>}
    </>
  );
};

const Field: React.FC<{
  label: string; value: string; onChange: (v: string) => void; suffix?: string; hint?: string; integer?: boolean; placeholder?: string;
  help?: React.ReactNode; warn?: string | null;
}> = ({ label, value, onChange, suffix, hint, integer, placeholder, help, warn }) => (
  <div data-field>
    <HelpLabel label={label} help={help} />
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
    {warn && <p className="text-[10px] font-bold text-amber-700 mt-1 leading-snug flex gap-1"><AlertTriangle size={11} className="shrink-0 mt-px" />{warn}</p>}
  </div>
);

/** "Como usar" de cada aba: para que serve sempre visível, passo a passo recolhível. */
const TabGuide: React.FC<{ id: string; purpose: string; steps: React.ReactNode[] }> = ({ id, purpose, steps }) => {
  const key = `finvision_consortium_sim_guide_${id}`;
  const [open, setOpen] = useState<boolean>(() => { try { return localStorage.getItem(key) !== 'closed'; } catch { return true; } });
  const toggle = () => setOpen(o => { try { localStorage.setItem(key, o ? 'closed' : 'open'); } catch { /* opcional */ } return !o; });
  return (
    <div className="bg-sky-50/60 border border-sky-100 rounded-[20px] p-4 space-y-2">
      <div className="flex items-start gap-2.5">
        <Info size={16} className="text-sky-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-sky-900 leading-relaxed"><strong>Para que serve:</strong> {purpose}</p>
          <button type="button" onClick={toggle} className="mt-1 text-[11px] font-black text-sky-700 hover:text-sky-900">{open ? 'Esconder o passo a passo' : 'Ver o passo a passo'}</button>
        </div>
      </div>
      {open && (
        <ol className="list-decimal pl-9 space-y-1 text-[11px] text-sky-900 leading-relaxed">
          {steps.map((st, i) => <li key={i}>{st}</li>)}
        </ol>
      )}
    </div>
  );
};

// ─── Explicação de cada campo ───────────────────────────────────────────────
const H = {
  quota: <><p><strong>Cota nova:</strong> simula uma compra — você digita os números da proposta.</p><p><strong>Minha cota:</strong> puxa do seu cadastro o saldo devedor, as parcelas que faltam e a parcela de hoje, e simula daqui para frente.</p></>,
  credit: <><p>Valor do crédito da cota — o que ela libera para comprar o bem.</p><p><strong>Onde achar:</strong> proposta ou contrato ("crédito", "valor do bem", "carta").</p><p>Ex.: 200.000</p></>,
  term: <><p>Quantas parcelas tem o plano, em meses.</p><p><strong>Onde achar:</strong> proposta ("prazo"). Se a cota entra num grupo já andando, use as parcelas que faltam.</p><p>Ex.: 200</p></>,
  adm: <><p>Taxa de administração <strong>total</strong> do plano, em % da carta (não é ao mês).</p><p><strong>Onde achar:</strong> contrato ou proposta. Se vier "ao mês", multiplique pelo prazo.</p><p>Ex.: 18 (= 18% da carta). Mercado: 13% a 25%.</p></>,
  fr: <><p>Fundo de reserva total, em % da carta. Cobre inadimplência do grupo; parte pode voltar no fim.</p><p><strong>Onde achar:</strong> contrato. Se não tiver, use 0.</p><p>Ex.: 2</p></>,
  index: <><p>Quanto a carta e as parcelas sobem por ano (reajuste do contrato).</p><p><strong>Imóvel:</strong> INCC (6,66% nos últimos 12 meses). <strong>Veículo:</strong> IPCA ou tabela do fabricante.</p><p>Use o índice do seu contrato; 0 para simular sem reajuste.</p></>,
  reduced: <><p>Alguns planos cobram parcela menor até contemplar (ex.: 50% ou 70% da cheia). Coloque esse %.</p><p>Depois de contemplar, o que ficou faltando é dividido nas parcelas restantes — a parcela sobe.</p><p>Plano normal: 100.</p></>,
  insurance: <><p>Seguro prestamista, em % <strong>ao mês</strong> sobre o saldo devedor. Costuma entrar depois de contemplar.</p><p><strong>Onde achar:</strong> boleto ou contrato ("seguro").</p><p>Ex.: 0,03. Sem seguro: 0.</p></>,
  opportunity: <><p>Quanto o seu dinheiro rende aplicado, já <strong>sem imposto</strong>.</p><p>É a régua para saber se vale antecipar pagamento (lance) ou deixar o dinheiro rendendo.</p><p>CDI de 13,65% − 15% de IR ≈ 11,6.</p></>,
  balance: <><p>Quanto falta pagar hoje, em R$.</p><p><strong>Onde achar:</strong> extrato ou app da administradora ("saldo devedor").</p></>,
  remaining: <><p>Quantas parcelas ainda faltam.</p><p><strong>Onde achar:</strong> extrato da administradora.</p></>,
  installment: <><p>Valor da próxima parcela, de preferência sem o seguro.</p><p><strong>Onde achar:</strong> último boleto.</p><p>Se a parcela é reduzida, o simulador divide o restante depois de contemplar.</p></>,
  kMonth: <><p>Em que mês você espera ser contemplado <strong>sem lance</strong> (sorteio).</p><p>Sem ideia? Na aba Lance, informe as cotas e sorteios do grupo e o simulador estima.</p></>,
  finRate: <><p>Custo total ao ano (CET) de um financiamento do mesmo valor — está na simulação do banco.</p><p>Ex.: 12 (= 12% ao ano).</p></>,
  finSystem: <><p><strong>SAC:</strong> parcela começa maior e vai caindo. <strong>PRICE:</strong> parcela igual do começo ao fim.</p></>,
  bidUnit: <><p>Como a administradora pede o lance: em % da carta, em reais, ou em <strong>número de parcelas</strong> (Ademicon, por exemplo).</p><p>Em parcelas, informe o prazo-base do grupo.</p></>,
  baseTerm: <><p>Prazo original do grupo, usado para transformar "nº de parcelas" em valor.</p><p><strong>Onde achar:</strong> proposta. Ademicon: 240.</p></>,
  freeBid: <><p>Parte do lance paga com o <strong>seu dinheiro</strong> (boleto).</p><p>Sai do seu bolso e abate o saldo devedor.</p></>,
  embBid: <><p>Parte do lance que sai da <strong>própria carta</strong> — você não paga, mas recebe menos crédito.</p><p>Limite comum: 25% a 30% da carta (veja no contrato).</p></>,
  bidMonth: <><p>Daqui a quantos meses você daria o lance. 1 = próxima assembleia.</p></>,
  bidMode: <><p>O que a administradora faz com o lance:</p><p><strong>Parcela:</strong> o prazo continua e as parcelas ficam menores.</p><p><strong>Prazo:</strong> a parcela volta a ser a cheia e o plano termina antes.</p><p>Pergunte qual vale no seu grupo.</p></>,
  activeQuotas: <><p>Quantas cotas ativas o grupo tem.</p><p><strong>Onde achar:</strong> resultado da assembleia ou app da administradora.</p></>,
  lotteryPer: <><p>Quantas cotas são sorteadas em cada assembleia (normalmente 1 ou 2).</p></>,
  lotteryMonth: <><p>Quando você acha que seria sorteado sem lance. Com cotas e sorteios preenchidos, o simulador estima sozinho.</p></>,
  minWin: <><p>O <strong>menor</strong> lance que ganhou nas últimas assembleias, em % da carta.</p><p><strong>Onde achar:</strong> resultado da assembleia.</p></>,
  avgWin: <><p>O lance <strong>médio</strong> que ganhou nas últimas assembleias, em % da carta.</p></>,
  benefit: <><p>Quanto você ganha por mês tendo o bem antes: aluguel que deixa de pagar, aluguel que passa a receber ou juros que deixa de pagar.</p><p>É isso que paga o lance. Sem esse ganho, antecipar costuma não compensar.</p></>,
  qName: <><p>Um nome para reconhecer a cota (ex.: "Ademicon 560 A").</p></>,
  cqCredit: <><p>Crédito que a cota contemplada libera para você usar agora.</p></>,
  cqEntry: <><p>Quanto você paga ao vendedor pela cota (ágio ou entrada).</p></>,
  cqFee: <><p>Taxa da administradora para transferir a cota para o seu nome. Veja no anúncio ou pergunte à administradora.</p></>,
  cqInst: <><p>Valor da parcela atual da cota anunciada.</p></>,
  cqMonths: <><p>Quantas parcelas faltam para quitar a cota anunciada.</p></>,
  finPick: <><p>Escolha um financiamento seu: o simulador puxa o saldo e as <strong>parcelas reais</strong> cadastradas.</p></>,
  poBalance: <><p>Quanto custa quitar hoje. Peça ao banco o <strong>saldo devedor para quitação</strong> — é menor que a soma das parcelas, porque tira os juros futuros.</p></>,
  poRate: <><p>Juros do contrato, em % ao mês. Só é usado se não houver parcelas reais cadastradas.</p></>,
  poMonths: <><p>Quantas parcelas do financiamento faltam.</p></>,
  poNetCredit: <><p>Crédito do consórcio que vai para a quitação: carta menos o lance embutido.</p><p>Dica: use o botão "Usar o resultado da aba Lance".</p></>,
  poOwnBid: <><p>Lance pago do seu bolso para contemplar a cota.</p></>,
  poInst: <><p>Parcela do consórcio depois de contemplar.</p></>,
  poConsMonths: <><p>Quantas parcelas do consórcio ficam depois de contemplar.</p></>,
  poSource: <><p><strong>Cotas de "Várias cotas":</strong> usa as cotas que você montou lá — novas ou suas (as suas puxam saldo, parcelas restantes e parcela do cadastro). Marque quais entram na quitação.</p><p><strong>Digitar:</strong> informe um consórcio só, à mão.</p></>,
  renovation: <><p>Quanto do capital livre vai para reforma (ou outro uso). O resto fica investido.</p><p>No consórcio de imóvel, reforma costuma ser aceita com comprovação — confirme com a administradora.</p></>,
  investRate: <><p>Quanto o dinheiro que sobra rende aplicado, já sem imposto. Ex.: CDI de 13,65% − 15% de IR ≈ 11,6.</p></>,
  extraIncome: <><p>Se a reforma aumenta o aluguel (ou gera outra renda), quanto entra a mais por mês. Esse valor ajuda a pagar as parcelas.</p></>,
  salePick: <><p>Escolha sua cota para puxar os pagamentos reais — inclusive os antigos, lançados antes do cadastro com a descrição "Grupo X cota Y". Ou digite à mão.</p></>,
  manualInst: <><p>Valor da parcela que você pagou (média, se mudou).</p></>,
  manualMonths: <><p>Quantas parcelas você já pagou.</p></>,
  manualStart: <><p>Data da primeira parcela paga — conta para a rentabilidade ao mês.</p></>,
  manualBid: <><p>Lance que você pagou do bolso (o embutido não entra, saiu da carta).</p></>,
  salePrice: <><p>Quanto o comprador vai pagar a você pela cota.</p></>,
  saleDate: <><p>Quando você vai receber o valor da venda.</p></>,
  targetPct: <><p>O lucro que você quer ter: em % ao mês ou % total.</p></>,
  targetBasis: <><p><strong>% ao mês:</strong> como se cada pagamento estivesse aplicado desde a data em que foi pago.</p><p><strong>% total:</strong> sobre a soma do que você pagou, sem olhar o tempo.</p></>
};

// ─── Avisos de valores fora do comum ────────────────────────────────────────
const W = {
  adm: (v: number) => v > 30 ? 'Acima do comum (13% a 25%). Confira se não é taxa ao mês ou ao ano.' : v > 0 && v < 5 ? 'Muito baixa para o total do plano — confira no contrato.' : null,
  term: (v: number) => v > 240 ? 'Prazo acima de 240 meses é raro — confira.' : null,
  fr: (v: number) => v > 5 ? 'Acima do comum (0% a 3%) — confira.' : null,
  reduced: (v: number) => v > 0 && v < 30 ? 'Parcela muito reduzida — confira na proposta.' : null,
  insurance: (v: number) => v > 0.2 ? 'Seguro costuma ficar entre 0,02% e 0,08% ao mês — confira se não digitou em R$.' : null,
  opportunity: (v: number) => v > 20 ? 'Acima de 20% ao ano é raro — use o rendimento líquido de IR.' : null,
  index: (v: number) => v > 15 ? 'Reajuste muito alto — o INCC dos últimos 12 meses foi 6,66%.' : null,
  balance: (balance: number, credit: number) => credit > 0 && balance > credit * 1.6 ? 'Saldo acima de 160% da carta — confira no extrato.' : null,
  emb: (pct: number) => pct > 30 ? 'Embutido acima de 30% da carta — a maioria dos grupos não aceita.' : null
};

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
const PORTFOLIO_KEY = 'finvision_consortium_sim_portfolio';
const SAVED_KEY = 'finvision_consortium_sim_saved';
const newKey = newQuotaKey;

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
  quotas: QuotaDraft[];
  setQuotas: React.Dispatch<React.SetStateAction<QuotaDraft[]>>;
  index: string; insurance: string; opportunity: string;
  setIndex: (v: string) => void; setInsurance: (v: string) => void; setOpportunity: (v: string) => void;
  focusKey?: string | null;
}> = ({ consortiums, consLiabs, quotas, setQuotas, index, insurance, opportunity, setIndex, setInsurance, setOpportunity, focusKey }) => {
  // Veio da quitação ("Simular a contemplação"): rola até a cota e destaca.
  useEffect(() => {
    if (!focusKey) return;
    const el = typeof document !== 'undefined' ? document.getElementById(`quota-${focusKey}`) : null;
    try { el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { /* sem rolagem */ }
  }, [focusKey]);
  const [saved, setSaved] = useState<SavedSimulation[]>(readSaved);
  const [saveName, setSaveName] = useState('');
  const [exporting, setExporting] = useState<'' | 'xlsx' | 'pdf'>('');
  const [notice, setNotice] = useState('');

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
    const av = availableCredit(c);
    update(key, {
      source: id, name: c.name,
      credit: toText(av.credit), term: String(c.total_months || ''),
      // Já contemplada: o lance já foi registrado — não lança de novo; crédito disponível agora.
      ...(av.contemplated ? { free: '0', emb: '0', month: '1' } : {}),
      adm: toText(Number(c.admin_fee_pct)), fr: toText(Number(c.reserve_fund_pct)),
      balance: l ? toText(Number(l.remaining_balance)) : '', remaining: l ? String(l.installments_remaining || '') : '',
      installment: l ? toText(Number(l.installment_amount)) : ''
    });
  };

  const shared = { index: num(index), insurance: num(insurance) };
  const results = useMemo(() => quotas.map(q => simulatePlan(draftToPlan(q, shared), num(opportunity))), [quotas, index, insurance, opportunity]);
  const agg = useMemo(() => aggregatePlans(results), [results]);
  const unitSuffix = (u: BidUnit) => u === 'PCT' ? '%' : u === 'BRL' ? 'R$' : 'parc.';

  const title = saveName.trim() || quotas.map(q => q.name).join(' + ').slice(0, 60) || 'Simulação';
  const saveCurrent = () => {
    const entry: SavedSimulation = {
      id: newKey(), name: title, savedAt: new Date().toISOString(),
      state: { premises: { index, insurance, opportunity }, quotas }
    };
    const list = [entry, ...saved.filter(s => s.name !== entry.name)].slice(0, 30);
    setSaved(list); writeSaved(list); setSaveName('');
    setNotice(`Simulação "${entry.name}" salva neste aparelho.`);
  };
  const openSaved = (s: SavedSimulation) => {
    setQuotas(s.state.quotas.length ? s.state.quotas : [blankQuota(1)]);
    setIndex(s.state.premises.index); setInsurance(s.state.premises.insurance); setOpportunity(s.state.premises.opportunity);
    setSaveName(s.name);
    setNotice(`Simulação "${s.name}" aberta.`);
  };
  const deleteSaved = (id: string) => { const list = saved.filter(s => s.id !== id); setSaved(list); writeSaved(list); };
  const doExport = async (kind: 'xlsx' | 'pdf') => {
    setExporting(kind);
    try {
      const input = { title, premises: { index, insurance, opportunity }, quotas, results, summaries: agg.quotas, total: agg.total, monthly: agg.monthly };
      if (kind === 'xlsx') await exportSimulationXlsx(input); else await exportSimulationPdf(input);
      setNotice(kind === 'xlsx' ? 'Planilha gerada.' : 'PDF gerado.');
    } catch {
      setNotice('Não foi possível gerar o arquivo. Tente de novo.');
    } finally { setExporting(''); }
  };

  return (
    <div className="space-y-6">
      <TabGuide id="portfolio"
        purpose="juntar várias cotas — novas e suas — cada uma com o próprio lance, e ver o detalhe de cada uma e o total (como a proposta do corretor)."
        steps={[
          'Ajuste as premissas (reajuste, seguro, rendimento) — valem para todas as cotas.',
          'Em cada cota, escolha "Cota nova" (digite os números da proposta) ou uma cota sua (puxa o saldo de hoje).',
          'Informe o lance: em % da carta, R$ ou nº de parcelas; quanto do bolso, quanto embutido, daqui a quantos meses contempla e se abate parcela ou prazo.',
          'Use "Adicionar cota" ou "Duplicar" para montar a operação inteira.',
          'Confira o total: crédito liberado, saque líquido e a soma das parcelas antes e depois.',
          'Salve com um nome (fica neste aparelho) ou exporte planilha/PDF para enviar. Também dá para pedir tudo à IA, lá em cima.'
        ]} />

      <Card title="Premissas para todas as cotas">
        <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field help={H.index} warn={W.index(num(index))} label="Reajuste anual" value={index} onChange={setIndex} suffix="% a.a." hint="INCC 12m: 6,66% (set/26)" />
          <Field help={H.insurance} warn={W.insurance(num(insurance))} label="Seguro prestamista" value={insurance} onChange={setInsurance} suffix="% a.m." hint="Sobre o saldo, após contemplar" />
          <Field help={H.opportunity} warn={W.opportunity(num(opportunity))} label="Rendimento do seu dinheiro" value={opportunity} onChange={setOpportunity} suffix="% a.a." hint={`CDI ${fmtPct(DEFAULT_CDI)} − IR`} />
        </div>
      </Card>

      {quotas.map((q, i) => {
        const r = results[i];
        const sum = agg.quotas[i];
        const existing = !!q.source;
        const srcConsortium = existing ? consortiums.find(c => c.id === q.source) : undefined;
        const srcAv = srcConsortium ? availableCredit(srcConsortium) : null;
        return (
          <div key={q.key} id={`quota-${q.key}`} className={`scroll-mt-4 rounded-[24px] ${focusKey === q.key ? 'ring-2 ring-amber-400' : ''}`}>
          <Card title={`Cota ${i + 1}`}>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="flex-1">
                <HelpLabel label="Nome" help={H.qName} />
                <input className={inputCls} value={q.name} onChange={e => update(q.key, { name: e.target.value })} />
              </div>
              <div className="flex-1">
                <HelpLabel label="Cota" help={H.quota} />
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

            {srcAv?.contemplated && (
              <p className="text-[11px] leading-relaxed p-2.5 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-900">
                <strong>Já contemplada</strong>{srcAv.netCredit ? <> — crédito líquido {fmt(srcAv.netCredit)} (carta − embutido)</> : null}. O lance já foi registrado:
                {' '}deixe o lance em 0 e "contempla daqui a" em 1 (crédito disponível agora). Saldo, parcelas e parcela vêm do cadastro.
                <span className="block mt-1">
                  <strong>Crédito ≠ saldo devedor:</strong> o crédito ({fmt(num(q.credit))}) é o dinheiro que a cota libera para você usar;
                  {' '}o saldo devedor ({fmt(num(q.balance))}) é o que você ainda deve, pago em {num(q.remaining)} parcelas de {fmt(num(q.installment))}.
                </span>
              </p>
            )}
            <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3">
              <Field help={H.credit} label={existing ? (srcAv?.contemplated ? 'Crédito disponível (líquido)' : 'Carta (contratada)') : 'Carta de crédito'} value={q.credit} onChange={v => update(q.key, { credit: v })} suffix="R$" />
              {existing ? (
                <>
                  <Field help={H.balance} warn={W.balance(num(q.balance), num(q.credit))} label="Saldo devedor hoje" value={q.balance} onChange={v => update(q.key, { balance: v })} suffix="R$" />
                  <Field help={H.remaining} label="Parcelas restantes" value={q.remaining} onChange={v => update(q.key, { remaining: v })} integer />
                  <Field help={H.installment} label="Parcela atual" value={q.installment} onChange={v => update(q.key, { installment: v })} suffix="R$" />
                </>
              ) : (
                <>
                  <Field help={H.term} warn={W.term(num(q.term))} label="Prazo" value={q.term} onChange={v => update(q.key, { term: v })} suffix="meses" integer />
                  <Field help={H.reduced} warn={W.reduced(num(q.reduced))} label="Parcela até contemplar" value={q.reduced} onChange={v => update(q.key, { reduced: v })} suffix="%" />
                </>
              )}
              <Field help={H.adm} warn={W.adm(num(q.adm))} label="Taxa de adm. (total)" value={q.adm} onChange={v => update(q.key, { adm: v })} suffix="%" />
              <Field help={H.fr} warn={W.fr(num(q.fr))} label="Fundo de reserva" value={q.fr} onChange={v => update(q.key, { fr: v })} suffix="%" />
            </div>

            <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="col-span-2">
                <HelpLabel label="Lance em" help={H.bidUnit} />
                <Seg value={q.unit} onChange={(v: BidUnit) => update(q.key, { unit: v })} options={[{ value: 'PCT', label: '% da carta' }, { value: 'BRL', label: 'R$' }, { value: 'INST', label: 'Nº de parcelas' }]} />
              </div>
              {q.unit === 'INST' && <Field help={H.baseTerm} label="Prazo-base do grupo" value={q.baseTerm} onChange={v => update(q.key, { baseTerm: v })} suffix="meses" integer />}
              <Field help={H.freeBid} label="Lance do bolso" value={q.free} onChange={v => update(q.key, { free: v })} suffix={unitSuffix(q.unit)} />
              <Field help={H.embBid} label="Lance embutido" value={q.emb} onChange={v => update(q.key, { emb: v })} suffix={unitSuffix(q.unit)} />
              <Field help={H.bidMonth} label="Contempla daqui a" value={q.month} onChange={v => update(q.key, { month: v })} suffix="meses" integer />
              <div>
                <HelpLabel label="Lance abate" help={H.bidMode} />
                <Seg value={q.mode} onChange={(v: BidMode) => update(q.key, { mode: v })} options={[{ value: 'REDUCE_INSTALLMENT', label: 'Parcela' }, { value: 'REDUCE_TERM', label: 'Prazo' }]} />
              </div>
            </div>

            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest pt-1">
              {srcAv?.contemplated ? 'Situação de hoje (já contemplada)' : `Como fica a carta depois de contemplar (daqui a ${sum.contemplationMonth} ${sum.contemplationMonth === 1 ? 'mês' : 'meses'})`}
            </p>
            <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Crédito líquido" value={fmt(sum.netCredit)} sub={sum.bidEmbedded > 0 ? `carta ${fmt(sum.credit)} − embutido ${fmt(sum.bidEmbedded)}` : `carta na contemplação ${fmt(sum.credit)}`} strong />
              <Stat label="Lance do bolso" value={fmt(sum.bidCash)} sub={sum.bidEmbedded > 0 ? `+ embutido ${fmt(sum.bidEmbedded)}` : undefined} />
              <Stat label="Saque líquido" value={fmt(sum.netCash)} sub="crédito líquido − lance do bolso" />
              <Stat label="Saldo devedor: antes → depois" value={`${fmt(r.balanceBeforeBid)} → ${fmt(r.balanceAfterBid)}`} sub="o que ainda deve, antes e depois do lance" />
              <Stat label="Parcela: antes → depois" value={`${fmt(sum.initialInstallment)} → ${fmt(sum.postInstallment)}`} sub={`depois: ${sum.monthsAfter} meses`} />
            </div>
            {existing && !srcAv?.contemplated && sum.bidCash + sum.bidEmbedded === 0 && (
              <Verdict tone="info" title="Sem lance: o simulador considera contemplação por sorteio no mês informado.">Para usar esta cota antes, informe o lance (do bolso e/ou embutido) e daqui a quantos meses — a carta, o saldo e a parcela acima se ajustam.</Verdict>
            )}
            {r.warnings.map((w, k) => <Verdict key={k} tone="warn" title={w} />)}
          </Card>
          </div>
        );
      })}

      <button type="button" onClick={add} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-slate-200 text-xs font-black text-slate-500 hover:border-brand-300 hover:text-brand-700">
        <Plus size={14} /> Adicionar cota
      </button>

      <Card title={`Total das ${quotas.length} cotas`}>
        <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Crédito contratado" value={fmt(agg.total.credit)} />
          <Stat label="Lance total" value={fmt(agg.total.bidCash + agg.total.bidEmbedded)} sub={`do bolso ${fmt(agg.total.bidCash)} · embutido ${fmt(agg.total.bidEmbedded)}`} />
          <Stat label="Crédito liberado" value={fmt(agg.total.netCredit)} strong />
          <Stat label="Saque líquido" value={fmt(agg.total.netCash)} strong />
          <Stat label="Parcela inicial (soma)" value={fmt(agg.total.initialInstallment)} />
          <Stat label="Parcela depois (soma)" value={fmt(agg.total.postInstallment)} sub="cada cota depois da sua contemplação" />
          <Stat label="Total que sai do bolso" value={fmt(agg.total.totalCashOut)} sub="parcelas + seguro + lances do bolso" />
          <Stat label="Até quitar tudo" value={`${agg.monthly.length} meses`} />
        </div>
        {agg.total.netCash > 0 && (() => {
          const lastK = Math.max(1, ...agg.quotas.map(sq => sq.contemplationMonth));
          const cov = capitalCoverage(agg.total.netCash, num(opportunity), agg.monthly.slice(lastK));
          return (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3 text-[11px] text-emerald-900 leading-relaxed">
              <strong>Se investir o saque líquido ({fmt(agg.total.netCash)}) a {fmtPct(num(opportunity))} a.a.:</strong> rende {fmt(cov.monthlyIncome)} por mês —
              {' '}{fmtPct(cov.coveragePct, 0)} da soma das parcelas depois de contemplar ({fmt(agg.monthly[lastK] || 0)}) — e cobre as parcelas
              {' '}{cov.coversAll ? <>todas, sobrando {fmt(cov.leftover)}</> : <>por {cov.monthsCovered} meses</>}.
              {' '}Para quitar um financiamento ou reformar com essas cartas, use a aba "Quitar financiamento".
            </div>
          );
        })()}

        {/* Celular: um cartão por cota; tela maior: tabela. Sem rolagem lateral. */}
        <div className="md:hidden space-y-2">
          {agg.quotas.map((sq, i) => (
            <div key={quotas[i].key} className="rounded-2xl border border-slate-100 p-3 text-[11px] text-slate-600">
              <p className="font-black text-slate-900 text-xs mb-1.5 break-words">{quotas[i].name}</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <span>Crédito</span><span className="text-right font-bold text-slate-800">{fmt(sq.credit)}</span>
                <span>Lance bolso</span><span className="text-right font-bold text-slate-800">{fmt(sq.bidCash)}</span>
                <span>Embutido</span><span className="text-right font-bold text-slate-800">{fmt(sq.bidEmbedded)}</span>
                <span>Crédito líquido</span><span className="text-right font-bold text-slate-800">{fmt(sq.netCredit)}</span>
                <span>Saque líquido</span><span className="text-right font-bold text-slate-800">{fmt(sq.netCash)}</span>
                <span>Parcela inicial</span><span className="text-right font-bold text-slate-800">{fmt(sq.initialInstallment)}</span>
                <span>Parcela depois</span><span className="text-right font-bold text-slate-800">{fmt(sq.postInstallment)}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="hidden md:block">
          <table className="w-full text-[11px]">
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

      <Card title="Salvar e exportar">
        <div className="flex flex-col sm:flex-row gap-2">
          <input className={inputCls} placeholder={title} value={saveName} onChange={e => setSaveName(e.target.value)} />
          <div className="flex gap-2 flex-wrap">
            <button type="button" onClick={saveCurrent} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-600 text-white text-xs font-black"><Save size={14} />Salvar</button>
            <button type="button" onClick={() => doExport('xlsx')} disabled={!!exporting} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-black text-slate-600 disabled:opacity-50">
              {exporting === 'xlsx' ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}Planilha
            </button>
            <button type="button" onClick={() => doExport('pdf')} disabled={!!exporting} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-black text-slate-600 disabled:opacity-50">
              {exporting === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}PDF
            </button>
          </div>
        </div>
        {notice && <p className="text-[11px] font-bold text-emerald-700">{notice}</p>}
        <p className="text-[10px] text-slate-400">As simulações ficam salvas neste aparelho — nada vai para os seus dados do app. A planilha e o PDF podem ser enviados para quem você quiser.</p>
        {saved.length > 0 && (
          <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl">
            {saved.map(sv => (
              <div key={sv.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-black text-slate-800 truncate">{sv.name}</p>
                  <p className="text-[10px] text-slate-400">{new Date(sv.savedAt).toLocaleString('pt-BR')} · {sv.state.quotas.length} cota(s)</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button type="button" onClick={() => openSaved(sv)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-600"><FolderOpen size={12} />Abrir</button>
                  <button type="button" onClick={() => deleteSaved(sv.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600" aria-label="Excluir"><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
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

// ─── Assistente (IA) ────────────────────────────────────────────────────────
interface ChatTurn { role: 'user' | 'assistant'; text: string }

const SimAssistant: React.FC<{
  buildContext: () => { state: unknown; known: KnownConsortium[] };
  onApply: (ai: any) => void;
}> = ({ buildContext, onApply }) => {
  const [text, setText] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  const SR = typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;

  const toggleVoice = () => {
    if (!SR) return;
    if (listening) { try { recRef.current?.stop(); } catch { /* já parou */ } return; }
    try {
      const rec = new SR();
      rec.lang = 'pt-BR';
      rec.interimResults = true;
      rec.continuous = false;
      const base = text ? `${text.trim()} ` : '';
      rec.onresult = (e: any) => {
        const said = Array.from(e.results).map((r: any) => r[0]?.transcript || '').join('');
        setText(base + said);
      };
      rec.onerror = () => setListening(false);
      rec.onend = () => setListening(false);
      recRef.current = rec;
      rec.start();
      setListening(true);
    } catch { setListening(false); }
  };

  const send = async (msg?: string) => {
    const message = (msg ?? text).trim();
    if (!message || busy) return;
    setBusy(true); setError('');
    try { recRef.current?.stop(); } catch { /* sem voz */ }
    const history = turns.slice(-6);
    setTurns(t => [...t, { role: 'user', text: message }]);
    setText('');
    try {
      const { state, known } = buildContext();
      const res = await fetch('/api/consortium-sim-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ message, history, state, known, today: DateUtils.formatToISODate() })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Não consegui montar a simulação agora.');
      onApply(data);
      setTurns(t => [...t, { role: 'assistant', text: String(data.reply || 'Simulação atualizada.') }]);
    } catch (err: any) {
      setError(err?.message || 'Não consegui montar a simulação agora.');
    } finally { setBusy(false); }
  };

  const examples = [
    'Monte com as minhas cotas e um lance de 30% do bolso daqui a 3 meses',
    'Quero 2 cotas da Ademicon de R$ 174.647,06, grupo 560, prazo 128 meses, lance de 60 parcelas embutidas e 65 pagas no 1º mês'
  ];

  return (
    <div className="bg-white border-2 border-brand-100 rounded-[24px] p-5 space-y-3 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center"><Sparkles size={16} /></div>
        <div>
          <p className="text-sm font-black text-slate-900">Peça a simulação para a IA</p>
          <p className="text-[11px] text-slate-500">Escreva ou fale o que quer. A IA monta as cotas e os lances; as contas são do simulador. Depois é só ajustar à mão ou pedir outra mudança.</p>
        </div>
      </div>

      {turns.length > 0 && (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {turns.map((t, i) => (
            <div key={i} className={`text-xs leading-relaxed rounded-2xl px-3 py-2 ${t.role === 'user' ? 'bg-slate-100 text-slate-700 ml-8' : 'bg-brand-50 text-brand-900 mr-8'}`}>
              {t.text}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 items-end">
        <textarea
          className={`${inputCls} min-h-[72px] resize-y font-medium`}
          placeholder={'Ex.: "Simule 2 cotas novas da Ademicon de 174 mil com lance embutido de 60 parcelas e veja junto com a minha 570-807"'}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }}
        />
        <div className="flex flex-col gap-2">
          {SR && (
            <button type="button" onClick={toggleVoice} aria-label={listening ? 'Parar de ouvir' : 'Falar'}
              className={`w-11 h-11 rounded-xl flex items-center justify-center border ${listening ? 'bg-rose-600 text-white border-rose-600 animate-pulse' : 'bg-white text-slate-600 border-slate-200'}`}>
              {listening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
          )}
          <button type="button" onClick={() => send()} disabled={busy || !text.trim()} aria-label="Simular"
            className="w-11 h-11 rounded-xl flex items-center justify-center bg-brand-600 text-white disabled:opacity-40">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>
      {listening && <p className="text-[11px] font-bold text-rose-600">Ouvindo… fale o que quer simular.</p>}
      {!SR && <p className="text-[10px] text-slate-400">Para falar, use o microfone do teclado do celular.</p>}
      {error && <p className="text-[11px] font-bold text-rose-600">{error}</p>}
      {turns.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {examples.map(ex => (
            <button key={ex} type="button" onClick={() => setText(ex)} className="text-left text-[11px] px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100 text-slate-500 hover:text-brand-700">{ex}</button>
          ))}
        </div>
      )}
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
  const [poSource, setPoSource] = useState<'PORTFOLIO' | 'MANUAL'>('PORTFOLIO');
  const [poExcluded, setPoExcluded] = useState<string[]>([]);
  const [focusQuota, setFocusQuota] = useState<string | null>(null);
  const goToQuota = (key: string) => { setFocusQuota(key); setTab('portfolio'); };
  const [poRenovation, setPoRenovation] = useState('0');
  const [poInvestRate, setPoInvestRate] = useState('');
  const [poExtraIncome, setPoExtraIncome] = useState('0');

  // Vender cota
  const [saleSource, setSaleSource] = useState('');
  const [salePayments, setSalePayments] = useState<SaleFlow[] | null>(null);
  // Pagamentos antigos sem vínculo com o consórcio (achados pela descrição "Grupo X cota Y").
  const [saleHistory, setSaleHistory] = useState<SaleFlow[]>([]);
  const [includeHistory, setIncludeHistory] = useState(true);
  const [manualInst, setManualInst] = useState('');
  const [manualMonths, setManualMonths] = useState('');
  const [manualStart, setManualStart] = useState(DateUtils.formatToISODate());
  const [manualBid, setManualBid] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [saleDate, setSaleDate] = useState(DateUtils.formatToISODate());
  const [targetPct, setTargetPct] = useState('1');
  const [targetBasis, setTargetBasis] = useState<'MONTHLY' | 'TOTAL'>('MONTHLY');

  const [showRefs, setShowRefs] = useState(false);

  // Cotas da aba "Várias cotas" — aqui em cima para a IA também montar.
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

  // Consórcios e financiamentos cadastrados (para pré-preencher).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!supabase) return;
        const user = await getSessionUser(supabase);
        if (!user) return;
        const [cRes, lRes] = await Promise.all([
          supabase.from('consortiums').select('id, name, administrator_name, group_number, quota_number, liability_id, credit_letter_value, total_months, admin_fee_pct, reserve_fund_pct, insurance_monthly_amount, status, metadata').eq('user_id', user.id).order('name'),
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
  // Cotas da aba "Várias cotas", simuladas com as premissas atuais.
  const portfolioResults = useMemo(
    () => quotas.map(q => simulatePlan(draftToPlan(q, { index: num(index), insurance: num(insurance) }), num(opportunity))),
    [quotas, index, insurance, opportunity]
  );
  const poPicked = poSource === 'PORTFOLIO'
    ? quotas.map((q, i) => ({ q, r: portfolioResults[i] })).filter(x => !poExcluded.includes(x.q.key))
    : [];
  const poQuotas: PlanResult[] = poSource === 'PORTFOLIO'
    ? poPicked.map(x => x.r)
    : (num(poNetCredit) > 0 ? [manualContemplatedPlan({ netCredit: num(poNetCredit), ownBid: num(poOwnBid), installment: num(poInst), months: num(poConsMonths), annualIndexPct: num(index) })] : []);
  // Cotas que você já tem: a parcela delas já é paga hoje (entra nos dois caminhos).
  const poCommitted = poSource === 'PORTFOLIO' ? poPicked.map(x => !!x.q.source) : [false];
  // Lances que já foram pagos nas cotas contempladas usadas (custo passado: só informativo).
  const poPastBids = poPicked.reduce((acc, x) => {
    const src = x.q.source ? consortiums.find(c => c.id === x.q.source) : undefined;
    if (!src || !availableCredit(src).contemplated) return acc;
    const b = paidBids(src.metadata);
    return { cash: acc.cash + b.cash, embedded: acc.embedded + b.embedded };
  }, { cash: 0, embedded: 0 });
  const payoff = useMemo(() => poQuotas.length && num(poBalance) > 0 ? evaluatePayoffPortfolio({
    financingBalance: num(poBalance),
    financingInstallments: poRealInstallments || undefined,
    financingRatePctMonth: num(poRateMonth),
    financingMonths: num(poMonths),
    financingSystem: poSystem,
    quotas: poQuotas,
    committed: poCommitted,
    opportunityPctYear: num(opportunity),
    renovation: num(poRenovation),
    investRatePctYear: poInvestRate.trim() ? num(poInvestRate) : num(opportunity),
    extraMonthlyIncome: num(poExtraIncome)
  }) : null, [poQuotas, poBalance, poRateMonth, poMonths, poSystem, poRealInstallments, opportunity, poRenovation, poInvestRate, poExtraIncome]);

  // ── Vender cota ──
  const chooseSaleSource = async (id: string) => {
    setSaleSource(id);
    setSalePayments(null);
    setSaleHistory([]);
    const c = consortiums.find(x => x.id === id);
    if (!c || !supabase) return;
    const paidValue = (t: any) => t.is_paid ? (Number(t.paid_amount) > 0 ? Number(t.paid_amount) : Number(t.amount)) : Number(t.paid_amount || 0);
    try {
      const user = await getSessionUser(supabase);
      const [linkedRes, oldRes] = await Promise.all([
        c.liability_id
          ? supabase.from('transactions').select('date, paid_at, amount, paid_amount, is_paid, is_deleted, type, metadata')
            .eq('liability_id', c.liability_id).order('date', { ascending: true })
          : Promise.resolve({ data: [] as any[] }),
        user && c.group_number && c.quota_number
          ? supabase.from('transactions').select('date, paid_at, amount, paid_amount, is_paid, is_deleted, type, description, metadata')
            .eq('user_id', user.id).is('liability_id', null).eq('type', 'EXPENSE').ilike('description', `%${c.quota_number}%`)
            .order('date', { ascending: true })
          : Promise.resolve({ data: [] as any[] })
      ]);
      // Só o que saiu do bolso: parcelas e lance pago. Embutido saiu da carta.
      const pays = ((linkedRes as any).data || []).filter((t: any) => t.is_deleted !== true && t.type === 'EXPENSE'
          && t.metadata?.bid_part !== 'EMBEDDED' && t.metadata?.isCapitalized !== true)
        .map((t: any) => ({ date: String(t.paid_at || t.date).slice(0, 10), amount: paidValue(t) }))
        .filter((p: SaleFlow) => p.amount > 0);
      // Pagamentos de antes do cadastro, lançados sem vínculo — só leitura, nada é alterado.
      const old = ((oldRes as any).data || []).filter((t: any) => t.is_deleted !== true
          && matchesQuotaDescription(t.description, c.group_number!, c.quota_number!))
        .map((t: any) => ({ date: String(t.paid_at || t.date).slice(0, 10), amount: paidValue(t) }))
        .filter((p: SaleFlow) => p.amount > 0);
      setSaleHistory(old);
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
  const payments = saleSource ? [...(salePayments || []), ...(includeHistory ? saleHistory : [])] : manualPayments;
  const sumFlows = (list: SaleFlow[]) => list.reduce((s, p) => s + p.amount, 0);
  const saleQuota = consortiums.find(x => x.id === saleSource);
  const sale = useMemo(() => evaluateSale(payments, num(salePrice), saleDate, num(opportunity)), [payments, salePrice, saleDate, opportunity]);
  const target = useMemo(() => targetSalePrice(payments, saleDate, num(targetPct), targetBasis), [payments, saleDate, targetPct, targetBasis]);

  const selectQuota = (id: string) => {
    setQuotaId(id);
    const c = consortiums.find(x => x.id === id);
    if (!c) return;
    const av = availableCredit(c);
    setCredit(toText(av.credit));
    if (av.contemplated) { setFreeBid('0'); setEmbBid('0'); setBidMonth('1'); setKMonth('1'); }
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

  const knownConsortiums: KnownConsortium[] = consortiums.map(c => {
    const l = c.liability_id ? consLiabs[c.liability_id] : undefined;
    const av = availableCredit(c);
    return {
      id: c.id, name: c.name, administrator: c.administrator_name || null, status: c.status,
      contemplated: av.contemplated, netCredit: av.netCredit,
      credit: Number(c.credit_letter_value) || 0, totalMonths: Number(c.total_months) || 0,
      adminFeePct: Number(c.admin_fee_pct) || 0, reserveFundPct: Number(c.reserve_fund_pct) || 0,
      balance: l ? Number(l.remaining_balance) : null, remainingMonths: l ? Number(l.installments_remaining) : null,
      currentInstallment: l ? Number(l.installment_amount) : null
    };
  });
  const buildAiContext = () => {
    const shared = { index: num(index), insurance: num(insurance) };
    const res = quotas.map(q => simulatePlan(draftToPlan(q, shared), num(opportunity)));
    const agg = aggregatePlans(res);
    const r2 = (v: number) => Math.round(v * 100) / 100;
    return {
      known: knownConsortiums,
      state: {
        premises: { indexPct: num(index), insurancePct: num(insurance), opportunityPct: num(opportunity) },
        quotas: quotas.map((q, i) => ({
          name: q.name, source: q.source || undefined,
          credit: num(q.credit), termMonths: q.source ? undefined : num(q.term), adminFeePct: num(q.adm), reserveFundPct: num(q.fr),
          reducedPct: q.source ? undefined : num(q.reduced),
          balance: q.source ? num(q.balance) : undefined, remainingMonths: q.source ? num(q.remaining) : undefined,
          currentInstallment: q.source ? num(q.installment) : undefined,
          bidUnit: q.unit, baseTermMonths: num(q.baseTerm), freeBid: num(q.free), embeddedBid: num(q.emb),
          contemplationInMonths: num(q.month), bidMode: q.mode,
          resultado: {
            creditoLiquido: r2(agg.quotas[i].netCredit), saqueLiquido: r2(agg.quotas[i].netCash),
            parcelaInicial: r2(agg.quotas[i].initialInstallment), parcelaDepois: r2(agg.quotas[i].postInstallment), mesesDepois: agg.quotas[i].monthsAfter
          }
        })),
        total: { creditoLiberado: r2(agg.total.netCredit), saqueLiquido: r2(agg.total.netCash), parcelaInicial: r2(agg.total.initialInstallment), parcelaDepois: r2(agg.total.postInstallment) }
      }
    };
  };
  const applyAi = (ai: any) => {
    const next = applyAiSimulation(ai, { premises: { index, insurance, opportunity }, quotas }, knownConsortiums);
    setQuotas(next.quotas);
    setIndex(next.premises.index); setInsurance(next.premises.insurance); setOpportunity(next.premises.opportunity);
    if (Array.isArray(ai?.quotas) && ai.quotas.length) setTab('portfolio');
  };

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
          As comparações usam valor presente pelo rendimento do seu dinheiro: o caminho que custa menos em dinheiro de hoje é o melhor. É só simulação: nada muda nos seus dados do app (dá para salvar a simulação neste aparelho e exportar).
        </p>
      </div>

      <SimAssistant buildContext={buildAiContext} onApply={applyAi} />

      {/* Abas em grade: sem barra de rolagem, se ajustam à largura da tela. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center justify-center gap-1.5 px-2 py-2.5 min-h-[44px] rounded-xl text-xs font-black text-center leading-tight border transition-all ${tab === t.id ? 'bg-brand-600 text-white border-brand-600 shadow' : 'bg-white text-slate-500 border-slate-200 hover:text-slate-900'}`}>
            <span className="shrink-0">{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'plan' && (
        <TabGuide id="plan"
          purpose="ver quanto custa uma cota (nova ou sua): parcela antes e depois de contemplar, total pago e se sai mais barato que um financiamento."
          steps={[
            'Em "Cota", escolha "Cota nova" ou uma cota sua (puxa saldo, parcelas e parcela de hoje).',
            'Cota nova: preencha carta, prazo, taxa de administração e fundo de reserva — estão na proposta. Toque no "?" de cada campo se tiver dúvida.',
            'Reajuste, seguro e rendimento já vêm com valores de mercado; troque pelos do seu contrato se souber.',
            'Diga em que mês espera ser contemplado e a taxa do financiamento que quer comparar.',
            'Leia os resultados e o veredito; o gráfico mostra a parcela mês a mês (toque para ver o valor).'
          ]} />
      )}
      {tab === 'bid' && (
        <TabGuide id="bid"
          purpose="decidir se vale dar lance, de quanto, e ver o crédito líquido, o saque líquido e a parcela depois."
          steps={[
            'Preencha o "Plano da cota" (ou escolha uma cota sua).',
            'Em "O lance": como a administradora pede (% da carta, R$ ou nº de parcelas), quanto é do bolso, quanto é embutido, em quantos meses e se abate parcela ou prazo.',
            'Em "O grupo": cotas ativas, sorteios por assembleia e os lances vencedores — estão no resultado da assembleia. Servem para estimar a chance.',
            'Informe quanto você ganha por mês tendo o bem antes (aluguel, juros evitados) — é isso que paga o lance.',
            'Leia o "lance livre máximo que compensa", a chance e o veredito.'
          ]} />
      )}

      {/* ═══ PLANO ═══ */}
      {(tab === 'plan' || tab === 'bid') && (
        <Card title="Plano da cota">
          <div>
            <HelpLabel label="Cota" help={H.quota} />
            <select className={inputCls} value={quotaId} onChange={e => selectQuota(e.target.value)}>
              <option value="">Cota nova (simular uma compra)</option>
              {consortiums.map(c => <option key={c.id} value={c.id}>{c.name} — minha cota, situação de hoje</option>)}
            </select>
            {existing && <p className="text-[10px] text-slate-400 mt-1">Parte do saldo devedor, das parcelas restantes e da parcela de hoje (do seu cadastro). Os meses contam a partir de agora.</p>}
          </div>
          {existing && selectedQuota && selectedQuota.status !== 'WAITING' && (
            <Verdict tone="info" title={`Esta cota já está contemplada${availableCredit(selectedQuota).netCredit ? `: crédito líquido ${fmt(availableCredit(selectedQuota).netCredit!)}` : ''}.`}>
              O lance já foi registrado (não lance de novo). O simulador usa o crédito disponível, o saldo de hoje e as parcelas que faltam.
            </Verdict>
          )}
          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field help={H.credit} label={existing ? 'Carta (crédito contratado)' : 'Carta de crédito'} value={credit} onChange={setCredit} suffix="R$" />
            {existing ? (
              <>
                <Field help={H.balance} warn={W.balance(num(exBalance), num(credit))} label="Saldo devedor hoje" value={exBalance} onChange={setExBalance} suffix="R$" hint="Confira no extrato da administradora" />
                <Field help={H.remaining} label="Parcelas restantes" value={exRemaining} onChange={setExRemaining} integer />
                <Field help={H.installment} label="Parcela atual" value={exInstallment} onChange={setExInstallment} suffix="R$" hint="Se reduzida, o resto é dividido depois de contemplar" />
              </>
            ) : (
              <Field help={H.term} warn={W.term(num(term))} label="Prazo" value={term} onChange={setTerm} suffix="meses" integer />
            )}
            <Field help={H.adm} warn={W.adm(num(adm))} label="Taxa de adm. (total)" value={adm} onChange={setAdm} suffix="%" hint={existing ? 'Do plano — usada no lance em nº de parcelas' : 'Mercado: 13% a 25% da carta'} />
            <Field help={H.fr} warn={W.fr(num(fr))} label="Fundo de reserva" value={fr} onChange={setFr} suffix="%" hint={existing ? 'Do plano' : 'Comum: 0% a 3%'} />
            <Field help={H.index} warn={W.index(num(index))} label="Reajuste anual" value={index} onChange={setIndex} suffix="% a.a." hint="INCC 12m: 6,66% (set/26)" />
            {!existing && <Field help={H.reduced} warn={W.reduced(num(reduced))} label="Parcela até contemplar" value={reduced} onChange={setReduced} suffix="%" hint="100 = cheia; 50/70 = reduzida" />}
            <Field help={H.insurance} warn={W.insurance(num(insurance))} label="Seguro prestamista" value={insurance} onChange={setInsurance} suffix="% a.m." hint="Sobre o saldo, após contemplar" />
            <Field help={H.opportunity} warn={W.opportunity(num(opportunity))} label="Rendimento do seu dinheiro" value={opportunity} onChange={setOpportunity} suffix="% a.a." hint={`CDI ${fmtPct(DEFAULT_CDI)} − IR`} />
          </div>
        </Card>
      )}

      {tab === 'plan' && (
        <>
          <Card title="Contemplação e comparação">
            <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3">
              <Field help={H.kMonth} label={`Contemplação ${monthWord}`} value={kMonth} onChange={setKMonth} suffix="meses" integer hint="Sem lance (sorteio)" />
              <Field help={H.finRate} label="Financiamento alternativo" value={finRate} onChange={setFinRate} suffix="% a.a." hint="CET da proposta do banco" />
              <div className="col-span-2">
                <HelpLabel label="Sistema do financiamento" help={H.finSystem} />
                <Seg value={finSystem} onChange={setFinSystem} options={[{ value: 'SAC', label: 'SAC' }, { value: 'PRICE', label: 'PRICE' }]} />
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3">
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
                <HelpLabel label="Como a administradora oferta o lance" help={H.bidUnit} />
                <Seg value={bidUnit} onChange={setBidUnit} options={[{ value: 'PCT', label: '% da carta' }, { value: 'BRL', label: 'R$' }, { value: 'INST', label: 'Nº de parcelas' }]} />
                {bidUnit === 'INST' && (
                  <Field help={H.baseTerm} label="Prazo-base do grupo" value={baseTerm} onChange={setBaseTerm} suffix="meses" integer
                    hint={`1 parcela de lance = ${fmt(unitValue)} (carta × ${fmtPct(planPctValue, 0)} ÷ ${num(baseTerm) || 0}). Ex.: Ademicon usa o prazo original do grupo.`} />
                )}
              </div>
              <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-3">
                <Field help={H.freeBid} label="Lance do bolso (livre)" value={freeBid} onChange={setFreeBid} suffix={bidUnit === 'PCT' ? '%' : bidUnit === 'BRL' ? 'R$' : 'parc.'} hint={fmt(planBase.credit * freePct / 100)} />
                <Field help={H.embBid} warn={W.emb(embPct)} label="Lance embutido" value={embBid} onChange={setEmbBid} suffix={bidUnit === 'PCT' ? '%' : bidUnit === 'BRL' ? 'R$' : 'parc.'} hint={`${fmt(planBase.credit * embPct / 100)} — sai da carta (até ~30%)`} />
                <Field help={H.bidMonth} label={`Dar o lance ${monthWord}`} value={bidMonth} onChange={setBidMonth} suffix="meses" integer />
                <div>
                  <HelpLabel label="Lance abate" help={H.bidMode} />
                  <Seg value={bidMode} onChange={setBidMode} options={[{ value: 'REDUCE_INSTALLMENT', label: 'Parcela' }, { value: 'REDUCE_TERM', label: 'Prazo' }]} />
                </div>
              </div>
            </div>
          </Card>

          <Card title="O grupo e o seu ganho em antecipar">
            <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-3 gap-3">
              <Field help={H.activeQuotas} label="Cotas ativas no grupo" value={activeQuotas} onChange={setActiveQuotas} integer hint="Na assembleia da administradora" />
              <Field help={H.lotteryPer} label="Sorteios por assembleia" value={lotteryPer} onChange={setLotteryPer} integer />
              <Field help={H.lotteryMonth} label={`Sorteio esperado ${monthWord}`} value={lotteryMonthTxt} onChange={setLotteryMonthTxt} integer
                hint={expectedLotteryMonth ? `Pelo grupo: ~mês ${expectedLotteryMonth}` : `Sem dados: usando mês ${lotteryMonth}`} placeholder={String(lotteryMonth)} />
              <Field help={H.minWin} label="Menor lance vencedor" value={minWin} onChange={setMinWin} suffix="%" hint="Últimas assembleias" />
              <Field help={H.avgWin} label="Lance médio vencedor" value={avgWin} onChange={setAvgWin} suffix="%" hint="Últimas assembleias" />
              <Field help={H.benefit} label="Ganho por mês com o bem antes" value={benefit} onChange={setBenefit} suffix="R$" hint="Aluguel economizado, aluguel recebido ou juros que deixa de pagar" />
            </div>
          </Card>

          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3">
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
          <TabGuide id="contemplated"
            purpose="avaliar uma cota já contemplada à venda — o crédito sai na hora, como num financiamento — e descobrir o ágio máximo que vale pagar."
            steps={[
              'Preencha os dados do anúncio: crédito disponível, ágio/entrada, taxa de transferência, parcela atual e parcelas restantes.',
              'Informe a taxa do financiamento que você conseguiria, para comparar.',
              'Leia o custo efetivo (CET) e o "ágio máximo que vale"; acima dele, o financiamento sai mais barato.'
            ]} />
          <Card title="Cota já contemplada à venda">
            <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-3 gap-3">
              <Field help={H.cqCredit} label="Crédito disponível" value={cqCredit} onChange={setCqCredit} suffix="R$" />
              <Field help={H.cqEntry} label="Entrada / ágio ao vendedor" value={cqEntry} onChange={setCqEntry} suffix="R$" />
              <Field help={H.cqFee} label="Taxa de transferência" value={cqFee} onChange={setCqFee} suffix="R$" />
              <Field help={H.cqInst} label="Parcela atual" value={cqInst} onChange={setCqInst} suffix="R$" />
              <Field help={H.cqMonths} label="Parcelas restantes" value={cqMonths} onChange={setCqMonths} integer />
              <Field help={H.finRate} label="Financiamento alternativo" value={finRate} onChange={setFinRate} suffix="% a.a." />
            </div>
            <p className="text-[10px] text-slate-400">As parcelas são reajustadas todo ano pelo índice do plano ({fmtPct(num(index))} a.a.).</p>
          </Card>
          {num(cqCredit) > 0 && num(cqInst) > 0 && num(cqMonths) > 0 ? (
            <>
              <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3">
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
          <TabGuide id="payoff"
            purpose="ver se vale quitar um financiamento com uma ou mais cartas de consórcio (suas ou novas), quanto a parcela muda, quanto capital livre sobra e se ele, investido, paga as parcelas."
            steps={[
              'Escolha um financiamento seu (puxa saldo e parcelas reais) ou digite. Peça ao banco o saldo para quitação.',
              'Em "As cotas que quitam", use as cotas de "Várias cotas" (marque quais entram) — as suas puxam saldo e parcelas do cadastro — ou digite um consórcio.',
              'A quitação acontece no mês em que a última carta sai; até lá o financiamento continua e o simulador mostra quanto você paga dos dois.',
              'Em "O que fazer com o capital que sobra": quanto vai para reforma, quanto o investido rende e se há renda a mais (aluguel).',
              'Leia o capital livre, o dinheiro novo, a parcela de hoje × depois, se o rendimento paga as parcelas e o veredito em valor presente.'
            ]} />
          <Card title="O financiamento de hoje">
            {financings.length > 0 && (
              <div>
                <HelpLabel label="Usar um financiamento meu" help={H.finPick} />
                <select className={inputCls} value={finId} onChange={e => chooseFinancing(e.target.value)}>
                  <option value="">Digitar manualmente…</option>
                  {financings.map(f => <option key={f.id} value={f.id}>{f.name.trim()} — saldo {fmt(Number(f.remaining_balance))}</option>)}
                </select>
              </div>
            )}
            <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3">
              <Field help={H.poBalance} label="Saldo para quitar" value={poBalance} onChange={setPoBalance} suffix="R$" hint="Peça o valor de quitação ao banco" />
              <Field help={H.poRate} label="Juros" value={poRateMonth} onChange={v => { setPoRateMonth(v); setPoRealInstallments(null); }} suffix="% a.m." />
              <Field help={H.poMonths} label="Parcelas restantes" value={poMonths} onChange={v => { setPoMonths(v); setPoRealInstallments(null); }} integer />
              <div>
                <HelpLabel label="Sistema" help={H.finSystem} />
                <Seg value={poSystem} onChange={v => { setPoSystem(v); setPoRealInstallments(null); }} options={[{ value: 'PRICE', label: 'PRICE' }, { value: 'SAC', label: 'SAC' }]} />
              </div>
            </div>
            {poRealInstallments && (
              <p className="text-[11px] text-emerald-700 font-bold">
                Usando as {poRealInstallments.length} parcelas reais cadastradas ({fmt(poRealInstallments[0])} → {fmt(poRealInstallments[poRealInstallments.length - 1])}), no lugar de taxa e sistema.
              </p>
            )}
          </Card>
          <Card title="As cotas que quitam">
            <div>
              <HelpLabel label="De onde vêm as cotas" help={H.poSource} />
              <Seg value={poSource} onChange={setPoSource} options={[{ value: 'PORTFOLIO', label: 'Cotas de "Várias cotas"' }, { value: 'MANUAL', label: 'Digitar' }]} />
            </div>
            {poSource === 'PORTFOLIO' ? (
              <div className="space-y-2">
                {quotas.map((q, i) => {
                  const r = portfolioResults[i];
                  const on = !poExcluded.includes(q.key);
                  const src = q.source ? consortiums.find(c => c.id === q.source) : undefined;
                  const contemplated = src ? availableCredit(src).contemplated : false;
                  const noBid = r.bidCash + r.bidEmbedded === 0;
                  const past = contemplated && src ? paidBids(src.metadata) : null;
                  const status = !q.source ? 'nova' : contemplated ? 'minha · já contemplada' : 'minha · aguardando contemplação';
                  return (
                    <div key={q.key} className={`p-3 rounded-xl border ${on ? 'border-brand-200 bg-brand-50/40' : 'border-slate-100'}`}>
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input type="checkbox" className="mt-0.5" checked={on}
                          onChange={e => setPoExcluded(list => e.target.checked ? list.filter(k => k !== q.key) : [...list, q.key])} />
                        <span className="min-w-0 text-[11px] text-slate-600 leading-relaxed">
                          <span className="block text-xs font-black text-slate-900 break-words">{q.name} <span className="font-bold text-slate-400">· {status}</span></span>
                          {contemplated
                            ? <>Crédito disponível <strong>{fmt(r.netCredit)}</strong> · parcela {fmt(r.postInstallment)} × {r.monthsAfterContemplation}
                              {past && past.cash + past.embedded > 0 && (
                                <span className="block mt-1 text-slate-500">
                                  Lance já dado: {fmt(past.cash)} do bolso{past.embedded > 0 ? <> + {fmt(past.embedded)} embutido (já descontado do crédito)</> : null}.
                                  {past.cash > 0 && <> Esse dinheiro deixou de render ≈ {fmt(past.cash * annualToMonthly(num(opportunity)))}/mês a {oppTxt} — mas já foi pago e não volta em nenhum dos dois caminhos, por isso não muda a comparação de hoje (está no resumo abaixo).</>}
                                </span>
                              )}</>
                            : <>Contempla daqui a {r.contemplationMonth} {r.contemplationMonth === 1 ? 'mês' : 'meses'}{noBid ? ' (sorteio, sem lance)' : <> com lance de {fmt(r.bidCash)} do bolso{r.bidEmbedded > 0 ? <> + {fmt(r.bidEmbedded)} embutido</> : null}</>}
                              {' '}→ crédito líquido <strong>{fmt(r.netCredit)}</strong> · saldo {fmt(r.balanceAfterBid)} · parcela {fmt(r.postInstallment)} × {r.monthsAfterContemplation}</>}
                        </span>
                      </label>
                      {!contemplated && (
                        <button type="button" onClick={() => goToQuota(q.key)} className="mt-2 ml-7 text-[11px] font-black text-brand-600 hover:text-brand-800">
                          {noBid && q.source ? '⚠ Simular a contemplação (lance e mês) desta cota' : 'Ajustar a contemplação desta cota'}
                        </button>
                      )}
                    </div>
                  );
                })}
                <button type="button" onClick={() => setTab('portfolio')} className="text-[11px] font-black text-brand-600 hover:text-brand-800">↳ Montar ou editar as cotas em "Várias cotas" (novas ou suas, com o lance de cada uma)</button>
              </div>
            ) : (
              <>
                <button onClick={usePlanForPayoff} className="text-[11px] font-black text-brand-600 hover:text-brand-800 text-left">↳ Usar o resultado da aba Lance (crédito líquido, lance do bolso e parcela depois)</button>
                <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3">
                  <Field help={H.poNetCredit} label="Crédito líquido liberado" value={poNetCredit} onChange={setPoNetCredit} suffix="R$" />
                  <Field help={H.poOwnBid} label="Lance pago do bolso" value={poOwnBid} onChange={setPoOwnBid} suffix="R$" />
                  <Field help={H.poInst} label="Parcela do consórcio" value={poInst} onChange={setPoInst} suffix="R$" />
                  <Field help={H.poConsMonths} label="Parcelas do consórcio" value={poConsMonths} onChange={setPoConsMonths} integer />
                </div>
              </>
            )}
          </Card>

          <Card title="O que fazer com o capital que sobra">
            <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-3 gap-3">
              <Field help={H.renovation} label="Usar em reforma" value={poRenovation} onChange={setPoRenovation} suffix="R$" hint="O resto fica investido" />
              <Field help={H.investRate} label="O investido rende" value={poInvestRate} onChange={setPoInvestRate} suffix="% a.a." placeholder={opportunity} hint="Líquido de IR" />
              <Field help={H.extraIncome} label="Renda a mais por mês" value={poExtraIncome} onChange={setPoExtraIncome} suffix="R$" hint="Ex.: aluguel maior depois da reforma" />
            </div>
            <p className="text-[10px] text-slate-400">O uso do crédito segue as regras da administradora: quitar financiamento e reforma (com comprovação) costumam ser aceitos; dinheiro livre na mão, não.</p>
          </Card>

          {payoff ? (
            <>
              <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat label={`Quitação no mês ${payoff.payoffMonth}`} value={fmt(payoff.owedAtPayoff)} sub={payoff.payoffMonth > 1 ? `quando a última carta sai; hoje ${fmt(num(poBalance))}` : `hoje ${fmt(num(poBalance))} + 1 mês de juros`} />
                <Stat label="Crédito liberado" value={fmt(payoff.netCredit)} sub={`${poQuotas.length} cota(s) · lances do bolso ${fmt(payoff.ownBid)}`} />
                <Stat label="Capital livre" value={fmt(payoff.freeCapital)} sub="crédito − quitação" strong />
                <Stat label="Dinheiro novo" value={fmt(payoff.newMoney)} sub="capital livre − lances do bolso" strong />
                <Stat label="Você paga por mês: hoje → depois" value={`${fmt(payoff.todayMonthly)} → ${fmt(payoff.consortiumAfter)}`}
                  sub={`${payoff.alreadyPaying > 0 ? `hoje: financiamento ${fmt(payoff.financingInstallment)} + cotas que já tem ${fmt(payoff.alreadyPaying)} · ` : ''}${payoff.monthlyDifference >= 0 ? `sobra ${fmt(payoff.monthlyDifference)}/mês` : `${fmt(-payoff.monthlyDifference)}/mês a mais`}`} />
                {payoff.payoffMonth > 1 && <Stat label={`Até o mês ${payoff.payoffMonth}`} value={`${fmt(payoff.bothBeforePayoff)}/mês`} sub="financiamento + consórcio juntos, até quitar" />}
                <Stat label="Custo mantendo (valor presente)" value={fmt(payoff.pvCostKeepFinancing)} sub={`parcelas ${fmt(payoff.financingTotal)}${poRealInstallments ? ` · juros implícitos ${fmtPct(payoff.impliedRatePctMonth, 3)} a.m.` : ''}`} />
                <Stat label="Custo trocando (valor presente)" value={fmt(payoff.pvCostSwitch)} sub={`parcelas do consórcio ${fmt(payoff.consortiumTotal)} (com reajuste)`} />
              </div>
              {payoff.freeCapital < 0 && <Verdict tone="bad" title={`O crédito não cobre a quitação: faltam ${fmt(-payoff.freeCapital)}.`}>Adicione outra cota ou aumente a carta em "Várias cotas".</Verdict>}
              {payoff.advantage >= 0
                ? <Verdict tone="good" title={`Trocar compensa: ${fmt(payoff.advantage)} a menos em valor presente.`}>Já contando o capital livre e o rendimento do dinheiro a {oppTxt}.</Verdict>
                : <Verdict tone="warn" title={`Trocar custa ${fmt(-payoff.advantage)} a mais em valor presente.`}>
                    {monthlyToAnnualPct(payoff.impliedRatePctMonth / 100) < num(opportunity)
                      ? <>O financiamento custa {fmtPct(payoff.impliedRatePctMonth, 2)} a.m. (≈ {fmtPct(monthlyToAnnualPct(payoff.impliedRatePctMonth / 100), 1)} a.a.), menos que o rendimento do dinheiro ({oppTxt}): pela conta, usar o crédito para quitá-lo vale menos que dar outro uso a ele. Mas o crédito do consórcio só pode ir para bem, reforma ou quitação — se não houver outro bem para comprar, quitar ainda alivia {fmt(Math.max(0, payoff.monthlyDifference))}/mês.</>
                      : <>Pode compensar se o capital livre render mais que {oppTxt} — por exemplo, numa reforma que aumenta o aluguel.</>}
                  </Verdict>}

              {poPastBids.cash + poPastBids.embedded > 0 && (
                <Verdict tone="info" title={`Lance que você já deu nas cotas usadas: ${fmt(poPastBids.cash)} do bolso${poPastBids.embedded > 0 ? ` + ${fmt(poPastBids.embedded)} embutido` : ''}.`}>
                  {poPastBids.embedded > 0 && <>O embutido já está descontado: o crédito acima é o líquido. </>}
                  {poPastBids.cash > 0 && <>O dinheiro do bolso deixou de render ≈ {fmt(poPastBids.cash * annualToMonthly(num(opportunity)))}/mês a {oppTxt}. Ele entra no custo de ter a cota, mas já foi pago: quitando ou não o financiamento, ele não volta — por isso a comparação acima olha só daqui para frente. </>}
                  Para ver se o lance valeu a pena, use a aba Lance (lá o dinheiro do bolso conta como custo, com o rendimento perdido).
                </Verdict>
              )}

              {payoff.freeCapital > 0 && (
                <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3">
                  <Stat label="Fica investido" value={fmt(payoff.invested)} sub={payoff.renovation > 0 ? `reforma ${fmt(payoff.renovation)}` : 'sem reforma'} />
                  <Stat label="Rende por mês" value={fmt(payoff.coverage.monthlyIncome)} sub={num(poExtraIncome) > 0 ? `inclui ${fmt(num(poExtraIncome))} de renda a mais` : `a ${fmtPct(poInvestRate.trim() ? num(poInvestRate) : num(opportunity))} a.a.`} strong />
                  <Stat label="Paga da parcela" value={fmtPct(payoff.coverage.coveragePct, 0)} sub={`da 1ª parcela do consórcio (${fmt(payoff.consortiumAfter)})`} />
                  <Stat label="Cobre as parcelas por" value={payoff.coverage.coversAll ? 'todas' : `${payoff.coverage.monthsCovered} meses`}
                    sub={payoff.coverage.coversAll ? `e ainda sobram ${fmt(payoff.coverage.leftover)}` : 'sacando todo mês do investido'} strong />
                </div>
              )}
            </>
          ) : <Verdict tone="info" title={poSource === 'PORTFOLIO' ? 'Preencha o saldo do financiamento e marque ao menos uma cota.' : 'Preencha o saldo do financiamento e o crédito líquido do consórcio.'} />}
        </>
      )}

      {/* ═══ VÁRIAS COTAS ═══ */}
      {tab === 'portfolio' && (
        <PortfolioTab consortiums={consortiums} consLiabs={consLiabs} quotas={quotas} setQuotas={setQuotas} index={index} insurance={insurance} opportunity={opportunity}
          setIndex={setIndex} setInsurance={setInsurance} setOpportunity={setOpportunity} focusKey={focusQuota} />
      )}

      {/* ═══ VENDER COTA ═══ */}
      {tab === 'sale' && (
        <>
          <TabGuide id="sale"
            purpose="ver o lucro de vender a sua cota — em reais, % total e % ao mês — e por quanto vender para ter a rentabilidade que você quer."
            steps={[
              'Escolha sua cota: o simulador soma os pagamentos reais, inclusive os antigos lançados antes do cadastro (você pode desmarcar). Ou digite parcela, meses e lance.',
              'Informe o preço e a data da venda.',
              'Leia o lucro, a rentabilidade ao mês e quanto o dinheiro teria rendido aplicado.',
              'Em "Preço para a rentabilidade que você quer", defina a meta (% ao mês ou total) para ver o preço mínimo.'
            ]} />
          <Card title="O que você já pagou">
            <div>
              <HelpLabel label="Pagamentos" help={H.salePick} />
              <select className={inputCls} value={saleSource} onChange={e => chooseSaleSource(e.target.value)}>
                <option value="">Digitar manualmente…</option>
                {consortiums.map(c => <option key={c.id} value={c.id}>{c.name} (pagamentos reais)</option>)}
              </select>
            </div>
            {!saleSource ? (
              <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3">
                <Field help={H.manualInst} label="Parcela paga" value={manualInst} onChange={setManualInst} suffix="R$" />
                <Field help={H.manualMonths} label="Meses pagos" value={manualMonths} onChange={setManualMonths} integer />
                <div><HelpLabel label="1ª parcela em" help={H.manualStart} /><DateInput className={inputCls} value={manualStart} onChange={e => setManualStart(e.target.value)} /></div>
                <Field help={H.manualBid} label="Lance pago do bolso" value={manualBid} onChange={setManualBid} suffix="R$" />
              </div>
            ) : (
              <div className="space-y-2 text-[11px] text-slate-600">
                {salePayments === null ? <p>Carregando pagamentos…</p> : (
                  <>
                    <p><strong>{salePayments.length}</strong> pagamentos vinculados ao consórcio: <strong>{fmt(sumFlows(salePayments))}</strong> (parcelas e lance do bolso; o embutido não conta, saiu da carta).</p>
                    {saleHistory.length > 0 && (
                      <label className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100 cursor-pointer">
                        <input type="checkbox" className="mt-0.5" checked={includeHistory} onChange={e => setIncludeHistory(e.target.checked)} />
                        <span>
                          Incluir <strong>{saleHistory.length}</strong> pagamentos anteriores ao cadastro, achados pela descrição "Grupo {saleQuota?.group_number} cota {saleQuota?.quota_number}":
                          {' '}<strong>{fmt(sumFlows(saleHistory))}</strong> ({saleHistory[0].date.split('-').reverse().join('/')} a {saleHistory[saleHistory.length - 1].date.split('-').reverse().join('/')}).
                          {' '}<span className="text-slate-400">Só leitura — os lançamentos não são alterados.</span>
                        </span>
                      </label>
                    )}
                    <p>Total considerado: <strong>{fmt(sale.invested)}</strong>{sale.invested > 0 && <> · primeiro pagamento em {payments.map(p => p.date).sort()[0].split('-').reverse().join('/')}</>}</p>
                  </>
                )}
              </div>
            )}
          </Card>
          <Card title="A venda">
            <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3">
              <Field help={H.salePrice} label="Preço de venda" value={salePrice} onChange={setSalePrice} suffix="R$" />
              <div><HelpLabel label="Data da venda" help={H.saleDate} /><DateInput className={inputCls} value={saleDate} onChange={e => setSaleDate(e.target.value)} /></div>
              <Field help={H.opportunity} warn={W.opportunity(num(opportunity))} label="Rendimento do seu dinheiro" value={opportunity} onChange={setOpportunity} suffix="% a.a." />
            </div>
          </Card>
          {sale.invested > 0 && num(salePrice) > 0 && (
            <>
              <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3">
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
              <Field help={H.targetPct} label="Meta de lucro" value={targetPct} onChange={setTargetPct} suffix="%" />
              <div className="lg:col-span-2">
                <HelpLabel label="A meta é" help={H.targetBasis} />
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
