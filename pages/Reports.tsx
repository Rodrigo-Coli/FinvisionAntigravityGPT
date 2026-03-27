import React, { useState, useEffect } from 'react';
import { FileDown, Calendar, Filter, FileSpreadsheet, FileText, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase/client';
import { DateUtils } from '../lib/dateUtils';

const Reports: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalIncome: 0,
    totalExpense: 0,
    transactionCount: 0,
    pendingCount: 0
  });

  const [dateRange, setDateRange] = useState({
    start: DateUtils.formatToISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
    end: DateUtils.formatToISODate(new Date())
  });

  useEffect(() => {
    fetchStats();
  }, [dateRange]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: txs } = await supabase
        .from('transactions')
        .select('type, amount, is_paid')
        .eq('user_id', user.id)
        .gte('date', dateRange.start)
        .lte('date', dateRange.end);

      if (txs) {
        let income = 0;
        let expense = 0;
        let pending = 0;

        txs.forEach((t: any) => {
          if (t.type === 'INCOME') income += t.amount;
          else if (t.type === 'EXPENSE') expense += t.amount;
          if (!t.is_paid && t.type === 'EXPENSE') pending++;
        });

        setStats({
          totalIncome: income,
          totalExpense: expense,
          transactionCount: txs.length,
          pendingCount: pending
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = async () => {
    setExporting('csv');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: txs } = await supabase
        .from('transactions')
        .select('date, description, category, type, amount, is_paid')
        .eq('user_id', user.id)
        .gte('date', dateRange.start)
        .lte('date', dateRange.end)
        .order('date', { ascending: false });

      if (!txs || txs.length === 0) {
        alert('Nenhuma transação encontrada no período.');
        return;
      }

      const headers = ['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor', 'Status'];
      const rows = txs.map((t: any) => [
        t.date,
        `"${t.description.replace(/"/g, '""')}"`,
        t.category || '',
        t.type,
        t.amount.toFixed(2),
        t.is_paid ? 'Pago' : 'Pendente'
      ]);

      const csvContent = [headers, ...rows].map(e => e.join(',')).join('\n');
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `FinVision_Relatorio_${dateRange.start}_${dateRange.end}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="p-6 lg:p-12 max-w-7xl mx-auto space-y-10 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Relatórios de Exportação</h1>
          <p className="text-slate-500 font-medium mt-2">Gere planilhas e demonstrativos do seu fluxo de caixa.</p>
        </div>

        <div className="flex bg-white p-2 rounded-2xl border border-slate-100 shadow-sm gap-2">
          <div className="flex flex-col px-3 border-r border-slate-50">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Início</span>
            <input 
              type="date" 
              value={dateRange.start} 
              onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="text-xs font-bold text-slate-900 outline-none bg-transparent"
            />
          </div>
          <div className="flex flex-col px-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fim</span>
            <input 
              type="date" 
              value={dateRange.end} 
              onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="text-xs font-bold text-slate-900 outline-none bg-transparent"
            />
          </div>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Entradas', value: stats.totalIncome, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Saídas', value: stats.totalExpense, color: 'text-rose-600', bg: 'bg-rose-50' },
          { label: 'Transações', value: stats.transactionCount, color: 'text-brand-600', bg: 'bg-brand-50', isPrice: false },
          { label: 'Contas Abertas', value: stats.pendingCount, color: 'text-amber-600', bg: 'bg-amber-50', isPrice: false },
        ].map((s, i) => (
          <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group">
            <div className={`absolute top-0 right-0 w-24 h-24 ${s.bg} rounded-full -mr-8 -mt-8 opacity-40 group-hover:scale-110 transition-transform`} />
            <p className="relative z-10 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">{s.label}</p>
            <h3 className={`relative z-10 text-2xl font-black ${s.color}`}>
              {s.isPrice === false ? s.value : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(s.value)}
            </h3>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* CSV Export */}
        <div className="bg-white rounded-[40px] border border-slate-100 p-10 flex flex-col items-center text-center shadow-xl shadow-slate-200/50">
          <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-[32px] flex items-center justify-center mb-6">
            <FileSpreadsheet size={40} />
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-2">Exportar Planilha (CSV)</h2>
          <p className="text-slate-500 font-medium mb-8 max-w-xs">Arquivo compatível com Excel e Google Sheets contendo todos os detalhes das transações.</p>
          <button 
            onClick={exportToCSV}
            disabled={exporting === 'csv' || loading}
            className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 active:scale-95 disabled:opacity-50"
          >
            {exporting === 'csv' ? <Loader2 className="animate-spin" /> : <FileDown size={18} />}
            Baixar Planilha
          </button>
        </div>

        {/* PDF Export (Placeholder/Coming Soon) */}
        <div className="bg-white rounded-[40px] border border-slate-100 p-10 flex flex-col items-center text-center shadow-xl shadow-slate-200/50 relative overflow-hidden opacity-80">
          <div className="absolute inset-0 bg-slate-50/10 backdrop-blur-[1px] z-10 flex items-center justify-center">
            <span className="bg-slate-900 text-white px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest -rotate-6">Em breve</span>
          </div>
          <div className="w-20 h-20 bg-rose-50 text-rose-600 rounded-[32px] flex items-center justify-center mb-6">
            <FileText size={40} />
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-2">Relatório PDF Premium</h2>
          <p className="text-slate-500 font-medium mb-8 max-w-xs">Documento visual formatado com gráficos e insights para impressão ou envio.</p>
          <button className="w-full py-5 bg-slate-200 text-slate-400 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 cursor-not-allowed">
            <FileDown size={18} />
            Gerar PDF
          </button>
        </div>
      </div>

      <div className="bg-brand-900 rounded-[40px] p-10 text-white flex flex-col md:flex-row items-center justify-between gap-8 shadow-2xl overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl" />
        <div className="flex items-center gap-6 relative z-10">
          <div className="w-16 h-16 bg-white/10 rounded-3xl flex items-center justify-center border border-white/20">
            <CheckCircle2 size={32} />
          </div>
          <div>
            <h4 className="text-xl font-bold">Auditoria Completa</h4>
            <p className="text-brand-200 text-sm font-medium pr-4">Suas exportações são processadas em tempo real com base nos filtros acima.</p>
          </div>
        </div>
        <div className="relative z-10">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] bg-white/10 px-4 py-2 rounded-full border border-white/10">v1.2 Stable</span>
        </div>
      </div>
    </div>
  );
};

export default Reports;
