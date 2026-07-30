import React, { useMemo, useState } from 'react';
import { X, Printer, Download, TrendingUp, TrendingDown, Building2, Tag, ArrowUpRight, ArrowDownRight, SlidersHorizontal } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Transaction } from '../../types';
import { DreUtils } from '../../lib/dreUtils';
import { SearchableMultiSelect } from './HistoryFilters';

interface DreReportModalProps {
    transactions: Transaction[];
    startDate: string;
    endDate: string;
    onClose: () => void;
}

type DreTypeFilter = 'ALL' | 'INCOME' | 'EXPENSE';

const matchesTypeFilter = (t: Transaction, filter: DreTypeFilter) => {
    if (filter === 'ALL') return true;
    if (filter === 'INCOME') return t.type === 'INCOME';
    return t.type === 'EXPENSE' || t.type === 'BILL_PAYMENT';
};

// Mesma exclusão de ruído do DreUtils, usada aqui só para montar as listas de
// categoria/subcategoria disponíveis (o cálculo final continua no DreUtils).
const isNoise = (t: Transaction) => t.isDeleted || t.type === 'ADJUSTMENT' || t.is_amortization || t.type === 'TRANSFER';

export const DreReportModal: React.FC<DreReportModalProps> = ({ transactions, startDate, endDate, onClose }) => {
    const [typeFilter, setTypeFilter] = useState<DreTypeFilter>('ALL');
    const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
    const [subcategoryFilter, setSubcategoryFilter] = useState<string[]>([]);
    const [showFilters, setShowFilters] = useState(false);

    const cleanTxs = useMemo(() => transactions.filter(t => !isNoise(t)), [transactions]);

    const typeScoped = useMemo(
        () => cleanTxs.filter(t => matchesTypeFilter(t, typeFilter)),
        [cleanTxs, typeFilter]
    );

    const categoryOptions = useMemo(() => {
        const set = new Set(typeScoped.map(t => t.category || 'Sem categoria'));
        return Array.from(set).sort();
    }, [typeScoped]);

    const categoryScoped = useMemo(
        () => categoryFilter.length === 0
            ? typeScoped
            : typeScoped.filter(t => categoryFilter.includes(t.category || 'Sem categoria')),
        [typeScoped, categoryFilter]
    );

    const subcategoryOptions = useMemo(() => {
        const set = new Set(categoryScoped.map(t => t.subcategory || 'Diversos'));
        return Array.from(set).sort();
    }, [categoryScoped]);

    const finalTxs = useMemo(
        () => subcategoryFilter.length === 0
            ? categoryScoped
            : categoryScoped.filter(t => subcategoryFilter.includes(t.subcategory || 'Diversos')),
        [categoryScoped, subcategoryFilter]
    );

    const report = useMemo(
        () => DreUtils.generateDreFromTransactions(finalTxs, startDate, endDate),
        [finalTxs, startDate, endDate]
    );

    const hasActiveFilters = typeFilter !== 'ALL' || categoryFilter.length > 0 || subcategoryFilter.length > 0;

    const formatAmount = (amount: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
    };

    const handlePrint = () => {
        window.print();
    };

    const handleExportExcel = () => {
        const data: any[] = [];

        data.push(['Demonstrador de Resultado do Exercício (DRE)']);
        data.push([`Período: ${report.period?.start || 'Início'} até ${report.period?.end || 'Hoje'}`]);
        data.push([]);

        data.push(['RECEITAS OPERACIONAIS BRUTAS', '', formatAmount(report.grossIncome)]);
        Object.entries(report.incomeCategories).forEach(([catName, cat]: [string, any]) => {
            data.push([`  ${catName}`, '', formatAmount(cat.total)]);
            Object.entries(cat.subcategories).forEach(([subName, total]: [string, any]) => {
                data.push([`    ${subName}`, '', formatAmount(total)]);
            });
        });

        data.push([]);
        data.push(['(-) DESPESAS OPERACIONAIS', '', formatAmount(report.totalExpenses)]);
        Object.entries(report.expenseCategories).forEach(([catName, cat]: [string, any]) => {
            data.push([`  ${catName}`, '', formatAmount(cat.total)]);
            Object.entries(cat.subcategories).forEach(([subName, total]: [string, any]) => {
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-900/60 backdrop-blur-sm p-0 sm:p-6 print:p-0 print:bg-white fade-in print:block">
            <div className="bg-white w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col h-full max-h-full sm:max-h-[90vh] sm:rounded-3xl print:max-h-none print:shadow-none print:h-auto print:rounded-none">

                {/* Cabeçalho */}
                <div className="p-4 sm:p-6 border-b border-slate-100 print:hidden space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 shrink-0 bg-brand-50 rounded-xl flex items-center justify-center text-brand-600">
                                <Building2 size={20} />
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-xl font-bold text-slate-900">DRE</h2>
                                <p className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-widest font-bold truncate">Demonstrativo de Resultado do Exercício</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            aria-label="Fechar"
                            className="w-11 h-11 shrink-0 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors"
                        >
                            <X size={22} />
                        </button>
                    </div>

                    {/* Ações: sempre com rótulo visível e alvo de toque grande, também no celular */}
                    <div className="flex items-stretch gap-2">
                        <button
                            onClick={handlePrint}
                            className="flex-1 flex items-center justify-center gap-2 h-12 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors text-xs sm:text-sm font-bold"
                        >
                            <Printer size={18} />
                            <span>Imprimir / PDF</span>
                        </button>
                        <button
                            onClick={handleExportExcel}
                            className="flex-1 flex items-center justify-center gap-2 h-12 px-3 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-xl transition-colors text-xs sm:text-sm font-bold"
                        >
                            <Download size={18} />
                            <span>Baixar Excel</span>
                        </button>
                        <button
                            onClick={() => setShowFilters(v => !v)}
                            className={`shrink-0 flex items-center justify-center gap-2 h-12 px-4 rounded-xl transition-colors text-xs sm:text-sm font-bold ${hasActiveFilters ? 'bg-brand-600 text-white shadow-md shadow-brand-500/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                        >
                            <SlidersHorizontal size={18} />
                            <span className="hidden sm:inline">Filtros</span>
                        </button>
                    </div>

                    {/* Filtros do DRE: tipo (receita/despesa), categoria e subcategoria */}
                    {showFilters && (
                        <div className="bg-slate-50 rounded-2xl p-4 space-y-4 border border-slate-100 animate-in fade-in slide-in-from-top-2 duration-150">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tipo</label>
                                <div className="flex bg-white p-1 rounded-xl gap-1 border border-slate-100">
                                    {([
                                        { id: 'ALL', label: 'Tudo' },
                                        { id: 'INCOME', label: 'Só Receitas' },
                                        { id: 'EXPENSE', label: 'Só Despesas' },
                                    ] as { id: DreTypeFilter; label: string }[]).map(opt => (
                                        <button
                                            key={opt.id}
                                            onClick={() => {
                                                setTypeFilter(opt.id);
                                                setCategoryFilter([]);
                                                setSubcategoryFilter([]);
                                            }}
                                            className={`flex-1 h-10 rounded-lg text-xs font-bold transition-all ${typeFilter === opt.id ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <SearchableMultiSelect
                                    label="Categoria"
                                    placeholder="Todas Categorias"
                                    searchPlaceholder="Buscar categoria..."
                                    icon={<Tag size={12} />}
                                    options={categoryOptions.map(c => ({ id: c, label: c }))}
                                    selected={categoryFilter}
                                    onChange={(v) => { setCategoryFilter(v); setSubcategoryFilter([]); }}
                                />
                                <SearchableMultiSelect
                                    label="Subcategoria"
                                    placeholder="Todas Subcategorias"
                                    searchPlaceholder="Buscar subcategoria..."
                                    icon={<Tag size={12} />}
                                    options={subcategoryOptions.map(s => ({ id: s, label: s }))}
                                    selected={subcategoryFilter}
                                    onChange={setSubcategoryFilter}
                                />
                            </div>

                            {hasActiveFilters && (
                                <button
                                    onClick={() => { setTypeFilter('ALL'); setCategoryFilter([]); setSubcategoryFilter([]); }}
                                    className="text-[10px] font-bold text-rose-500 hover:text-rose-700 uppercase tracking-widest"
                                >
                                    Limpar filtros do DRE
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Área Padrão para PDF (Visível apenas em print) */}
                <div className="hidden print:block p-8 border-b-2 border-slate-900 mb-6">
                    <h1 className="text-3xl font-black text-slate-900 mb-2">Zyvion</h1>
                    <h2 className="text-lg font-bold text-slate-600 uppercase tracking-widest">Demonstrativo de Resultado do Exercício (DRE)</h2>
                    <p className="text-sm text-slate-500 mt-4">Período: {report.period?.start || 'Início'} até {report.period?.end || 'Hoje'}</p>
                    {hasActiveFilters && (
                        <p className="text-xs text-slate-400 mt-1">
                            Filtros: {typeFilter === 'ALL' ? 'Tudo' : typeFilter === 'INCOME' ? 'Só Receitas' : 'Só Despesas'}
                            {categoryFilter.length > 0 ? ` · Categorias: ${categoryFilter.join(', ')}` : ''}
                            {subcategoryFilter.length > 0 ? ` · Subcategorias: ${subcategoryFilter.join(', ')}` : ''}
                        </p>
                    )}
                </div>

                {/* Conteúdo / Tabela */}
                <div className="p-4 sm:p-6 overflow-y-auto print:overflow-visible flex-1 print:p-8 space-y-6">

                    {/* Header Report Card */}
                    <div className={`grid grid-cols-1 ${typeFilter === 'ALL' ? 'md:grid-cols-3' : 'md:grid-cols-1'} gap-4 mb-8 print:mb-12`}>
                        {typeFilter !== 'EXPENSE' && (
                            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 print:border-slate-300">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Receita Bruta</p>
                                <p className="text-2xl font-black text-slate-900">{formatAmount(report.grossIncome)}</p>
                            </div>
                        )}
                        {typeFilter !== 'INCOME' && (
                            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 print:border-slate-300">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Despesas</p>
                                <p className="text-2xl font-black text-rose-500">{formatAmount(report.totalExpenses)}</p>
                            </div>
                        )}
                        {typeFilter === 'ALL' && (
                            <div className={`rounded-2xl p-5 border ${report.netIncome >= 0 ? 'bg-emerald-50 border-emerald-100 text-emerald-900 print:border-emerald-500' : 'bg-rose-50 border-rose-100 text-rose-900 print:border-rose-500'}`}>
                                <p className="text-xs font-bold opacity-70 uppercase tracking-widest mb-1">Resultado Líquido</p>
                                <div className="flex items-center gap-2">
                                    {report.netIncome >= 0 ? <TrendingUp size={24} className="opacity-80" /> : <TrendingDown size={24} className="opacity-80" />}
                                    <p className="text-2xl font-black">{formatAmount(report.netIncome)}</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {finalTxs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center text-center py-16 text-slate-400">
                            <Tag size={28} className="mb-3 opacity-40" />
                            <p className="text-sm font-bold">Nenhum lançamento encontrado com os filtros atuais.</p>
                            <p className="text-xs mt-1">Ajuste os filtros do DRE ou o período selecionado na tela de Transações.</p>
                        </div>
                    ) : (
                        <div className="w-full text-sm">

                            {/* 1. RECEITAS */}
                            {typeFilter !== 'EXPENSE' && (
                                <div className="mb-8">
                                    <div className="flex justify-between items-center py-3 border-b-2 border-slate-800 mb-2 font-black text-slate-900 uppercase tracking-wider">
                                        <span className="flex items-center gap-2"><ArrowUpRight size={16} /> I. Receita Operacional Bruta</span>
                                        <span>{formatAmount(report.grossIncome)}</span>
                                    </div>

                                    {Object.values(report.incomeCategories).length === 0 ? (
                                        <p className="text-xs text-slate-400 py-3">Nenhuma receita neste recorte.</p>
                                    ) : Object.values(report.incomeCategories).sort((a: any, b: any) => b.total - a.total).map((cat: any, idx) => (
                                        <div key={`inc-${idx}`} className="mb-2">
                                            <div className="flex justify-between py-2 border-b border-slate-100 font-bold text-slate-700">
                                                <span className="pl-4">{cat.categoryName}</span>
                                                <span>{formatAmount(cat.total)}</span>
                                            </div>
                                            {Object.entries(cat.subcategories).sort(([, a]: any, [, b]: any) => b - a).map(([sub, val]: any, subIdx) => (
                                                <div key={`inc-sub-${subIdx}`} className="flex justify-between py-1.5 border-b border-slate-50/50 text-slate-500 text-xs">
                                                    <span className="pl-12 flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-slate-300" /> {sub}</span>
                                                    <span>{formatAmount(val)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* 2. DESPESAS */}
                            {typeFilter !== 'INCOME' && (
                                <div className="mb-8">
                                    <div className="flex justify-between items-center py-3 border-b-2 border-rose-500 mb-2 font-black text-rose-600 uppercase tracking-wider">
                                        <span className="flex items-center gap-2"><ArrowDownRight size={16} /> II. (-) Despesas Operacionais</span>
                                        <span>{formatAmount(report.totalExpenses)}</span>
                                    </div>

                                    {Object.values(report.expenseCategories).length === 0 ? (
                                        <p className="text-xs text-slate-400 py-3">Nenhuma despesa neste recorte.</p>
                                    ) : Object.values(report.expenseCategories).sort((a: any, b: any) => b.total - a.total).map((cat: any, idx) => (
                                        <div key={`exp-${idx}`} className="mb-2">
                                            <div className="flex justify-between py-2 border-b border-slate-100 font-bold text-slate-700">
                                                <span className="pl-4">{cat.categoryName}</span>
                                                <span>{formatAmount(cat.total)}</span>
                                            </div>
                                            {Object.entries(cat.subcategories).sort(([, a]: any, [, b]: any) => b - a).map(([sub, val]: any, subIdx) => (
                                                <div key={`exp-sub-${subIdx}`} className="flex justify-between py-1.5 border-b border-slate-50/50 text-slate-500 text-xs text-rose-900/40 print:text-slate-600">
                                                    <span className="pl-12 flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-rose-200 print:bg-slate-300" /> {sub}</span>
                                                    <span>{formatAmount(val)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* RESULTADO LÍQUIDO (FINAL LINE) */}
                            {typeFilter === 'ALL' && (
                                <div className={`mt-8 flex justify-between items-center py-4 border-y-2 font-black text-lg uppercase tracking-wider ${report.netIncome >= 0 ? 'border-emerald-500 text-emerald-600' : 'border-rose-500 text-rose-600'}`}>
                                    <span>(=) Resultado Líquido do Período</span>
                                    <span>{formatAmount(report.netIncome)}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="hidden print:block text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-10 pt-4 border-t border-slate-200">
                    Gerado por Zyvion - Software de Excelência Financeira
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
