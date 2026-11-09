import React, { useState } from 'react';
import { Archive, ArchiveRestore, ChevronDown, ChevronUp, History } from 'lucide-react';
import { brokerOf, AccountLite } from '../../lib/assetLocation';
import { canArchiveInvestment, closedOn, splitClosedInvestments, ClosedInvestmentInput } from '../../lib/closedInvestments';

// Investimentos encerrados e arquivados (Patrimônio › Investimentos), fora da carteira.
// Fica fechado por padrão; cada item mostra a corretora, quando terminou e o extrato.
// Regras em lib/closedInvestments.ts. Some quando não há nenhum.

interface Props<T extends ClosedInvestmentInput> {
  assets: T[];
  brokers: AccountLite[];
  onOpenLedger: (asset: T) => void;
  onArchive: (asset: T) => void;
  onUnarchive: (asset: T) => void;
}

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const brDate = (s: string) => s.split('-').reverse().join('/');
const brl = (n: number) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ClosedInvestmentsPanel<T extends ClosedInvestmentInput>({ assets, brokers, onOpenLedger, onArchive, onUnarchive }: Props<T>) {
  const [open, setOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const today = todayIso();
  const { closed, archived } = splitClosedInvestments(assets, today);
  if (closed.length === 0 && archived.length === 0) return null;

  const row = (a: T, isArchived: boolean) => {
    const broker = brokerOf(a.metadata, brokers);
    const when = closedOn(a, today);
    const value = Number(a.estimatedValue || 0);
    const closedStatus = a.metadata?.status === 'RESGATADO';
    return (
      <div key={a.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 first:border-t-0">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-700 break-words">{a.name}</p>
          {broker && <p className="text-[11px] font-bold text-indigo-600">{broker}</p>}
          <p className="text-[11px] text-slate-500">
            {closedStatus ? (when ? `Encerrado em ${brDate(when)}` : 'Encerrado') : 'Arquivado'}
            {Math.abs(value) >= 0.005 ? ` · ${brl(value)}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => onOpenLedger(a)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-600 flex items-center gap-1">
            <History size={12} /> Extrato
          </button>
          {isArchived ? (
            <button type="button" onClick={() => onUnarchive(a)}
              className="px-2.5 py-1.5 rounded-lg border border-emerald-200 text-[11px] font-bold text-emerald-700 flex items-center gap-1">
              <ArchiveRestore size={12} /> Desarquivar
            </button>
          ) : canArchiveInvestment(a) && (
            <button type="button" onClick={() => onArchive(a)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-600 flex items-center gap-1">
              <Archive size={12} /> Arquivar
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm" data-testid="closed-investments-panel">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full p-4 flex items-center justify-between gap-3 text-left">
        <div className="flex items-center gap-2 min-w-0">
          <Archive size={18} className="text-slate-500 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-black text-slate-900">Encerrados e arquivados</h3>
            <p className="text-[11px] text-slate-500 font-medium">
              {closed.length} encerrado{closed.length === 1 ? '' : 's'} · {archived.length} arquivado{archived.length === 1 ? '' : 's'} · fora da carteira e do saldo
            </p>
          </div>
        </div>
        {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Investimentos resgatados ou vencidos saem da carteira, mas o extrato fica guardado. Toque em <b>Arquivar</b> para tirar um encerrado desta lista. Os arquivados ficam em <b>Ver arquivados</b> e podem voltar a qualquer momento.
          </p>
          {closed.length > 0
            ? <div className="border border-slate-100 rounded-xl" data-testid="closed-list">{closed.map(a => row(a, false))}</div>
            : <p className="text-[11px] text-slate-400 italic">Nenhum encerrado fora do arquivo.</p>}
          {archived.length > 0 && (
            <>
              <button type="button" onClick={() => setShowArchived(s => !s)}
                className="text-[11px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-1">
                {showArchived ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {showArchived ? 'Esconder arquivados' : `Ver arquivados (${archived.length})`}
              </button>
              {showArchived && <div className="border border-slate-100 rounded-xl bg-slate-50/60" data-testid="archived-list">{archived.map(a => row(a, true))}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
