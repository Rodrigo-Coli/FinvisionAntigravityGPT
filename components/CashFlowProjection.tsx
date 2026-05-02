import React, { useMemo } from 'react';
import { CashFlowProjectionItem } from '../types';
import { TrendingUp, TrendingDown, Info, Activity } from 'lucide-react';
import { formatCurrency } from '../lib/historyUtils';

interface CashFlowProjectionProps {
  data: CashFlowProjectionItem[];
  isLoading?: boolean;
}

export function CashFlowProjection({ data, isLoading }: CashFlowProjectionProps) {
  const { maxBalance, minBalance } = useMemo(() => {
    if (!data || data.length === 0) return { maxBalance: 100, minBalance: 0 };
    
    let max = -Infinity;
    let min = Infinity;
    
    data.forEach(d => {
      if (d.endingBalance > max) max = d.endingBalance;
      if (d.startingBalance > max) max = d.startingBalance;
      if (d.endingBalance < min) min = d.endingBalance;
      if (d.startingBalance < min) min = d.startingBalance;
    });

    // Add 10% padding
    const padding = (max - min) * 0.1 || 100;
    return { maxBalance: max + padding, minBalance: Math.min(0, min - padding) };
  }, [data]);

  if (isLoading) {
    return (
      <div className="bg-white rounded-[24px] sm:rounded-[32px] p-6 border border-slate-100 animate-pulse h-80 flex items-center justify-center">
        <div className="text-slate-400">Calculando projeções avançadas...</div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return null;
  }

  const range = maxBalance - minBalance;

  return (
    <div className="bg-white rounded-[24px] sm:rounded-[32px] p-6 sm:p-8 border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Activity size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                Projeção Avançada de Fluxo
              </h2>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                Simulação (12 meses) considerando despesas e passivos imobiliários.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 sm:gap-4">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Positivo
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-400" /> Negativo
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Balão / Parcelas Extras
          </div>
        </div>
      </div>

      <div className="relative h-64 mt-8 flex items-end justify-between gap-2 overflow-x-auto pb-6">
        {/* Zero Line */}
        {minBalance < 0 && (
          <div 
            className="absolute left-0 right-0 border-t border-dashed border-slate-200 z-0" 
            style={{ bottom: `${(Math.abs(minBalance) / range) * 100}%` }}
          />
        )}

        {data.map((item, i) => {
          const isNegative = item.endingBalance < 0;
          const heightPct = Math.max(0, (Math.abs(item.endingBalance) / range) * 100);
          const bottomPos = minBalance < 0 
            ? (item.endingBalance >= 0 ? (Math.abs(minBalance) / range) * 100 : ((Math.abs(minBalance) - Math.abs(item.endingBalance)) / range) * 100)
            : 0;

          // Calcule o quão impactante foram as despesas extras (balões e passivos)
          const hasHeavyLiabilities = item.balloonPayments > 0 || item.liabilityPayments > (item.projectedIncome * 0.5);

          return (
            <div key={item.date} className="relative flex flex-col items-center flex-1 min-w-[50px] sm:min-w-[60px] group z-10">
              {/* Tooltip on Hover */}
              <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 bg-brand-900 text-xs text-white p-3 rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 w-48 border border-white/10">
                <p className="font-bold border-b border-white/10 pb-1 mb-2 text-center">{item.label}</p>
                <div className="flex justify-between text-emerald-400 mb-1">
                  <span>Receitas:</span>
                  <span>{formatCurrency(item.projectedIncome + item.recurringIncome)}</span>
                </div>
                <div className="flex justify-between text-rose-400 mb-1">
                  <span>Despesas:</span>
                  <span>-{formatCurrency(item.projectedExpense + item.recurringExpense)}</span>
                </div>
                {(item.liabilityPayments > 0 || item.balloonPayments > 0) && (
                  <div className="flex justify-between text-amber-400 mb-2 border-t border-white/10 pt-1 mt-1">
                    <span>Imóveis/Passivos:</span>
                    <span>-{formatCurrency(item.liabilityPayments + item.balloonPayments)}</span>
                  </div>
                )}
                <div className={`flex justify-between font-bold border-t border-white/10 pt-2 ${isNegative ? 'text-rose-400' : 'text-white'}`}>
                  <span>Saldo Previsto:</span>
                  <span>{formatCurrency(item.endingBalance)}</span>
                </div>
                {/* Tooltip Arrow */}
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-brand-900" />
              </div>

              {/* Bar */}
              <div 
                className={`w-full max-w-[32px] sm:max-w-[40px] rounded-t-md transition-all duration-300 relative ${
                  isNegative ? 'bg-rose-400 hover:bg-rose-500' : 'bg-emerald-400 hover:bg-emerald-500'
                }`}
                style={{ 
                  height: `${Math.max(2, heightPct)}%`, 
                  position: 'absolute',
                  bottom: `${bottomPos}%`
                }}
              >
                {/* Warning indicator for balloon payments inside the bar */}
                {item.balloonPayments > 0 && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-white shadow-sm" />
                )}
              </div>

              {/* Projected Balance Top Label */}
              <span className={`absolute text-[9px] sm:text-[10px] font-black leading-tight bg-white/50 px-1 py-0.5 rounded-full ${isNegative ? 'text-rose-500' : 'text-slate-600'}`} style={{ bottom: `${bottomPos + heightPct}%`, marginBottom: '16px' }}>
                  {formatCurrency(item.endingBalance).replace('R$', '').trim()}
              </span>

              {/* X-Axis Label */}
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[9px] sm:text-[10px] text-slate-400 font-bold uppercase tracking-wider whitespace-nowrap">
                {item.label.split('/')[0]}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 pt-4 border-t border-slate-50 flex items-center text-xs text-slate-400 gap-2 font-medium">
        <Info className="w-4 h-4 text-brand-400 shrink-0" />
        <p>A projeção inclui gastos do cartão de crédito nas despesas futuras e juros de financiamento imobiliário.</p>
      </div>
    </div>
  );
}
