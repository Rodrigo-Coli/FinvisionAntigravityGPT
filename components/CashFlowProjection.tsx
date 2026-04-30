import React, { useMemo } from 'react';
import { CashFlowProjectionItem } from '../types';
import { TrendingUp, TrendingDown, Info } from 'lucide-react';
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
      <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 animate-pulse h-80 flex items-center justify-center">
        <div className="text-slate-500">Calculando projeções avançadas...</div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return null;
  }

  const range = maxBalance - minBalance;

  return (
    <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 shadow-xl overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            Projeção Avançada de Fluxo de Caixa
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Simulação para os próximos {data.length} meses considerando despesas fixas, recorrentes e imobiliárias.
          </p>
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span className="w-3 h-3 rounded-full bg-emerald-500" /> Positivo
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span className="w-3 h-3 rounded-full bg-rose-500" /> Negativo
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span className="w-3 h-3 rounded-full bg-amber-500" /> Balão / Parcelas Extras
          </div>
        </div>
      </div>

      <div className="relative h-64 mt-8 flex items-end justify-between gap-2 overflow-x-auto pb-6">
        {/* Zero Line */}
        {minBalance < 0 && (
          <div 
            className="absolute left-0 right-0 border-t border-dashed border-slate-600 z-0" 
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
            <div key={item.date} className="relative flex flex-col items-center flex-1 min-w-[60px] group z-10">
              {/* Tooltip on Hover */}
              <div className="absolute -top-24 left-1/2 -translate-x-1/2 bg-slate-800 text-xs text-white p-3 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 w-48 border border-slate-700">
                <p className="font-bold border-b border-slate-700 pb-1 mb-2 text-center">{item.label}</p>
                <div className="flex justify-between text-emerald-400 mb-1">
                  <span>Receitas:</span>
                  <span>{formatCurrency(item.projectedIncome + item.recurringIncome)}</span>
                </div>
                <div className="flex justify-between text-rose-400 mb-1">
                  <span>Despesas Fixas:</span>
                  <span>-{formatCurrency(item.projectedExpense + item.recurringExpense)}</span>
                </div>
                {(item.liabilityPayments > 0 || item.balloonPayments > 0) && (
                  <div className="flex justify-between text-amber-400 mb-2 border-t border-slate-700 pt-1 mt-1">
                    <span>Imóveis/Passivos:</span>
                    <span>-{formatCurrency(item.liabilityPayments + item.balloonPayments)}</span>
                  </div>
                )}
                <div className={`flex justify-between font-bold border-t border-slate-700 pt-2 ${isNegative ? 'text-rose-500' : 'text-blue-400'}`}>
                  <span>Saldo Previsto:</span>
                  <span>{formatCurrency(item.endingBalance)}</span>
                </div>
              </div>

              {/* Bar */}
              <div 
                className={`w-full max-w-[40px] rounded-t-sm transition-all duration-300 relative ${
                  isNegative ? 'bg-rose-500/80 hover:bg-rose-400' : 'bg-emerald-500/80 hover:bg-emerald-400'
                }`}
                style={{ 
                  height: `${Math.max(2, heightPct)}%`, 
                  position: 'absolute',
                  bottom: `${bottomPos}%`
                }}
              >
                {/* Warning indicator for balloon payments inside the bar */}
                {item.balloonPayments > 0 && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-slate-900" />
                )}
              </div>

              {/* X-Axis Label */}
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-slate-400 font-medium whitespace-nowrap">
                {item.label.split('/')[0]}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-slate-800 flex items-center text-sm text-slate-400 gap-2">
        <Info className="w-4 h-4 text-blue-400" />
        <p>A projeção considera juros compostos em financiamentos imobiliários e inclui gastos do cartão de crédito nas despesas futuras.</p>
      </div>
    </div>
  );
}
