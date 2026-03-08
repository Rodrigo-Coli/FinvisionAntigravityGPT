import React from 'react';
import { X, Printer, Download, TrendingUp, TrendingDown, Building2 } from 'lucide-react';
import { DreReport } from '../../lib/dreUtils';
import * as XLSX from 'xlsx';

interface DreReportModalProps {
    report: DreReport | null;
    onClose: () => void;
}

export const DreReportModal: React.FC<DreReportModalProps> = ({ report, onClose }) => {
    if (!report) return null;

    const formatAmount = (amount: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
    };

    const handlePrint = () => {
        window.print();
    };

    const handleExportExcel = () => {
        if (!report) return;

        const data: any[] = [];

        data.push(['Demonstrador de Resultado do Exercício (DRE)']);
        data.push([`Período: ${report.period?.start || 'Início'} até ${report.period?.end || 'Hoje'}`]);
        data.push([]);

        data.push(['RECEITAS OPERACIONAIS BRUTAS', '', formatAmount(report.grossIncome)]);
        Object.entries(report.incomeCategories).forEach(([catName, cat]) => {
            data.push([`  ${catName}`, '', formatAmount(cat.total)]);
            Object.entries(cat.subcategories).forEach(([subName, total]) => {
                data.push([`    ${subName}`, '', formatAmount(total)]);
            });
        });

        data.push([]);
        data.push(['(-) DESPESAS OPERACIONAIS', '', formatAmount(report.totalExpenses)]);
        Object.entries(report.expenseCategories).forEach(([catName, cat]) => {
            data.push([`  ${catName}`, '', formatAmount(cat.total)]);
            Object.entries(cat.subcategories).forEach(([subName, total]) => {
                data.push([`    ${subName}`, '', formatAmount(total)]);
            });
        });

        data.push([]);
        data.push(['(=) LUCRO / PREJUÍZO LÍQUIDO', '', formatAmount(report.netIncome)]);

        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'DRE');
        XLSX.writeFile(wb, `dre_finvision_${new Date().getTime()}.xlsx`);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 print:p-0 print:bg-white sm:p-6 fade-in print:block">
            <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col h-full max-h-[90vh] print:max-h-none print:shadow-none print:h-auto print:rounded-none">

                {/* Cabeçalho */}
                <div className="flex items-center justify-between p-6 border-b border-slate-100 print:hidden">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center text-brand-600">
                            <Building2 size={20} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-900">DRE</h2>
                            <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Demonstrativo de Resultado do Exercício</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button onClick={handleExportExcel} className="p-2 sm:px-4 sm:py-2.5 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-xl flex items-center gap-2 transition-colors text-sm font-bold">
                            <Download size={18} />
                            <span className="hidden sm:inline">Excel</span>
                        </button>
                        <button onClick={handlePrint} className="p-2 sm:px-4 sm:py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl flex items-center gap-2 transition-colors text-sm font-bold">
                            <Printer size={18} />
                            <span className="hidden sm:inline">Imprimir / PDF</span>
                        </button>
                        <button onClick={onClose} className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors ml-2">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Área Padrão para PDF (Visível apenas em print) */}
                <div className="hidden print:block p-8 border-b-2 border-slate-900 mb-6">
                    <h1 className="text-3xl font-black text-slate-900 mb-2">FinVision</h1>
                    <h2 className="text-lg font-bold text-slate-600 uppercase tracking-widest">Demonstrativo de Resultado do Exercício (DRE)</h2>
                    <p className="text-sm text-slate-500 mt-4">Período: {report.period?.start || 'Início'} até {report.period?.end || 'Hoje'}</p>
                </div>

                {/* Conteúdo / Tabela */}
                <div className="p-6 overflow-y-auto print:overflow-visible flex-1 print:p-8 space-y-6">

                    {/* Header Report Card */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 print:mb-12">
                        <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 print:border-slate-300">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Receita Bruta</p>
                            <p className="text-2xl font-black text-slate-900">{formatAmount(report.grossIncome)}</p>
                        </div>
                        <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 print:border-slate-300">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Despesas</p>
                            <p className="text-2xl font-black text-rose-500">{formatAmount(report.totalExpenses)}</p>
                        </div>
                        <div className={`rounded-2xl p-5 border ${report.netIncome >= 0 ? 'bg-emerald-50 border-emerald-100 text-emerald-900 print:border-emerald-500' : 'bg-rose-50 border-rose-100 text-rose-900 print:border-rose-500'}`}>
                            <p className="text-xs font-bold opacity-70 uppercase tracking-widest mb-1">Resultado Líquido</p>
                            <div className="flex items-center gap-2">
                                {report.netIncome >= 0 ? <TrendingUp size={24} className="opacity-80" /> : <TrendingDown size={24} className="opacity-80" />}
                                <p className="text-2xl font-black">{formatAmount(report.netIncome)}</p>
                            </div>
                        </div>
                    </div>

                    <div className="w-full text-sm">

                        {/* 1. RECEITAS */}
                        <div className="mb-8">
                            <div className="flex justify-between items-center py-3 border-b-2 border-slate-800 mb-2 font-black text-slate-900 uppercase tracking-wider">
                                <span>I. Receita Operacional Bruta</span>
                                <span>{formatAmount(report.grossIncome)}</span>
                            </div>

                            {Object.values(report.incomeCategories).sort((a, b) => b.total - a.total).map((cat, idx) => (
                                <div key={`inc-${idx}`} className="mb-2">
                                    <div className="flex justify-between py-2 border-b border-slate-100 font-bold text-slate-700">
                                        <span className="pl-4">{cat.categoryName}</span>
                                        <span>{formatAmount(cat.total)}</span>
                                    </div>
                                    {Object.entries(cat.subcategories).sort(([, a], [, b]) => b - a).map(([sub, val], subIdx) => (
                                        <div key={`inc-sub-${subIdx}`} className="flex justify-between py-1.5 border-b border-slate-50/50 text-slate-500 text-xs">
                                            <span className="pl-12 flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-slate-300" /> {sub}</span>
                                            <span>{formatAmount(val)}</span>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>

                        {/* 2. DESPESAS */}
                        <div className="mb-8">
                            <div className="flex justify-between items-center py-3 border-b-2 border-rose-500 mb-2 font-black text-rose-600 uppercase tracking-wider">
                                <span>II. (-) Despesas Operacionais</span>
                                <span>{formatAmount(report.totalExpenses)}</span>
                            </div>

                            {Object.values(report.expenseCategories).sort((a, b) => b.total - a.total).map((cat, idx) => (
                                <div key={`exp-${idx}`} className="mb-2">
                                    <div className="flex justify-between py-2 border-b border-slate-100 font-bold text-slate-700">
                                        <span className="pl-4">{cat.categoryName}</span>
                                        <span>{formatAmount(cat.total)}</span>
                                    </div>
                                    {Object.entries(cat.subcategories).sort(([, a], [, b]) => b - a).map(([sub, val], subIdx) => (
                                        <div key={`exp-sub-${subIdx}`} className="flex justify-between py-1.5 border-b border-slate-50/50 text-slate-500 text-xs text-rose-900/40 print:text-slate-600">
                                            <span className="pl-12 flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-rose-200 print:bg-slate-300" /> {sub}</span>
                                            <span>{formatAmount(val)}</span>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>

                        {/* RESULTADO LÍQUIDO (FINAL LINE) */}
                        <div className={`mt-8 flex justify-between items-center py-4 border-y-2 font-black text-lg uppercase tracking-wider ${report.netIncome >= 0 ? 'border-emerald-500 text-emerald-600' : 'border-rose-500 text-rose-600'}`}>
                            <span>(=) Resultado Líquido do Período</span>
                            <span>{formatAmount(report.netIncome)}</span>
                        </div>

                    </div>
                </div>

                <div className="hidden print:block text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-10 pt-4 border-t border-slate-200">
                    Gerado por FinVision - Software de Excelência Financeira
                </div>
            </div>
            {/* O estilo print nativo esconde o body e mostra so o content */}
            <style dangerouslySetInnerHTML={{
                __html: `
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    .print\\:block, .print\\:block * {
                        visibility: visible;
                    }
                    .print\\:block {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                    }
                }
            `}} />
        </div>
    );
};
