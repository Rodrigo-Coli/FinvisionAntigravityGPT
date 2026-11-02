import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ListOrdered, CornerDownRight } from 'lucide-react';
import { supabase } from '../../lib/supabase/client';
import { getSessionUser } from '../../lib/session';
import { isProbablyOffline } from '../../lib/connectivity';
import { DateUtils } from '../../lib/dateUtils';
import {
  availableMonthKeys,
  buildCardsMonthSummary,
  monthKeyOf,
  shiftMonthKey,
  statementMonthKey,
  SummaryStatement
} from '../../lib/cardsMonthSummary';

/**
 * Card "Resumo das faturas" da tela de Cartões: uma linha por cartão (nome e
 * valor da fatura do mês), o total em cima e um filtro para trocar o mês.
 * Só lê dados (faturas e compras); não muda nada da tela do cartão.
 */
interface Props {
  cards: any[];
  formatCurrency: (v: number) => string;
  /** Muda quando a tela grava algo (compra, pagamento) para o resumo recarregar. */
  refreshKey?: string;
}

const CACHE_KEY = 'finvision_cached_cards_month_summary';
const OPEN_KEY = 'finvision_cards_summary_open';

const readCache = (): { statements: SummaryStatement[]; txTotals: Record<string, number> } => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { statements: parsed.statements || [], txTotals: parsed.txTotals || {} };
    }
  } catch { /* cache é só conveniência */ }
  return { statements: [], txTotals: {} };
};

const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return DateUtils.formatFullMonthYear(y, m);
};

