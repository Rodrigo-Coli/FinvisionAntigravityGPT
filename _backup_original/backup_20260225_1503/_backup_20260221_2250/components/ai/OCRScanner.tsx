import React from 'react';
import { Upload, Scan, FileText, Sparkles, Check, Loader2, Tag } from 'lucide-react';
import { DateUtils } from '../../lib/dateUtils';
import { ReconcileItem } from '../../types';

interface OCRScannerProps {
    isProcessing: boolean;
    fileInputRef: React.RefObject<HTMLInputElement>;
    handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    extractedData: ReconcileItem[];
    saveToQueue: () => void;
    saveStatus: 'idle' | 'saving' | 'done';
    formatCurrency: (val: number) => string;
}

export const OCRScanner: React.FC<OCRScannerProps> = ({
    isProcessing,
    fileInputRef,
    handleFileChange,
    extractedData,
    saveToQueue,
    saveStatus,
    formatCurrency
}) => {
    return (
        <div className="lg:col-span-2 space-y-8 animate-in fade-in duration-500">
            <div
                className={`bg-white border-2 border-dashed rounded-[40px] p-12 flex flex-col items-center justify-center transition-all min-h-[400px] group ${isProcessing
                    ? 'border-brand-400 bg-brand-50/20'
                    : 'border-slate-200 hover:border-brand-400 cursor-pointer hover:bg-slate-50/50'
                    }`}
                onClick={() => fileInputRef.current?.click()}
            >
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept=".pdf,.png,.jpg,.jpeg,.csv"
                />

                {isProcessing ? (
                    <div className="flex flex-col items-center text-center">
                        <div className="relative mb-8">
                            <Scan className="w-20 h-20 text-brand-600" />
                            <div className="absolute inset-0 border-t-2 border-brand-400 animate-scan"></div>
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 uppercase tracking-widest">Processando IA...</h3>
                        <p className="text-sm text-slate-400 mt-2 font-bold uppercase tracking-tighter">Extraindo vetores e metadados do documento</p>
                    </div>
                ) : (
                    <div className="text-center">
                        <div className="p-8 bg-slate-50 rounded-[32px] mb-8 text-slate-400 group-hover:text-brand-600 transition-all duration-500 transform group-hover:scale-110 group-hover:rotate-3 shadow-inner">
                            <Upload size={48} />
                        </div>
                        <h3 className="text-3xl font-black text-slate-900 mb-3 tracking-tight">Envie seu documento</h3>
                        <p className="text-slate-500 font-medium mb-10 max-w-sm mx-auto text-lg leading-relaxed">Extratos, cupons ou faturas. Nossa IA normaliza tudo instantaneamente.</p>
                        <button className="px-12 py-5 bg-slate-900 text-white rounded-[24px] font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-slate-900/40 hover:bg-brand-600 transition-all active:scale-95">
                            Selecionar Arquivo
                        </button>
                    </div>
                )}
            </div>

            {extractedData.length > 0 && (
                <div className="bg-white rounded-[40px] border border-slate-100 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 duration-700">
                    <div className="p-8 lg:p-10 border-b border-slate-50 flex flex-col sm:flex-row items-center justify-between gap-6">
                        <div>
                            <h3 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                                    <FileText size={20} />
                                </div>
                                Transações Identificadas
                            </h3>
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-2 flex items-center gap-2">
                                <Sparkles size={12} className="text-brand-500" />
                                Extraído via Gemini High-Performance
                            </p>
                        </div>

                        <button
                            onClick={saveToQueue}
                            disabled={saveStatus !== 'idle'}
                            className={`px-10 py-5 rounded-[20px] font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-3 w-full sm:w-auto active:scale-95 ${saveStatus === 'done'
                                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                                : 'bg-brand-600 text-white hover:bg-brand-700 shadow-xl shadow-brand-500/30'
                                }`}
                        >
                            {saveStatus === 'saving'
                                ? <Loader2 size={18} className="animate-spin" />
                                : saveStatus === 'done'
                                    ? <Check size={18} />
                                    : <Sparkles size={18} />
                            }
                            {saveStatus === 'saving'
                                ? 'Sincronizando...'
                                : saveStatus === 'done'
                                    ? 'Importação Concluída'
                                    : 'Enviar para Conciliação'
                            }
                        </button>
                    </div>

                    <div className="divide-y divide-slate-50">
                        {extractedData.map((item, i) => (
                            <div key={i} className="p-8 hover:bg-slate-50/50 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                <div className="flex items-center gap-6">
                                    <div className="w-14 h-14 bg-slate-50 rounded-2xl text-slate-400 flex items-center justify-center shadow-inner group-hover:text-brand-600 transition-colors">
                                        <Tag size={24} />
                                    </div>
                                    <div>
                                        <h4 className="text-lg font-black text-slate-900 mb-1">{item.description}</h4>
                                        <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                            <span>{DateUtils.formatDisplayDate(item.date)}</span>
                                            <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                                            <span className={`px-2.5 py-1 rounded-lg ${item.type === 'credit' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                                                {item.type === 'credit' ? 'Recebido' : 'Debitado'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right w-full sm:w-auto">
                                    <p className={`text-2xl font-black ${item.type === 'credit' ? 'text-emerald-600' : 'text-slate-900'}`}>
                                        {item.type === 'debit' ? '-' : ''}{formatCurrency(item.amount)}
                                    </p>
                                    <div className="mt-1 flex items-center justify-end gap-2">
                                        <span className="text-[9px] font-black text-slate-300 uppercase tracking-tighter">Confiança:</span>
                                        <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${item.confidence > 0.8 ? 'bg-emerald-400' : item.confidence > 0.5 ? 'bg-amber-400' : 'bg-rose-400'}`}
                                                style={{ width: `${Math.round((item.confidence || 0) * 100)}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
