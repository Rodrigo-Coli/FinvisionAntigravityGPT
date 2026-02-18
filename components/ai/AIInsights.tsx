import React from 'react';
import { Sparkles, TrendingDown, Info } from 'lucide-react';

export const AIInsights: React.FC = () => {
    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-1000">
            <div className="bg-gradient-to-br from-indigo-700 to-purple-800 p-10 rounded-[48px] text-white shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:rotate-12 transition-transform duration-700">
                    <Sparkles size={140} />
                </div>
                <h4 className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2 font-display">Potencial de Economia</h4>
                <p className="text-5xl font-black mb-6 tracking-tighter">R$ 142,50</p>
                <p className="text-sm opacity-80 leading-relaxed font-medium mb-8">
                    Nossa IA detectou que a troca de estabelecimento em itens de higiene pode gerar <span className="text-emerald-300 font-black">12% de economia</span> no seu fechamento mensal.
                </p>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase bg-white/10 p-3.5 rounded-2xl backdrop-blur-md border border-white/10 w-fit">
                    <TrendingDown size={14} className="text-emerald-300" />
                    Insight Inteligente Ativo
                </div>
            </div>

            <div className="bg-white p-10 rounded-[48px] border border-slate-200/50 shadow-sm relative overflow-hidden group">
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-slate-50 rounded-full group-hover:scale-150 transition-transform duration-1000 opacity-50"></div>
                <h4 className="font-black text-slate-400 uppercase tracking-widest text-[10px] mb-8 flex items-center gap-2 relative z-10">
                    <Info size={16} className="text-brand-600" />
                    Guia de Operação
                </h4>
                <ul className="space-y-6 text-sm font-medium text-slate-600 relative z-10">
                    <li className="flex gap-4 group/item">
                        <span className="w-6 h-6 bg-slate-100 text-slate-900 rounded-lg flex items-center justify-center shrink-0 font-black text-[10px] group-hover/item:bg-brand-600 group-hover/item:text-white transition-colors">1</span>
                        <p className="leading-relaxed">Arraste seus comprovantes ou faturas para extração automática.</p>
                    </li>
                    <li className="flex gap-4 group/item">
                        <span className="w-6 h-6 bg-slate-100 text-slate-900 rounded-lg flex items-center justify-center shrink-0 font-black text-[10px] group-hover/item:bg-brand-600 group-hover/item:text-white transition-colors">2</span>
                        <p className="leading-relaxed">A IA normaliza e categoriza os itens usando modelos Gemini Flash.</p>
                    </li>
                    <li className="flex gap-4 group/item">
                        <span className="w-6 h-6 bg-slate-100 text-slate-900 rounded-lg flex items-center justify-center shrink-0 font-black text-[10px] group-hover/item:bg-brand-600 group-hover/item:text-white transition-colors">3</span>
                        <p className="leading-relaxed">Envie para sua fila de conciliação para manter o saldo atualizado.</p>
                    </li>
                </ul>
            </div>
        </div>
    );
};