export const CardsMonthSummary: React.FC<Props> = ({ cards, formatCurrency, refreshKey }) => {
  const todayKey = monthKeyOf(new Date());
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(OPEN_KEY) !== 'false'; } catch { return true; }
  });
  const [monthKey, setMonthKey] = useState(todayKey);
  const [statements, setStatements] = useState<SummaryStatement[]>(() => readCache().statements);
  // Soma das compras por fatura (id → valor), como a tela do cartão calcula.
  const [txTotals, setTxTotals] = useState<Record<string, number>>(() => readCache().txTotals);
  const [loading, setLoading] = useState(false);

  const cardIds = useMemo(() => (cards || []).map(c => c.id).filter(Boolean).sort(), [cards]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!supabase || isProbablyOffline() || cardIds.length === 0) return;
      setLoading(true);
      try {
        const user = await getSessionUser(supabase);
        if (!user) return;
        const { data: stmts, error } = await supabase
          .from('card_statements')
          .select('id, card_id, year, month, due_date, status, total_amount, paid_amount')
          .eq('user_id', user.id)
          .in('card_id', cardIds);
        if (error) throw error;
        const list = (stmts || []) as SummaryStatement[];

        // Compras só das faturas de 3 meses em volta do escolhido (o resto vem do
        // total gravado), para não ler o histórico inteiro de uma vez.
        const near = new Set([shiftMonthKey(monthKey, -1), monthKey, shiftMonthKey(monthKey, 1)]);
        const ids = list.filter(s => near.has(statementMonthKey(s))).map(s => s.id);
        const totals: Record<string, number> = {};
        if (ids.length > 0) {
          const { data: txs, error: txErr } = await supabase
            .from('card_transactions')
            .select('statement_id, amount')
            .eq('user_id', user.id)
            .in('statement_id', ids)
            .limit(5000);
          if (txErr) throw txErr;
          for (const id of ids) totals[id] = 0;
          for (const t of txs || []) {
            const sid = (t as any).statement_id;
            if (sid) totals[sid] = Math.round(((totals[sid] || 0) + Number((t as any).amount || 0)) * 100) / 100;
          }
        }
        if (cancelled) return;
        setStatements(list);
        setTxTotals(prev => ({ ...prev, ...totals }));
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ statements: list, txTotals: totals })); } catch { /* sem espaço: segue */ }
      } catch (err) {
        console.warn('Resumo das faturas: usando o que já estava salvo', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [cardIds.join(','), monthKey, refreshKey]);

  const months = useMemo(() => availableMonthKeys(statements, todayKey), [statements, todayKey]);
  const summary = useMemo(
    () => buildCardsMonthSummary(cards || [], statements, monthKey, txTotals),
    [cards, statements, monthKey, txTotals]
  );

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(OPEN_KEY, String(next)); } catch { /* só preferência */ }
  };

  if (!cards || cards.length === 0) return null;

  const statusText = (r: (typeof summary.rows)[number]) => {
    if (r.status === 'SEM_FATURA') return 'sem fatura';
    const due = r.dueDate ? `vence ${DateUtils.formatDisplayDate(r.dueDate)}` : '';
    if (r.status === 'PAGA') return ['paga', due].filter(Boolean).join(' · ');
    return [r.paid > 0 ? `falta ${formatCurrency(r.open)}` : 'em aberto', due].filter(Boolean).join(' · ');
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between gap-3 p-4 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-700 flex items-center justify-center text-slate-500 shrink-0">
            <ListOrdered size={20} />
          </div>
          <div className="min-w-0">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
              Resumo das faturas · {monthLabel(monthKey)}
            </span>
            <p className="text-lg font-black tracking-tight tabular-nums text-slate-900 dark:text-white">
              {formatCurrency(summary.total)}
            </p>
          </div>
        </div>
        <ChevronDown size={20} className={`text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {/* Filtro do mês (mês de vencimento da fatura) */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMonthKey(k => shiftMonthKey(k, -1))}
              className="p-2 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-500 hover:text-brand-600 transition-colors"
              aria-label="Mês anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <select
              value={monthKey}
              onChange={e => setMonthKey(e.target.value)}
              className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-700 border border-slate-100 dark:border-slate-600 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-brand-500"
              aria-label="Mês de vencimento das faturas"
            >
              {(months.includes(monthKey) ? months : [monthKey, ...months]).map(k => (
                <option key={k} value={k}>{monthLabel(k)}{k === todayKey ? ' (este mês)' : ''}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setMonthKey(k => shiftMonthKey(k, 1))}
              className="p-2 rounded-lg bg-slate-50 dark:bg-slate-700 text-slate-500 hover:text-brand-600 transition-colors"
              aria-label="Próximo mês"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <p className="text-[10px] text-slate-400 font-medium -mt-1">
            Faturas que vencem no mês escolhido{loading ? ' · atualizando…' : ''}
          </p>

          <ul>
            {summary.rows.map(r => (
              <li
                key={r.card.id}
                className="flex items-center justify-between gap-3 py-2 border-b border-slate-50 dark:border-slate-700/60 last:border-b-0"
              >
                <div className={`min-w-0 ${r.level === 1 ? 'pl-4' : ''}`}>
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate flex items-center gap-1">
                    {r.level === 1 && <CornerDownRight size={12} className="text-slate-300 shrink-0" />}
                    <span className="truncate">{r.card.name}</span>
                    {/* "0000" é o padrão de quando o final não foi cadastrado */}
                    {r.card.last4 && r.card.last4 !== '0000' && <span className="text-slate-400 shrink-0">· {r.card.last4}</span>}
                  </p>
                  <p className={`text-[10px] font-medium truncate ${r.status === 'ABERTA' ? 'text-amber-600' : 'text-slate-400'}`}>
                    {statusText(r)}
                    {r.level === 1 && r.card.sums_into_invoice !== false ? ' · soma na fatura do titular' : ''}
                  </p>
                </div>
                <span className={`text-xs font-bold tabular-nums whitespace-nowrap ${r.status === 'SEM_FATURA' ? 'text-slate-300' : r.total < 0 ? 'text-emerald-600' : 'text-slate-800 dark:text-slate-100'}`}>
                  {formatCurrency(r.total)}
                </span>
              </li>
            ))}
          </ul>

          <div className="pt-2 border-t-2 border-slate-200 dark:border-slate-600 space-y-1">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">Total do mês</span>
              <span className="text-sm font-black tabular-nums text-slate-900 dark:text-white">{formatCurrency(summary.total)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-[11px]">
              <span className="text-slate-500 font-medium">Já pago</span>
              <span className="font-bold tabular-nums text-emerald-600">{formatCurrency(summary.paid)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-[11px]">
              <span className="text-slate-500 font-medium">Falta pagar</span>
              <span className={`font-bold tabular-nums ${summary.open > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{formatCurrency(summary.open)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CardsMonthSummary;
