import React from 'react';
import { Mic, MicOff, MessageSquareQuote } from 'lucide-react';
import { TranscriptionEntry } from '../../services/geminiLive.service';

interface VoiceAssistantProps {
    isVoiceActive: boolean;
    toggleVoiceAssistant: () => void;
    voiceHistory: TranscriptionEntry[];
    scrollRef: React.RefObject<HTMLDivElement>;
}

export const VoiceAssistant: React.FC<VoiceAssistantProps> = ({
    isVoiceActive,
    toggleVoiceAssistant,
    voiceHistory,
    scrollRef
}) => {
    return (
        <div className="lg:col-span-3 space-y-6 animate-in fade-in duration-700">
            <div className="bg-white rounded-[48px] border border-slate-200/50 shadow-2xl overflow-hidden flex flex-col md:flex-row h-[650px]">
                {/* Left Side: Control Panel */}
                <div className="md:w-[380px] bg-slate-900 p-12 flex flex-col justify-between text-white relative">
                    <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none">
                        <Mic size={240} />
                    </div>

                    <div className="relative z-10">
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-500/20 text-brand-400 rounded-full text-[9px] font-black uppercase tracking-[0.2em] mb-6 border border-brand-500/20">
                            <div className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse"></div>
                            Gemini Live v2.5
                        </div>
                        <h3 className="text-4xl font-black tracking-tight mb-6 leading-tight">Assistente <br /><span className="text-brand-400 italic">Conversacional</span></h3>
                        <p className="text-slate-400 leading-relaxed font-medium">
                            Sua gestão financeira através do diálogo. Analise seus gastos, peça previsões ou receba dicas de economia em tempo real.
                        </p>
                    </div>

                    <div className="relative z-10 space-y-6">
                        <div className="p-6 bg-white/5 rounded-[32px] border border-white/5 backdrop-blur-sm">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4">Exemplos de comando</h4>
                            <ul className="space-y-3 text-[11px] font-bold text-slate-300">
                                <li className="flex gap-2">
                                    <span className="text-brand-400">“</span> Como foi meu gasto com lazer esse mês?
                                </li>
                                <li className="flex gap-2">
                                    <span className="text-brand-400">“</span> Qual o vencimento das minhas faturas?
                                </li>
                                <li className="flex gap-2">
                                    <span className="text-brand-400">“</span> Como posso economizar 500 reais?
                                </li>
                            </ul>
                        </div>

                        <button
                            onClick={toggleVoiceAssistant}
                            className={`w-full py-6 rounded-[24px] font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-4 group active:scale-95 ${isVoiceActive
                                    ? 'bg-rose-600 hover:bg-rose-700 shadow-2xl shadow-rose-900/40'
                                    : 'bg-brand-600 hover:bg-brand-700 shadow-2xl shadow-brand-900/40'
                                }`}
                        >
                            {isVoiceActive ? <MicOff size={24} className="animate-pulse" /> : <Mic size={24} className="group-hover:scale-110 transition-transform" />}
                            {isVoiceActive ? 'Silenciar Agora' : 'Ativar Inteligência'}
                        </button>
                        <p className="text-[9px] text-center text-slate-500 font-black uppercase tracking-widest opacity-50">
                            Processamento seguro por voz
                        </p>
                    </div>
                </div>

                {/* Right Side: Chat Interface */}
                <div className="flex-1 bg-slate-50/50 p-10 flex flex-col relative">
                    <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-100">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white rounded-xl shadow-sm text-slate-400 flex items-center justify-center">
                                <MessageSquareQuote size={20} />
                            </div>
                            <h4 className="font-black text-slate-900 text-xs uppercase tracking-widest">Diálogo em Tempo Real</h4>
                        </div>
                        {isVoiceActive && (
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-black uppercase">
                                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></div>
                                Ativo
                            </div>
                        )}
                    </div>

                    <div
                        ref={scrollRef}
                        className="flex-1 overflow-y-auto space-y-8 pr-6 scrollbar-hide"
                    >
                        {voiceHistory.length === 0 && !isVoiceActive && (
                            <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-6 opacity-30">
                                <div className="w-24 h-24 bg-white rounded-[40px] flex items-center justify-center shadow-inner">
                                    <Mic size={48} />
                                </div>
                                <div className="text-center space-y-2">
                                    <p className="font-black uppercase tracking-[0.2em] text-sm">Aguardando ativação</p>
                                    <p className="text-xs font-bold italic">“Pressione o botão para iniciar uma consulta por voz”</p>
                                </div>
                            </div>
                        )}

                        {isVoiceActive && voiceHistory.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center gap-6">
                                <div className="flex gap-1.5 items-end h-12">
                                    {[...Array(8)].map((_, i) => (
                                        <div key={i} className="w-1.5 bg-brand-500 rounded-full animate-voice-wave" style={{ animationDelay: `${i * 0.1}s` }}></div>
                                    ))}
                                </div>
                                <p className="font-black uppercase tracking-[0.2em] text-[10px] text-brand-600 animate-pulse">Estou ouvindo você...</p>
                            </div>
                        )}

                        {voiceHistory.map((entry, idx) => (
                            <div key={idx} className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>
                                <div className={`max-w-[85%] p-7 rounded-[32px] shadow-sm relative ${entry.role === 'user'
                                        ? 'bg-brand-600 text-white rounded-tr-none'
                                        : 'bg-white text-slate-900 rounded-tl-none border border-slate-100'
                                    }`}>
                                    <p className="text-[15px] font-medium leading-relaxed tracking-tight">{entry.text}</p>
                                    <div className={`mt-4 flex items-center gap-2 ${entry.role === 'user' ? 'text-brand-200' : 'text-slate-400'}`}>
                                        <span className="text-[8px] font-black uppercase tracking-widest">
                                            {entry.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
