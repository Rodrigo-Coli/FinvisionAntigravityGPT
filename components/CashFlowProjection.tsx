import React, { useMemo, useState } from 'react';
import { CashFlowProjectionItem } from '../types';
import { Activity, ChevronDown, ChevronUp, Info, TrendingUp, TrendingDown } from 'lucide-react';
import { formatCurrency } from '../lib/historyUtils';

interface CashFlowProjectionProps {
  data: CashFlowProjectionItem[];
  isLoading?: boolean;
  onMonthClick?: (month: string, year: number) => void;
}

export default function CashFlowProjection({ data, isLoading, onMonthClick }: CashFlowProjectionProps) {
  const [collapsed, setCollapsed] = useState(false);

  const { maxBar, negMonths, firstNegIdx } = useMemo(() => {
    if (!data || data.length === 0) return { maxBar: 100, negMonths: 0, firstNegIdx: -1 };
    
    let max = 100;
    let negCount = 0;
    let firstNeg = -1;

    data.forEach((d, i) => {
      const inc = d.projectedIncome + d.recurringIncome;
      const exp = d.projectedExpense + d.recurringExpense + d.liabilityPayments + d.balloonPayments;
      
      if (inc > max) max = inc;
      if (exp > max) max = exp;
      if (d.endingBalance < 0) {
        negCount++;
        if (firstNeg === -1) firstNeg = i;
      }
    });

    return { maxBar: max, negMonths: negCount, firstNegIdx: firstNeg };
  }, [data]);

  const fmt = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1000000) return `${v < 0 ? '-' : ''}R$${(abs / 1000000).toFixed(1)}M`;
    if (abs >= 1000) return `${v < 0 ? '-' : ''}R$${(abs / 1000).toFixed(1)}k`;
    return `${v < 0 ? '-' : ''}R$${Math.round(abs)}`;
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-[24px] sm:rounded-[32px] p-6 border border-slate-100 animate-pulse h-80 flex items-center justify-center">
        <Activity size={32} className="text-brand-400 animate-spin" />
      </div>
    );
  }

  if (!data || data.length === 0) return null;

  return (
    <div className="bg-white border border-slate-100 rounded-[24px] sm:rounded-[32px] shadow-sm overflow-hidden">
      {/* HEADER SECTION */}
      <div
        className="px-4 sm:px-8 py-4 sm:py-5 border-b border-slate-50 flex items-start sm:items-center justify-between cursor-pointer hover:bg-slate-50/30 transition-colors gap-3"
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Activity size={18} />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Projeção Avançada de Fluxo</h3>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Baseado no Saldo + Pendências + Crédito (12 meses)</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
          {negMonths > 0 && (
            <span className="px-2 sm:px-3 py-1 bg-red-50 text-red-600 rounded-lg text-[8px] sm:text-[9px] font-bold uppercase tracking-widest">
              {negMonths} {negMonths === 1 ? 'mês negativo' : 'meses no vermelho'}
            </span>
          )}
          {collapsed ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronUp size={18} className="text-slate-400" />}
        </div>
      </div>

      {!collapsed && (
        <div className="p-4 sm:p-8">
          {firstNegIdx >= 0 && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3">
              <Info size={16} className="text-red-500 shrink-0" />
              <p className="text-xs text-red-700 font-medium">
                Seu saldo consolidado pode ficar negativo em <strong>{data[firstNegIdx].label}</strong> considerando os gastos e faturas programados.
              </p>
            </div>
          )}

          {/* Chart Container - com scroll horizontal se necessário no mobile */}
          <div className="w-full overflow-x-auto pb-4 scrollbar-hide">
            <div className="flex gap-2 sm:gap-4 items-end justify-between min-w-[500px] sm:min-w-[600px] h-64 pt-10 px-2">
              {data.map((item, i) => {
                const totalInc = item.projectedIncome + item.recurringIncome;
                const totalExp = item.projectedExpense + item.recurringExpense + item.liabilityPayments + item.balloonPayments;
                
                const incH = Math.max((totalInc / maxBar) * 100, 2);
                const expH = Math.max((totalExp / maxBar) * 100, 2);
                const isNegative = item.endingBalance < 0;

                return (
                  <div 
                    key={i} 
                    className="flex-1 flex flex-col items-center gap-3 relative group cursor-pointer"
                    onClick={() => {
                       const [mName, yShort] = item.label.split('/');
                       const monthMap: Record<string, string> = { 'Jan': '01', 'Fev': '02', 'Mar': '03', 'Abr': '04', 'Mai': '05', 'Jun': '06', 'Jul': '07', 'Ago': '08', 'Set': '09', 'Out': '10', 'Nov': '11', 'Dez': '12' };
                       const m = monthMap[mName] || '01';
                       const y = 2000 + parseInt(yShort);
                       onMonthClick?.(m, y);
                    }}
                  >
                    {/* Tooltip Hover */}
                    <div className={`absolute bottom-full mb-3 opacity-0 group-hover:opacity-100 bg-brand-900 text-white p-3 rounded-xl text-[10px] whitespace-nowrap z-50 transition-opacity pointer-events-none shadow-xl border border-white/10 w-44 ${i === 0 ? 'left-0' : i === data.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2'}`}>
                      <div className="font-bold border-b border-white/10 pb-1.5 mb-1.5 text-center">{item.label}</div>
                      <div className="flex justify-between text-emerald-400 mb-1">
                        <span>Receitas:</span>
                        <span>{formatCurrency(totalInc)}</span>
                      </div>
                      <div className="flex justify-between text-rose-400 mb-1">
                        <span>Despesas*:</span>
                        <span>-{formatCurrency(totalExp)}</span>
                      </div>
                      <div className={`flex justify-between font-bold mt-2 pt-2 border-t border-white/10 ${isNegative ? 'text-rose-400' : 'text-white'}`}>
                        <span>Saldo Final:</span>
                        <span>{formatCurrency(item.endingBalance)}</span>
                      </div>
                      <p className="text-[8px] text-white/40 mt-2 text-center">*Inclui crédito e passivos</p>
                      {/* Tooltip Arrow */}
                      <div className={`absolute -bottom-1 w-2 h-2 rotate-45 bg-brand-900 ${i === 0 ? 'left-4' : i === data.length - 1 ? 'right-4' : 'left-1/2 -translate-x-1/2'}`} />
                    </div>

                    {/* Projected Balance Top Label */}
                    <span className={`text-[9px] font-black leading-tight px-1.5 py-0.5 rounded-full ${isNegative ? 'text-rose-600 bg-rose-50' : 'text-slate-600 bg-slate-50'}`}>
                      {fmt(item.endingBalance)}
                    </span>

                    <div className="w-full flex gap-0.5 sm:gap-1.5 items-end h-32 justify-center">
                      {/* Income Bar (Consolidada) */}
                      <div 
                        className="w-3 sm:w-5 rounded-t-md transition-all bg-emerald-400 hover:bg-emerald-500 shadow-sm" 
                        style={{ height: `${incH}%` }} 
                        title={`Receita: ${formatCurrency(totalInc)}`}
                      />
                      {/* Expense Bar (Consolidada com Passivos/Balões/Cartões) */}
                      <div 
                        className="w-3 sm:w-5 rounded-t-md transition-all bg-rose-400 hover:bg-rose-500 shadow-sm" 
                        style={{ height: `${expH}%` }} 
                        title={`Despesa: ${formatCurrency(totalExp)}`}
                      >
                        {(item.balloonPayments > 0 || item.liabilityPayments > 0) && (
                           <div className="w-full h-1 bg-amber-400/50 mt-auto" title="Contém Balões/Parcelas Extras" />
                        )}
                      </div>
                    </div>

                    {/* X-Axis Label */}
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center truncate w-full">
                      {item.label.split('/')[0]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-slate-50 flex items-center text-[10px] text-slate-400 gap-2 font-medium">
            <Info className="w-4 h-4 text-brand-400 shrink-0" />
            <p>A projeção avançada consolida faturas de cartão e parcelas extras de imóveis nas barras de despesa.</p>
          </div>
        </div>
      )}
    </div>
  );
}
